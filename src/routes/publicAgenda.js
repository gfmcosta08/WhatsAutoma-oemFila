'use strict';

const express = require('express');
const reposAgendamento = require('../database/reposAgendamento');
const reposLavajato = require('../database/reposLavajato');
const reposFidelidade = require('../database/reposFidelidade');
const repos = require('../database/repos');
const { notifyGerenteNovoPendente } = require('../processor/operadorFlow');
const { sendTextNotify } = require('../whatsapp/notify');

const router = express.Router();

router.get('/servicos', async (req, res) => {
  try {
    const rows = await reposAgendamento.listServicos();
    res.json(
      rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        categoria: r.categoria,
        preco: r.preco,
        descricao: r.descricao || '',
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/slots', async (req, res) => {
  try {
    const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '14'), 10) || 14));
    const slots = await reposLavajato.listPublicSlots(days);
    res.json(slots);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reserva', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const { nome, telefone, email, veiculo, servico_id, horario_iso, consentimento_lgpd } = body;
    const result = await reposLavajato.createReservaPublica({
      nome,
      telefone,
      email,
      veiculo: veiculo || {},
      servico_id,
      horario_iso,
      consentimento_lgpd: !!consentimento_lgpd,
    });

    const { agendamento, cliente, servico } = result;
    try {
      await repos.insertLembretesParaAgendamento({
        cliente_id: cliente.id,
        agendamento_id: agendamento.id,
        horario: agendamento.horario,
      });
    } catch (err) {
      console.error('[public/reserva] lembretes', err.message);
    }

    if (agendamento.status === 'pendente') {
      await notifyGerenteNovoPendente(agendamento, cliente);
    }

    const linkBase = process.env.PUBLIC_WEB_BASE_URL || '';
    const token = agendamento.token_acompanhamento;
    const msg =
      agendamento.status === 'confirmado'
        ? `Reserva confirmada: ${servico.nome} em ${new Date(agendamento.horario).toLocaleString('pt-BR')}. ` +
          (linkBase ? `Acompanhe: ${linkBase.replace(/\/$/, '')}/acompanhar/${token}` : 'Obrigado!')
        : `Recebemos seu pedido de agendamento (${servico.nome}). Aguarde a confirmação do lavajato. ` +
          (linkBase ? `Acompanhe: ${linkBase.replace(/\/$/, '')}/acompanhar/${token}` : '');

    try {
      await sendTextNotify(cliente.telefone, msg);
    } catch (err) {
      console.error('[public/reserva] whatsapp cliente', err.message);
    }

    res.json({
      ok: true,
      status: agendamento.status,
      agendamento_id: agendamento.id,
      token_acompanhamento: token,
      mensagem: msg,
    });
  } catch (e) {
    const code = e.code === 'LGPD' ? 400 : e.message && e.message.includes('esgotado') ? 409 : 400;
    res.status(code).json({ error: e.message || 'Erro' });
  }
});

router.get('/acompanhar/:token', async (req, res) => {
  try {
    const row = await reposLavajato.findAgendamentoPublicoPorToken(req.params.token);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    let posicao = null;
    if (row.status_fila === 'na_fila') {
      posicao = await reposLavajato.posicaoNaFila(row.id);
    }
    let saldo_pontos = null;
    try {
      if (row.cliente_id) saldo_pontos = await reposFidelidade.saldoCliente(row.cliente_id);
    } catch {
      saldo_pontos = null;
    }
    res.json({
      id: row.id,
      horario: row.horario,
      status: row.status,
      status_fila: row.status_fila,
      servico: row.servico,
      posicao_fila: posicao,
      saldo_pontos,
      veiculo: {
        placa: row.veiculo_placa,
        modelo: row.veiculo_modelo,
        cor: row.veiculo_cor,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/lgpd/exclusao', express.json(), async (req, res) => {
  try {
    const { telefone, token_acompanhamento } = req.body || {};
    await reposLavajato.excluirDadosClientePublico({
      telefone,
      token: token_acompanhamento,
    });
    res.json({ ok: true, mensagem: 'Seus dados foram excluídos.' });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Não foi possível concluir a exclusão' });
  }
});

module.exports = router;
