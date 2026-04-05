'use strict';

const repos = require('../database/repos');
const reposEmpresa = require('../database/reposEmpresa');
const reposAgendamento = require('../database/reposAgendamento');
const { ESTADO } = require('./states');
const T = require('../whatsapp/templates');
const { slotFromChoice, slotsHorarioText, getDaySlotsForNlp, computeAvailableSlots } = require('./horariosHelper');
const { notifyGerenteNovoPendente } = require('./operadorFlow');

// Palavras que reiniciam o fluxo com saudação
const RESTART_WORDS = new Set([
  'oi', 'olá', 'ola', 'oii', 'oiii', 'hey', 'hi',
  'menu', 'inicio', 'início', 'comecar', 'começar', 'reiniciar', 'recomeçar', 'recomecar',
  'bom dia', 'boa tarde', 'boa noite', 'bom dia!', 'boa tarde!', 'boa noite!',
  'oi!', 'olá!', 'ola!',
]);

// Palavras que cancelam explicitamente a interação em curso
const CANCEL_WORDS = new Set([
  'cancelar', 'cancel', 'sair', 'parar', 'pare', 'para',
  'voltar', 'volta', 'desistir', 'desisto', 'encerrar', 'fechar',
  '0', '#', '*',
]);

function isRestartMessage(msg) {
  const norm = String(msg || '').toLowerCase().trim().replace(/!+$/, '');
  return RESTART_WORDS.has(norm);
}

function isCancelMessage(msg) {
  const norm = String(msg || '').toLowerCase().trim().replace(/!+$/, '');
  return CANCEL_WORDS.has(norm);
}

// Estados que NÃO devem ser interrompidos por restart/cancel silencioso
const ESTADOS_NAO_INTERROMPIVEIS = new Set([
  ESTADO.CONFIRMANDO_AGENDAMENTO,
  ESTADO.REAGENDANDO_DESCRICAO,
  ESTADO.CANCELANDO_MOTIVO,
]);

// Estados intermediários onde o timeout de inatividade se aplica
const ESTADOS_COM_FLUXO_ATIVO = new Set([
  ESTADO.SELECIONANDO_SERVICO,
  ESTADO.SELECIONANDO_HORARIO,
  ESTADO.CONFIRMANDO_AGENDAMENTO,
  ESTADO.DIGITANDO_SERVICO,
  ESTADO.REAGENDANDO_HORARIO,
  ESTADO.REAGENDANDO_DESCRICAO,
  ESTADO.CANCELANDO_MOTIVO,
]);

// Timeout de inatividade: 5 minutos
const INATIVIDADE_TIMEOUT_MS = 5 * 60 * 1000;

function getDados(sessao) {
  const d = sessao.dados_temporarios;
  if (d && typeof d === 'object') return { ...d };
  try {
    return typeof d === 'string' ? JSON.parse(d || '{}') : {};
  } catch {
    return {};
  }
}

function servicosText(servicos) {
  if (!servicos || !servicos.length) {
    return 'Nenhum serviço cadastrado. Entre em contato com o atendente.';
  }
  const lines = ['*Escolha o serviço:*', ''];
  servicos.forEach((s, i) => {
    lines.push(`${i + 1}) ${s.nome}`);
  });
  lines.push('', '_Digite o número do serviço_');
  return lines.join('\n');
}

/**
 * Texto de desambiguação para um único dia (quando user digitou só o nome do dia).
 * Ex: "*Segunda-feira, 07/04*\nQual horário?\n\n1) 08:00\n2) 14:00"
 */
function dayDisambigText(dayStr, dateStr, daySlots) {
  const lines = [`*${dayStr}, ${dateStr}*`, 'Qual horário?', ''];
  daySlots.forEach((s, i) => {
    const hh = String(s.hour).padStart(2, '0');
    const mm = String(s.minute || 0).padStart(2, '0');
    lines.push(`${i + 1}) ${hh}:${mm}`);
  });
  return lines.join('\n');
}

/**
 * Monta { horario: Date, label: string } a partir de um slot.
 * Suporta slots concretos (com date) e legados (com daysFromNow).
 */
