'use strict';

const repos = require('../database/repos');
const reposEmpresa = require('../database/reposEmpresa');
const reposAgendamento = require('../database/reposAgendamento');
const { ESTADO } = require('./states');
const T = require('../whatsapp/templates');
const { parseHorariosConfig, slotFromChoice, slotsHorarioText } = require('./horariosHelper');
const { notifyGerenteNovoPendente } = require('./operadorFlow');

function getDados(sessao) {
  const d = sessao.dados_temporarios;
  if (d && typeof d === 'object') return { ...d };
  try {
    return typeof d === 'string' ? JSON.parse(d || '{}') : {};
  } catch {
    return {};
  }
}

async function loadBotContext() {
  const [empresa, cfg] = await Promise.all([
    reposEmpresa.findEmpresaById(1),
    reposAgendamento.getConfig(),
  ]);
  const nomeMarca = empresa && empresa.nome ? String(empresa.nome).trim() : 'Sua empresa';
  let mensagemBoasVindas = null;
  if (cfg && cfg.mensagem_boas_vindas && String(cfg.mensagem_boas_vindas).trim()) {
    mensagemBoasVindas = String(cfg.mensagem_boas_vindas).trim();
  }
  const slots = parseHorariosConfig(cfg && cfg.horarios_disponiveis);
  return { nomeMarca, mensagemBoasVindas, slots };
}

/**
 * processarMensagem — lógica da máquina de estados + persistência (pontos 2–5 do documento)
 */
