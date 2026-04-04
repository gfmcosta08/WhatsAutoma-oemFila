'use strict';

const express = require('express');
const crypto = require('crypto');
const whatsappRuntime = require('../config/whatsappRuntime');
const repos = require('../database/repos');
const reposEmpresa = require('../database/reposEmpresa');
const { processarMensagem } = require('../processor');
const { isTelefoneOperadorOuInstancia, processarMensagemOperador } = require('../processor/operadorFlow');
const { ESTADO } = require('../processor/states');
const { sendTextNotify } = require('../whatsapp/notify');
const logger = require('../utils/logger');
const { parseWhatsAppTs } = require('../utils/formatters');
const { setSessaoCache, invalidateSessaoCache } = require('../cache/redis');

const router = express.Router();

function normalizeTelefone(from) {
  return String(from || '').replace(/\D/g, '');
}

function extractTextFromUazapiBody(body) {
  if (!body || typeof body !== 'object') return '';
  const cand = [
    body.text,
    body.body,
    body.content,
    body.msg,
    body.Body,
    body.messageText,
    body.message?.conversation,
    body.message?.extendedTextMessage?.text,
    typeof body.message === 'string' ? body.message : null,
    body.data?.message?.conversation,
    body.payload?.text,
  ];
  for (const c of cand) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return '';
}

function extractPhoneFromUazapiBody(body) {
  if (!body || typeof body !== 'object') return '';
  const cand = [
    body.from,
    body.telefone,
    body.phone,
    body.number,
    body.sender,
    body.remoteJid,
    body.key?.remoteJid,
    body.chatId,
    body.chat?.id,
    body.data?.from,
    body.payload?.from,
  ];
  for (const c of cand) {
    const n = normalizeTelefone(c);
    if (n) return n;
  }
  return '';
}

async function verifyMetaSignature(req) {
  const secret = await whatsappRuntime.getAppSecret();
  if (!secret) return true;
  const sig = req.get('x-hub-signature-256');
  if (!sig || !sig.startsWith('sha256=')) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(req.rawBody || JSON.stringify(req.body));
  const expected = 'sha256=' + hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.get('/whatsapp', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verify = await whatsappRuntime.getVerifyToken();
  if (mode === 'subscribe' && verify && token === verify) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/whatsapp', express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  res.sendStatus(200);
  if (!(await verifyMetaSignature(req))) {
    logger.warn('webhook', 'assinatura inválida ou ausente');
    return;
  }
  try {
    const body = req.body;
    const entries = body.entry || [];
    for (const ent of entries) {
      const changes = ent.changes || [];
      for (const ch of changes) {
        const value = ch.value || {};
        const messages = value.messages || [];
        for (const m of messages) {
          const from = normalizeTelefone(m.from);
          const text = m.type === 'text' ? m.text?.body || '' : '';
          const messageId = m.id;
          const ts = parseWhatsAppTs(m.timestamp);
          const profileName = value.contacts?.[0]?.profile?.name;
          await handleIncoming({ telefone: from, texto: text, whatsapp_message_id: messageId, whatsapp_timestamp: ts, whatsapp_name: profileName });
        }
      }
    }
  } catch (e) {
    logger.error('webhook', e.message, { stack: e.stack });
  }
});

async function handleIncomingOperador({ telefone, texto, whatsapp_message_id, whatsapp_timestamp, whatsapp_name }) {
  const t0 = Date.now();
  let cliente = await repos.findClienteByTelefone(telefone);
  if (!cliente) {
    cliente = await repos.insertCliente({ telefone, whatsapp_name });
    await repos.insertSessao(cliente.id, ESTADO.AGUARDANDO_NOME, {});
  }

  let sessao = await repos.findSessaoByClienteId(cliente.id);
  if (!sessao) {
    await repos.insertSessao(cliente.id, ESTADO.AGUARDANDO_NOME, {});
    sessao = await repos.findSessaoByClienteId(cliente.id);
  }

  const estadoAntes = sessao.estado_atual;

  await repos.insertMensagemInbound({
    cliente_id: cliente.id,
    texto,
    tipo: 'texto',
    whatsapp_message_id,
    whatsapp_timestamp,
    status_entrega: 'entregue',
    estado_na_momento: estadoAntes,
    tempo_resposta_ms: null,
  });

  await repos.updateClienteUltimaInteracao(cliente.id);

  const { respostas, outboundToCliente } = await processarMensagemOperador({ telefone, texto });

  for (const line of respostas) {
    await sendTextNotify(telefone, line);
    await repos.insertMensagemOutbound({
      cliente_id: cliente.id,
      texto: line,
      estado_na_momento: 'OPERADOR',
    });
  }

  for (const o of outboundToCliente) {
    await sendTextNotify(o.telefone, o.texto);
  }

  await logger.info('webhook', 'mensagem operador', {
    telefone,
    ms: Date.now() - t0,
  });
}