function slotToChoice(slot) {
  if (slot.date instanceof Date) {
    return { horario: slot.date, label: slot.label };
  }
  const dt = new Date();
  dt.setDate(dt.getDate() + (slot.daysFromNow || 0));
  dt.setHours(slot.hour, slot.minute || 0, 0, 0);
  const hh = String(slot.hour).padStart(2, '0');
  const mm = String(slot.minute || 0).padStart(2, '0');
  return { horario: dt, label: slot.label || `Slot ${hh}:${mm}` };
}

async function loadBotContext() {
  const [empresa, cfg, servicos, bookedMap] = await Promise.all([
    reposEmpresa.findEmpresaById(1),
    reposAgendamento.getConfig(),
    reposAgendamento.listServicos(),
    reposAgendamento.listAgendamentosHorariosOcupados(14),
  ]);
  const nomeMarca = empresa && empresa.nome ? String(empresa.nome).trim() : 'Sua empresa';
  let mensagemBoasVindas = null;
  if (cfg && cfg.mensagem_boas_vindas && String(cfg.mensagem_boas_vindas).trim()) {
    mensagemBoasVindas = String(cfg.mensagem_boas_vindas).trim();
  }
  const vagasPorSlot = cfg && cfg.vagas_por_slot ? Math.max(1, Number(cfg.vagas_por_slot)) : 1;
  const slots = computeAvailableSlots(
    cfg && cfg.horarios_disponiveis,
    bookedMap,
    vagasPorSlot,
    14
  );
  return { nomeMarca, mensagemBoasVindas, slots, servicos: servicos || [] };
}