async function processarMensagem({ cliente, sessao, texto }) {
  const ctx = await loadBotContext();
  const msg = String(texto || '').trim();
  const dados = getDados(sessao);
  const estado = sessao.estado_atual;
  const clienteId = cliente.id;

  let novoEstado = estado;
  let novosDados = dados;
  const respostas = [];
  let historico = null;

  const gravarHistorico = (estado_anterior, estado_novo, mensagem_trigger, metadata) => {
    historico = { estado_anterior, estado_novo, mensagem_trigger, metadata: metadata || {} };
  };

  if (estado === ESTADO.AGUARDANDO_NOME) {
    if (!msg) {
      respostas.push('Por favor, envie seu nome.');
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    await repos.updateClienteNome(clienteId, msg);
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    novoEstado = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
    gravarHistorico(estado, novoEstado, msg, { nome: msg });
    respostas.push(`Olá, ${msg}!`);
    respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : T.menuSemAgendamento(ctx.nomeMarca));
    return { respostas, novoEstado, novosDados: {}, historico };
  }

  if (estado === ESTADO.MENU_SEM_AGENDAMENTO) {
    if (msg === '1') {
      novoEstado = ESTADO.SELECIONANDO_HORARIO;
      novosDados = { ...dados, ultimo_menu: 'SELECIONANDO_HORARIO' };
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado, novosDados, historico };
    }
    if (msg === '2') {
      novoEstado = ESTADO.POS_ACAO;
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push('Um atendente irá responder em breve. Obrigado!');
      return { respostas, novoEstado, novosDados: dados, historico };
    }
    if (msg === '3') {
      novoEstado = ESTADO.CONVERSA_ENCERRADA;
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push('Até logo!');
      return { respostas, novoEstado, novosDados: dados, historico };
    }
    respostas.push(T.menuSemAgendamento(ctx.nomeMarca));
    return { respostas, novoEstado, novosDados: dados, historico: null };
  }

  if (estado === ESTADO.MENU_COM_AGENDAMENTO) {
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    if (msg === '1' && ativo) {
      respostas.push(
        `Agendamento: ${ativo.servico || 'Serviço'}\nData: ${new Date(ativo.horario).toLocaleString('pt-BR')}\nDescrição: ${ativo.descricao || '-'}`
      );
      respostas.push(T.menuComAgendamento(ctx.nomeMarca));
      return { respostas, novoEstado, novosDados: dados, historico: null };
    }
    if (msg === '2' && ativo) {
      novoEstado = ESTADO.REAGENDANDO_HORARIO;
      novosDados = { ...dados, agendamento_id_reagendar: ativo.id, intencao_substituir: true };
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push('Escolha o novo horário:\n\n' + slotsHorarioText(ctx.slots));
      return { respostas, novoEstado, novosDados, historico };
    }
    if (msg === '3') {
      novoEstado = ESTADO.CANCELANDO_MOTIVO;
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push('Informe o motivo do cancelamento.');
      return { respostas, novoEstado, novosDados: dados, historico };
    }
    if (msg === '4') {
      novoEstado = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
      respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : T.menuSemAgendamento(ctx.nomeMarca));
      return { respostas, novoEstado, novosDados: dados, historico: null };
    }
    respostas.push(T.menuComAgendamento(ctx.nomeMarca));
    return { respostas, novoEstado, novosDados: dados, historico: null };
  }

  if (estado === ESTADO.SELECIONANDO_HORARIO) {
    if (!msg) {
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    const choice = slotFromChoice(msg, ctx.slots);
    if (!choice) {
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    const { horario, label } = choice;
    novoEstado = ESTADO.DIGITANDO_SERVICO;
    novosDados = { ...dados, horario_selecionado: label, horario_iso: horario.toISOString(), ultimo_menu: 'DIGITANDO_SERVICO' };
    gravarHistorico(estado, novoEstado, msg, { slot: label });
    respostas.push('Descreva o serviço desejado (ex.: lavagem simples, completa, polimento).');
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.DIGITANDO_SERVICO) {
    if (!msg) {
      respostas.push('Envie uma descrição do serviço.');
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    novoEstado = ESTADO.CONFIRMANDO_AGENDAMENTO;
    novosDados = { ...dados, descricao: msg, servico_line: 'Lavagem' };
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push(T.confirmarAgendamento({ horarioLabel: dados.horario_selecionado || '-', descricao: msg }));
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.CONFIRMANDO_AGENDAMENTO) {
    if (msg === '1') {
      if (!dados.horario_iso) {
        respostas.push('Horário não encontrado. Escolha de novo.');
        novoEstado = ESTADO.SELECIONANDO_HORARIO;
        respostas.push(slotsHorarioText(ctx.slots));
        return { respostas, novoEstado, novosDados: dados, historico: null };
      }
      const horario = new Date(dados.horario_iso);
      const ag = await repos.insertAgendamento({
        cliente_id: clienteId,
        horario,
        servico: dados.servico_line || 'Lavagem',
        origem: 'whatsapp',
        descricao: dados.descricao || '',
        status: 'pendente',
      });
      await repos.insertLembretesParaAgendamento({
        cliente_id: clienteId,
        agendamento_id: ag.id,
        horario,
      });
      const clienteRow = await repos.findClienteById(clienteId);
      if (clienteRow) {
        await notifyGerenteNovoPendente(ag, clienteRow);
      }
      novoEstado = ESTADO.POS_ACAO;
      novosDados = {};
      gravarHistorico(estado, novoEstado, msg, { agendamento_id: ag.id });
      respostas.push('Agendamento registrado! Obrigado.');
      respostas.push(T.menuComAgendamento(ctx.nomeMarca));
      return { respostas, novoEstado, novosDados, historico };
    }
    if (msg === '2') {
      novoEstado = ESTADO.SELECIONANDO_HORARIO;
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado, novosDados: dados, historico };
    }
    respostas.push(T.confirmarAgendamento({ horarioLabel: dados.horario_selecionado || '-', descricao: dados.descricao || '-' }));
    return { respostas, novoEstado, novosDados: dados, historico: null };
  }

  if (estado === ESTADO.REAGENDANDO_HORARIO) {
    if (!msg) {
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    const choice = slotFromChoice(msg, ctx.slots);
    if (!choice) {
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    const { horario, label } = choice;
    novoEstado = ESTADO.REAGENDANDO_DESCRICAO;
    novosDados = { ...dados, horario_selecionado: label, horario_iso: horario.toISOString(), reagendando: true };
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push('Descreva o serviço para o novo horário (ou envie "ok" para manter o mesmo).');
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.REAGENDANDO_DESCRICAO) {
    const origId = dados.agendamento_id_reagendar;
    const orig = origId ? await repos.findAgendamentoById(origId) : await repos.findAgendamentoAtivoPorCliente(clienteId);
    if (!orig) {
      novoEstado = ESTADO.MENU_SEM_AGENDAMENTO;
      respostas.push('Não encontramos agendamento. ' + T.menuSemAgendamento(ctx.nomeMarca));
      return { respostas, novoEstado, novosDados: {}, historico: null };
    }
    const horario = new Date(dados.horario_iso);
    const descricao = msg.toLowerCase() === 'ok' ? orig.descricao : msg;
    const novo = await repos.insertAgendamento({
      cliente_id: clienteId,
      horario,
      servico: orig.servico || 'Lavagem',
      descricao: descricao || '',
      status: 'pendente',
      reagendado_de_id: orig.id,
      origem: 'whatsapp',
    });
    await repos.updateAgendamentoReagendado(orig.id, novo.id, orig.status);
    await repos.cancelarLembretesPendentes(orig.id);
    await repos.insertLembretesParaAgendamento({
      cliente_id: clienteId,
      agendamento_id: novo.id,
      horario,
    });
    novoEstado = ESTADO.POS_ACAO;
    novosDados = {};
    gravarHistorico(estado, novoEstado, msg, { novo_id: novo.id });
    respostas.push('Reagendamento concluído. Obrigado!');
    respostas.push(T.menuComAgendamento(ctx.nomeMarca));
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.CANCELANDO_MOTIVO) {
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    if (!ativo) {
      novoEstado = ESTADO.POS_ACAO;
      respostas.push('Não há agendamento ativo. ' + T.menuSemAgendamento(ctx.nomeMarca));
      return { respostas, novoEstado, novosDados: {}, historico: null };
    }
    await repos.updateAgendamentoCancelar(ativo.id, ativo.status, msg);
    await repos.cancelarLembretesPendentes(ativo.id);
    novoEstado = ESTADO.POS_ACAO;
    novosDados = {};
    gravarHistorico(estado, novoEstado, msg, { motivo: msg });
    respostas.push('Agendamento cancelado. Obrigado!');
    respostas.push(T.menuSemAgendamento(ctx.nomeMarca));
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.POS_ACAO) {
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    novoEstado = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : T.menuSemAgendamento(ctx.nomeMarca));
    return { respostas, novoEstado, novosDados: {}, historico };
  }

  if (estado === ESTADO.CONVERSA_ENCERRADA) {
    respostas.push('Conversa encerrada. Envie qualquer mensagem para recomeçar.');
    novoEstado = ESTADO.AGUARDANDO_NOME;
    gravarHistorico(estado, novoEstado, msg, {});
    return { respostas, novoEstado, novosDados: {}, historico };
  }

  novoEstado = ESTADO.AGUARDANDO_NOME;
  const welcome =
    ctx.mensagemBoasVindas ||
    `Bem-vindo à ${ctx.nomeMarca}! Qual é seu nome?`;
  respostas.push(welcome);
  return { respostas, novoEstado, novosDados: {}, historico: null };
}

module.exports = { processarMensagem };