async function handleIncomingCliente({ telefone, texto, whatsapp_message_id, whatsapp_timestamp, whatsapp_name }) {
  const t0 = Date.now();
  let cliente = await repos.findClienteByTelefone(telefone);
  if (!cliente) {
    cliente = await repos.insertCliente({ telefone, whatsapp_name });
    await repos.insertSessao(cliente.id, ESTADO.AGUARDANDO_NOME, {});
  }

  let sessao = await repos.findSessaoByClienteId(cliente.id);
  if (!sessao) {
    await repos.insertSessao(cliente.id, ESTADO.AGUARDANDO_NOME, {});
    sessao = await repos.findSessaoByClienteId(cliente.id);
  }

  const estadoAntes = sessao.estado_atual;

  await repos.insertMensagemInbound({
    cliente_id: cliente.id,
    texto,
    tipo: 'texto',
    whatsapp_message_id,
    whatsapp_timestamp,
    status_entrega: 'entregue',
    estado_na_momento: estadoAntes,
    tempo_resposta_ms: null,
  });

  await repos.updateClienteUltimaInteracao(cliente.id);

  sessao = await repos.findSessaoByClienteId(cliente.id);
  const resultado = await processarMensagem({ cliente, sessao, texto });

  const novoEstado = resultado.novoEstado;
  const novosDados = resultado.novosDados;
  const historico = resultado.historico;

  if (novoEstado !== estadoAntes) {
    await repos.insertHistoricoEstado({
      cliente_id: cliente.id,
      sessao_id: sessao.id,
      estado_anterior: historico ? historico.estado_anterior : estadoAntes,
      estado_novo: historico ? historico.estado_novo : novoEstado,
      mensagem_trigger: historico ? historico.mensagem_trigger : texto,
      metadata: historico && historico.metadata ? historico.metadata : {},
    });
  }

  await repos.updateSessao(sessao.id, {
    estado_atual: novoEstado,
    dados_temporarios: novosDados,
    ultima_mensagem_id: whatsapp_message_id,
  });

  await invalidateSessaoCache(cliente.id);
  await setSessaoCache(cliente.id, { estado_atual: novoEstado, dados_temporarios: novosDados });

  for (const line of resultado.respostas) {
    await sendTextNotify(telefone, line);
    await repos.insertMensagemOutbound({
      cliente_id: cliente.id,
      texto: line,
      estado_na_momento: novoEstado,
    });
  }

  await logger.info('webhook', 'mensagem processada', {
    telefone,
    estadoAntes,
    novoEstado,
    ms: Date.now() - t0,
  });
}

async function handleIncoming(payload) {
  const { telefone, texto, whatsapp_message_id, whatsapp_timestamp, whatsapp_name } = payload;
  if (!telefone) return;
  if (await isTelefoneOperadorOuInstancia(telefone)) {
    return handleIncomingOperador(payload);
  }
  return handleIncomingCliente(payload);
}

/**
 * POST /webhook/entrada/:token
 * Webhook por instância (UazAPI / integradores). Token único por empresa.
 */
router.post('/entrada/:token', express.json(), async (req, res) => {
  res.sendStatus(200);

  const { token } = req.params;

  try {
    const empresa = await reposEmpresa.findEmpresaByToken(token);
    if (!empresa) {
      logger.warn('webhook-entrada', 'token inválido ou empresa não encontrada', { token });
      return;
    }
    if (empresa.status !== 'ativo') {
      logger.warn('webhook-entrada', 'empresa inativa', { empresa_id: empresa.id });
      return;
    }

    const body = req.body || {};

    const telefone = extractPhoneFromUazapiBody(body);
    const texto = extractTextFromUazapiBody(body);
    const messageId =
      body.messageId ||
      body.message_id ||
      body.id ||
      body.key?.id ||
      body.data?.messageId ||
      null;
    const tsRaw = body.timestamp || body.ts || body.messageTimestamp || null;
    const parsedTs = tsRaw != null && tsRaw !== '' ? parseWhatsAppTs(tsRaw) : null;
    const whatsapp_timestamp =
      parsedTs instanceof Date && !Number.isNaN(parsedTs.getTime()) ? parsedTs : new Date();
    const whatsapp_name =
      body.profileName || body.profile_name || body.name || body.pushName || body.notifyName || null;

    if (!telefone) {
      logger.warn('webhook-entrada', 'payload sem telefone', { empresa_id: empresa.id, body });
      return;
    }

    await handleIncoming({
      telefone,
      texto,
      whatsapp_message_id: messageId,
      whatsapp_timestamp,
      whatsapp_name,
    });
  } catch (e) {
    logger.error('webhook-entrada', e.message, { token, stack: e.stack });
  }
});

module.exports = {
  router,
  handleIncoming,
  extractTextFromUazapiBody,
  extractPhoneFromUazapiBody,
};
