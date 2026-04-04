'use strict';

const repos = require('../database/repos');
const reposEmpresa = require('../database/reposEmpresa');
const { sendTextNotify } = require('../whatsapp/notify');
const logger = require('../utils/logger');

function mensagemPorTipo(row, nomeEmpresa) {
  const marca = nomeEmpresa || 'Sua empresa';
  const h = new Date(row.horario).toLocaleString('pt-BR');
  switch (row.tipo) {
    case 'confirmacao':
      return `Confirmação: seu agendamento (${row.servico || 'serviço'}) está em ${h}.`;
    case 'lembrete_24h':
      return `Lembrete: amanhã às ${h.split(' ')[1] || ''} você tem ${row.servico || 'serviço'} na ${marca}.`;
    case 'lembrete_1h':
      return `Lembrete: em 1 hora (${h}) — ${row.servico || 'serviço'}.`;
    case 'avaliacao':
      return `Como foi seu atendimento na ${marca}? Responda com uma nota de 1 a 5.`;
    default:
      return `Lembrete: ${row.servico || marca} — ${h}`;
  }
}

async function processarLembretesPendentes() {
  const rows = await repos.listLembretesPendentesAteAgora();
  const emp = await reposEmpresa.findEmpresaById(1);
  const nomeEmpresa = emp && emp.nome ? String(emp.nome).trim() : 'Sua empresa';
  for (const row of rows) {
    const tel = String(row.telefone || '').replace(/\D/g, '');
    const msg = mensagemPorTipo(row, nomeEmpresa);
    try {
      const r = await sendTextNotify(tel, msg);
      if (r.ok || r.skipped) {
        await repos.updateLembreteEnviado(row.id, msg);
        await repos.insertMensagemOutbound({
          cliente_id: row.cliente_id,
          texto: msg,
          tipo: 'texto',
          estado_na_momento: null,
        });
      } else {
        await repos.incrementLembreteTentativas(row.id);
        const atualizado = await repos.getLembreteById(row.id);
        if (atualizado && atualizado.tentativas >= 3) {
          await repos.updateLembreteFalhou(row.id);
          await logger.error('scheduler', 'lembrete falhou após 3 tentativas', { lembrete_id: row.id });
        }
      }
    } catch (e) {
      await repos.incrementLembreteTentativas(row.id);
      const atualizado = await repos.getLembreteById(row.id);
      if (atualizado && atualizado.tentativas >= 3) {
        await repos.updateLembreteFalhou(row.id);
        await logger.error('scheduler', e.message, { lembrete_id: row.id });
      }
    }
  }
}

module.exports = { processarLembretesPendentes, mensagemPorTipo };