/**
 * processarMensagem — máquina de estados do bot
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

  // Menu principal — usa mensagem_boas_vindas se configurada, senão fallback hardcoded
  const menuPrincipal = ctx.mensagemBoasVindas || T.menuSemAgendamento(ctx.nomeMarca);

  // ── Timeout de inatividade (5 min) ─────────────────────────────────────────
  if (ESTADOS_COM_FLUXO_ATIVO.has(estado) && sessao.updated_at) {
    const ultimaAt = new Date(sessao.updated_at);
    if (Date.now() - ultimaAt.getTime() > INATIVIDADE_TIMEOUT_MS) {
      const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
      const novoEstadoTimeout = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
      gravarHistorico(estado, novoEstadoTimeout, msg, { timeout: true });
      respostas.push('_Sua sessão anterior expirou por inatividade._\n\n' + (ativo ? T.menuComAgendamento(ctx.nomeMarca) : menuPrincipal));
      return { respostas, novoEstado: novoEstadoTimeout, novosDados: {}, historico };
    }
  }

  // ── Cancelamento explícito ("cancelar", "sair", "0", etc.) ──────────────────
  if (isCancelMessage(msg) && !ESTADOS_NAO_INTERROMPIVEIS.has(estado)) {
    // Se estava no meio de um fluxo, avisa e volta ao menu
    if (ESTADOS_COM_FLUXO_ATIVO.has(estado)) {
      const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
      const novoEstadoCancel = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
      gravarHistorico(estado, novoEstadoCancel, msg, { cancelado: true });
      respostas.push('Operação cancelada.\n\n' + (ativo ? T.menuComAgendamento(ctx.nomeMarca) : menuPrincipal));
      return { respostas, novoEstado: novoEstadoCancel, novosDados: {}, historico };
    }
  }

  // ── Reinício do fluxo: saudação ou palavra-chave de menu ────────────────────
  if (isRestartMessage(msg) && !ESTADOS_NAO_INTERROMPIVEIS.has(estado)) {
    if (!cliente.nome && cliente.whatsapp_name) {
      await repos.updateClienteNome(clienteId, cliente.whatsapp_name);
    }
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    const novoEstadoRestart = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
    gravarHistorico(estado, novoEstadoRestart, msg, { restart: true });
    respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : menuPrincipal);
    return { respostas, novoEstado: novoEstadoRestart, novosDados: {}, historico };
  }

  if (estado === ESTADO.AGUARDANDO_NOME) {
    // Não pede nome — usa nome do WhatsApp automaticamente
    if (!cliente.nome && cliente.whatsapp_name) {
      await repos.updateClienteNome(clienteId, cliente.whatsapp_name);
    }
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    novoEstado = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : menuPrincipal);
    return { respostas, novoEstado, novosDados: {}, historico };
  }

  if (estado === ESTADO.MENU_SEM_AGENDAMENTO) {
    if (msg === '1') {
      novoEstado = ESTADO.SELECIONANDO_SERVICO;
      novosDados = { ...dados };
      gravarHistorico(estado, novoEstado, msg, {});
      respostas.push(servicosText(ctx.servicos));
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
    respostas.push(menuPrincipal);
    return { respostas, novoEstado, novosDados: dados, historico: null };
  }

  if (estado === ESTADO.SELECIONANDO_SERVICO) {
    const n = parseInt(msg, 10);
    const servico = Number.isFinite(n) && n > 0 ? ctx.servicos[n - 1] : null;
    if (!servico) {
      respostas.push(servicosText(ctx.servicos));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    novoEstado = ESTADO.SELECIONANDO_HORARIO;
    novosDados = { ...dados, servico_id: servico.id, servico_nome: servico.nome };
    gravarHistorico(estado, novoEstado, msg, { servico: servico.nome });
    respostas.push(slotsHorarioText(ctx.slots));
    return { respostas, novoEstado, novosDados, historico };
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
      respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : menuPrincipal);
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

    // Desambiguação de dia pendente: user já informou o dia, agora escolhe o horário (1, 2, ...)
    if (dados._dia_pendente_dow !== undefined) {
      const pendingDow = Number(dados._dia_pendente_dow);
      const daySlots = ctx.slots.filter(s => {
        const dt = new Date(); dt.setDate(dt.getDate() + (s.daysFromNow || 0)); return dt.getDay() === pendingDow;
      });
      const n = parseInt(msg, 10);
      const slot = Number.isFinite(n) && n > 0 ? daySlots[n - 1] : null;
      if (slot) {
        const { _dia_pendente_dow: _r, ...cleanDados } = dados;
        const choice = slotToChoice(slot);
        novoEstado = ESTADO.CONFIRMANDO_AGENDAMENTO;
        novosDados = { ...cleanDados, horario_selecionado: choice.label, horario_iso: choice.horario.toISOString() };
        gravarHistorico(estado, novoEstado, msg, { slot: choice.label });
        respostas.push(T.confirmarAgendamento({ horarioLabel: choice.label, descricao: dados.servico_nome || '-' }));
        return { respostas, novoEstado, novosDados, historico };
      }
      // Seleção inválida — re-exibir opções do dia
      if (daySlots.length) {
        const dt0 = new Date(); dt0.setDate(dt0.getDate() + daySlots[0].daysFromNow);
        const wd = dt0.toLocaleDateString('pt-BR', { weekday: 'long' });
        const ds = wd.charAt(0).toUpperCase() + wd.slice(1);
        const dts = dt0.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        respostas.push(dayDisambigText(ds, dts, daySlots));
      } else {
        respostas.push(slotsHorarioText(ctx.slots));
      }
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }

    // Texto sem dígitos → pode ser nome do dia (ex: "segunda", "seg", "terça")
    if (!/\d/.test(msg)) {
      const dayInfo = getDaySlotsForNlp(msg, ctx.slots);
      if (dayInfo) {
        if (dayInfo.daySlots.length === 1) {
          // Único horário nesse dia — confirma direto
          const choice = slotToChoice(dayInfo.daySlots[0]);
          novoEstado = ESTADO.CONFIRMANDO_AGENDAMENTO;
          novosDados = { ...dados, horario_selecionado: choice.label, horario_iso: choice.horario.toISOString() };
          gravarHistorico(estado, novoEstado, msg, { slot: choice.label });
          respostas.push(T.confirmarAgendamento({ horarioLabel: choice.label, descricao: dados.servico_nome || '-' }));
          return { respostas, novoEstado, novosDados, historico };
        }
        // Múltiplos horários nesse dia — pede qual
        respostas.push(dayDisambigText(dayInfo.dayStr, dayInfo.dateStr, dayInfo.daySlots));
        novosDados = { ...dados, _dia_pendente_dow: dayInfo.dow };
        return { respostas, novoEstado: estado, novosDados, historico: null };
      }
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }

    // Texto com dígitos → número de slot ou NLP com hora (ex: "1", "seg 08:00", "segunda 8h")
    const choice = slotFromChoice(msg, ctx.slots);
    if (!choice) {
      // Se mencionou um dia + hora fora da faixa, avisa explicitamente
      const normMsg = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const temDia = /segunda|terca|quarta|quinta|sexta|sabado|\bseg\b|\bter\b|\bqua\b|\bqui\b|\bsex\b|\bsab\b/.test(normMsg);
      if (temDia) respostas.push('⚠️ Horário não disponível. Escolha um dos horários abaixo:');
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }
    const { horario, label } = choice;
    novoEstado = ESTADO.CONFIRMANDO_AGENDAMENTO;
    novosDados = { ...dados, horario_selecionado: label, horario_iso: horario.toISOString() };
    gravarHistorico(estado, novoEstado, msg, { slot: label });
    respostas.push(T.confirmarAgendamento({ horarioLabel: label, descricao: dados.servico_nome || '-' }));
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.DIGITANDO_SERVICO) {
    // Estado legado — redireciona para seleção de serviço se possível
    if (!msg) {
      respostas.push(servicosText(ctx.servicos));
      novoEstado = ESTADO.SELECIONANDO_SERVICO;
      return { respostas, novoEstado, novosDados: dados, historico: null };
    }
    // Aceita texto livre como nome do serviço (compatibilidade com sessões antigas)
    novoEstado = ESTADO.CONFIRMANDO_AGENDAMENTO;
    novosDados = { ...dados, servico_nome: msg };
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push(T.confirmarAgendamento({ horarioLabel: dados.horario_selecionado || '-', descricao: msg }));
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.CONFIRMANDO_AGENDAMENTO) {
    if (msg === '1') {
      if (!dados.horario_iso) {
        novoEstado = ESTADO.SELECIONANDO_HORARIO;
        respostas.push(slotsHorarioText(ctx.slots));
        return { respostas, novoEstado, novosDados: dados, historico: null };
      }
      const horario = new Date(dados.horario_iso);
      const ag = await repos.insertAgendamento({
        cliente_id: clienteId,
        horario,
        servico: dados.servico_nome || 'Serviço',
        origem: 'whatsapp',
        descricao: dados.servico_nome || '',
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
    respostas.push(T.confirmarAgendamento({ horarioLabel: dados.horario_selecionado || '-', descricao: dados.servico_nome || '-' }));
    return { respostas, novoEstado, novosDados: dados, historico: null };
  }

  if (estado === ESTADO.REAGENDANDO_HORARIO) {
    if (!msg) {
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }

    // Desambiguação de dia pendente (mesma lógica de SELECIONANDO_HORARIO)
    if (dados._dia_pendente_dow !== undefined) {
      const pendingDow = Number(dados._dia_pendente_dow);
      const daySlots = ctx.slots.filter(s => {
        const dt = new Date(); dt.setDate(dt.getDate() + (s.daysFromNow || 0)); return dt.getDay() === pendingDow;
      });
      const n = parseInt(msg, 10);
      const slot = Number.isFinite(n) && n > 0 ? daySlots[n - 1] : null;
      if (slot) {
        const { _dia_pendente_dow: _r, ...cleanDados } = dados;
        const choice = slotToChoice(slot);
        novoEstado = ESTADO.REAGENDANDO_DESCRICAO;
        novosDados = { ...cleanDados, horario_selecionado: choice.label, horario_iso: choice.horario.toISOString(), reagendando: true };
        gravarHistorico(estado, novoEstado, msg, {});
        respostas.push('Descreva o serviço para o novo horário (ou envie "ok" para manter o mesmo).');
        return { respostas, novoEstado, novosDados, historico };
      }
      if (daySlots.length) {
        const dt0 = new Date(); dt0.setDate(dt0.getDate() + daySlots[0].daysFromNow);
        const wd = dt0.toLocaleDateString('pt-BR', { weekday: 'long' });
        const ds = wd.charAt(0).toUpperCase() + wd.slice(1);
        const dts = dt0.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        respostas.push(dayDisambigText(ds, dts, daySlots));
      } else {
        respostas.push(slotsHorarioText(ctx.slots));
      }
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }

    if (!/\d/.test(msg)) {
      const dayInfo = getDaySlotsForNlp(msg, ctx.slots);
      if (dayInfo) {
        if (dayInfo.daySlots.length === 1) {
          const choice = slotToChoice(dayInfo.daySlots[0]);
          novoEstado = ESTADO.REAGENDANDO_DESCRICAO;
          novosDados = { ...dados, horario_selecionado: choice.label, horario_iso: choice.horario.toISOString(), reagendando: true };
          gravarHistorico(estado, novoEstado, msg, {});
          respostas.push('Descreva o serviço para o novo horário (ou envie "ok" para manter o mesmo).');
          return { respostas, novoEstado, novosDados, historico };
        }
        respostas.push(dayDisambigText(dayInfo.dayStr, dayInfo.dateStr, dayInfo.daySlots));
        novosDados = { ...dados, _dia_pendente_dow: dayInfo.dow };
        return { respostas, novoEstado: estado, novosDados, historico: null };
      }
      respostas.push(slotsHorarioText(ctx.slots));
      return { respostas, novoEstado: estado, novosDados: dados, historico: null };
    }

    const choice = slotFromChoice(msg, ctx.slots);
    if (!choice) {
      const normMsg = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const temDia = /segunda|terca|quarta|quinta|sexta|sabado|\bseg\b|\bter\b|\bqua\b|\bqui\b|\bsex\b|\bsab\b/.test(normMsg);
      if (temDia) respostas.push('⚠️ Horário não disponível. Escolha um dos horários abaixo:');
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
      respostas.push('Não encontramos agendamento. ' + menuPrincipal);
      return { respostas, novoEstado, novosDados: {}, historico: null };
    }
    const horario = new Date(dados.horario_iso);
    const descricao = msg.toLowerCase() === 'ok' ? orig.descricao : msg;
    const novo = await repos.insertAgendamento({
      cliente_id: clienteId,
      horario,
      servico: orig.servico || 'Serviço',
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
      respostas.push('Não há agendamento ativo. ' + menuPrincipal);
      return { respostas, novoEstado, novosDados: {}, historico: null };
    }
    await repos.updateAgendamentoCancelar(ativo.id, ativo.status, msg);
    await repos.cancelarLembretesPendentes(ativo.id);
    novoEstado = ESTADO.POS_ACAO;
    novosDados = {};
    gravarHistorico(estado, novoEstado, msg, { motivo: msg });
    respostas.push('Agendamento cancelado. Obrigado!');
    respostas.push(menuPrincipal);
    return { respostas, novoEstado, novosDados, historico };
  }

  if (estado === ESTADO.POS_ACAO) {
    const ativo = await repos.findAgendamentoAtivoPorCliente(clienteId);
    novoEstado = ativo ? ESTADO.MENU_COM_AGENDAMENTO : ESTADO.MENU_SEM_AGENDAMENTO;
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push(ativo ? T.menuComAgendamento(ctx.nomeMarca) : menuPrincipal);
    return { respostas, novoEstado, novosDados: {}, historico };
  }

  if (estado === ESTADO.CONVERSA_ENCERRADA) {
    novoEstado = ESTADO.AGUARDANDO_NOME;
    gravarHistorico(estado, novoEstado, msg, {});
    respostas.push(menuPrincipal);
    return { respostas, novoEstado, novosDados: {}, historico };
  }

  // Fallback — qualquer estado desconhecido
  novoEstado = ESTADO.AGUARDANDO_NOME;
  respostas.push(menuPrincipal);
  return { respostas, novoEstado, novosDados: {}, historico: null };
}

module.exports = { processarMensagem };
