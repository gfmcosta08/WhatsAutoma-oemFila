'use strict';

const repos = require('../database/repos');
const reposAgendamento = require('../database/reposAgendamento');
const whatsappRuntime = require('../config/whatsappRuntime');
const { ESTADO } = require('./states');
const { parseHorariosConfig, slotsHorarioText } = require('./horariosHelper');
const { invalidateSessaoCache, setSessaoCache } = require('../cache/redis');

function digitsFromJid(jid) {
  if (!jid) return '';
  return String(jid).replace('@s.whatsapp.net', '').replace(/\D/g, '');
}

async function isTelefoneOperadorOuInstancia(telefone) {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (!digits) return false;
  const cfg = await reposAgendamento.getConfig();
  const op = digitsFromJid(cfg && cfg.jid_operador);
  const merged = await whatsappRuntime.loadMerged();
  const inst = merged.uazapiInstancePhone ? String(merged.uazapiInstancePhone).replace(/\D/g, '') : '';
  if (op && digits === op) return true;
  if (inst && digits === inst) return true;
  return false;
}

async function loadSlots() {
  const cfg = await reposAgendamento.getConfig();
  return parseHorariosConfig(cfg && cfg.horarios_disponiveis);
}

/**
 * Fluxo do gerente pelo WhatsApp (número operador ou mesmo número da instância UazAPI).
 * 1 = confirmar próximo pendente, 2 = cancelar, 3 = notificar cliente para reagendar (menu de horários).
 */
async function processarMensagemOperador({ telefone, texto }) {
  const msg = String(texto || '').trim();
  const respostas = [];
  const outboundToCliente = [];

  const showFila = async () => {
    const pend = await repos.findOldestAgendamentoPendente();
    if (!pend) {
      respostas.push(
        'Não há agendamentos pendentes.\n\nQuando houver, use:\n1 — confirmar\n2 — cancelar\n3 — pedir reagendamento ao cliente'
      );
      return;
    }
    const dt = new Date(pend.horario).toLocaleString('pt-BR');
    respostas.push(
      `Próximo pendente:\nCliente: ${pend.nome || '-'}\nTel: ${pend.telefone}\nHorário: ${dt}\nServiço: ${pend.servico || '-'}\n\nResponda:\n1 — confirmar\n2 — cancelar\n3 — cliente reagenda (recebe opções de horário)`
    );
  };

  if (msg !== '1' && msg !== '2' && msg !== '3') {
    await showFila();
    return { respostas, outboundToCliente };
  }

  const pend = await repos.findOldestAgendamentoPendente();
  if (!pend) {
    respostas.push('Não há agendamento pendente na fila.');
    return { respostas, outboundToCliente };
  }

  if (msg === '1') {
    await repos.updateAgendamentoConfirmar(pend.id);
    const dt = new Date(pend.horario).toLocaleString('pt-BR');
    respostas.push('Agendamento confirmado.');
    outboundToCliente.push({
      telefone: pend.telefone,
      texto: `Seu agendamento foi confirmado para ${dt}. Obrigado!`,
    });
    return { respostas, outboundToCliente };
  }

  if (msg === '2') {
    await repos.updateAgendamentoCancelarOperador(pend.id, pend.status, 'Cancelado pelo gerente');
    await repos.cancelarLembretesPendentes(pend.id);
    respostas.push('Agendamento cancelado.');
    outboundToCliente.push({
      telefone: pend.telefone,
      texto: 'Seu agendamento foi cancelado pelo lavajato. Qualquer dúvida, fale conosco.',
    });
    return { respostas, outboundToCliente };
  }

  if (msg === '3') {
    const slots = await loadSlots();
    const textoCliente =
      'A oficina pediu para você escolher um novo horário. Responda com o número da opção:\n\n' +
      slotsHorarioText(slots);
    outboundToCliente.push({
      telefone: pend.telefone,
      texto: textoCliente,
    });

    const sessao = await repos.findSessaoByClienteId(pend.cliente_id);
    if (sessao) {
      await repos.updateSessao(sessao.id, {
        estado_atual: ESTADO.REAGENDANDO_HORARIO,
        dados_temporarios: { agendamento_id_reagendar: pend.id, intencao_substituir: true },
      });
      await invalidateSessaoCache(pend.cliente_id);
      await setSessaoCache(pend.cliente_id, {
        estado_atual: ESTADO.REAGENDANDO_HORARIO,
        dados_temporarios: { agendamento_id_reagendar: pend.id, intencao_substituir: true },
      });
    }

    respostas.push('Cliente recebeu o menu de horários para reagendar.');
    return { respostas, outboundToCliente };
  }

  await showFila();
  return { respostas, outboundToCliente };
}

async function notifyGerenteNovoPendente(agendamentoRow, clienteRow) {
  const cfg = await reposAgendamento.getConfig();
  const merged = await whatsappRuntime.loadMerged();
  const targets = new Set();
  const op = digitsFromJid(cfg && cfg.jid_operador);
  if (op) targets.add(op);
  const inst = merged.uazapiInstancePhone ? String(merged.uazapiInstancePhone).replace(/\D/g, '') : '';
  if (inst) targets.add(inst);
  if (targets.size === 0) return;
  const { sendTextNotify } = require('../whatsapp/notify');
  const dt = new Date(agendamentoRow.horario).toLocaleString('pt-BR');
  const text = `Novo agendamento pendente:\nCliente: ${clienteRow.nome || '-'}\nHorário: ${dt}\nServiço: ${agendamentoRow.servico || '-'}\n\nResponda: 1 confirmar, 2 cancelar, 3 reagendar`;
  for (const t of targets) {
    await sendTextNotify(t, text);
  }
}

module.exports = {
  isTelefoneOperadorOuInstancia,
  processarMensagemOperador,
  notifyGerenteNovoPendente,
};
