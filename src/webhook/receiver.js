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

/**
 * Extrai dígitos de um JID/endereço WhatsApp. Não usa @lid como telefone (API não entrega para @s.whatsapp.net).
 */
function digitsFromAddressingJid(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  const lower = s.toLowerCase();
  if (lower.includes('@g.us') || lower.includes('broadcast')) return '';
  if (lower.endsWith('@lid')) return '';
  const local = s.split('@')[0];
  return normalizeTelefone(local);
}

/**
 * Evolution / UazAPI às vezes manda data como array ou data.messages[].
 * Gera objetos “raiz” para onde procurar key/message (ordem: mais específico primeiro).
 */
function* eachUazapiExtractionRoot(body) {
  if (!body || typeof body !== 'object') return;
  const push = (o) => {
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    return null;
  };
  const d = body.data;
  if (Array.isArray(d)) {
    for (const item of d) {
      const o = push(item);
      if (o) {
        yield o;
        if (Array.isArray(o.messages)) {
          for (const m of o.messages) {
            const mo = push(m);
            if (mo) yield mo;
          }
        }
      }
    }
  } else {
    const po = push(d);
    if (po) {
      yield po;
      if (Array.isArray(po.messages)) {
        for (const m of po.messages) {
          const mo = push(m);
          if (mo) yield mo;
        }
      }
    }
  }
  /* não dar return aqui: data em array ainda pode precisar do envelope raiz (ex.: from/text n8n) */
  if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      const mo = push(m);
      if (mo) yield mo;
    }
  }
  const inner = push(body.body);
  if (inner) yield inner;
  yield body;
}

function isFromMeRoot(root) {
  if (!root || typeof root !== 'object') return false;
  if (root.key?.fromMe === true) return true;
  if (root.data?.key?.fromMe === true) return true;
  return false;
}

function extractTextFromRoot(root) {
  if (!root || typeof root !== 'object') return '';
  const cand = [
    root.data?.message?.conversation,
    root.data?.message?.extendedTextMessage?.text,
    root.data?.message?.imageMessage?.caption,
    root.data?.message?.buttonsResponseMessage?.selectedDisplayText,
    root.data?.message?.listResponseMessage?.title,
    root.message?.conversation,
    root.message?.extendedTextMessage?.text,
    root.message?.imageMessage?.caption,
    root.message?.buttonsResponseMessage?.selectedDisplayText,
    root.message?.listResponseMessage?.title,
    typeof root.message === 'string' ? root.message : null,
    root.text,
    root.body,
    root.content,
    root.msg,
    root.Body,
    root.messageText,
    root.payload?.text,
  ];
  for (const c of cand) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return '';
}

function extractTextFromUazapiBody(body) {
  if (!body || typeof body !== 'object') return '';
  let best = '';
  for (const root of eachUazapiExtractionRoot(body)) {
    const t = extractTextFromRoot(root);
    if (t) {
      best = t;
      break;
    }
  }
  return best;
}

function extractPhoneFromRoot(root) {
  if (!root || typeof root !== 'object') return '';
  if (isFromMeRoot(root)) return '';

  const cand = [
    root.data?.key?.remoteJidAlt,
    root.key?.remoteJidAlt,
    root.data?.key?.senderPn,
    root.key?.senderPn,
    root.data?.key?.participant,
    root.key?.participant,
    root.data?.key?.remoteJid,
    root.key?.remoteJid,
    root.data?.from,
    root.data?.sender,
    root.remoteJid,
    root.from,
    root.telefone,
    root.phone,
    root.number,
    root.sender,
    root.chatId,
    root.chat?.id,
    root.payload?.from,
  ];
  for (const c of cand) {
    if (c == null || c === '') continue;
    const s = String(c);
    if (s.includes('@g.us') || s.toLowerCase().includes('broadcast')) continue;
    const n = s.includes('@') ? digitsFromAddressingJid(s) : normalizeTelefone(s);
    if (n) return n;
  }
  return '';
}

function extractPhoneFromUazapiBody(body) {
  if (!body || typeof body !== 'object') return '';
  for (const root of eachUazapiExtractionRoot(body)) {
    const p = extractPhoneFromRoot(root);
    if (p) return p;
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
    const sent = await sendTextNotify(telefone, line);
    if (!sent.ok && !sent.skipped) {
      await logger.error('webhook', 'falha envio WhatsApp ao operador', {
        telefone,
        trecho: line.slice(0, 80),
        detalhe: sent.error || null,
      });
    }
    await repos.insertMensagemOutbound({
      cliente_id: cliente.id,
      texto: line,
      estado_na_momento: 'OPERADOR',
    });
  }

  for (const o of outboundToCliente) {
    const sent = await sendTextNotify(o.telefone, o.texto);
    if (!sent.ok && !sent.skipped) {
      await logger.error('webhook', 'falha envio WhatsApp (operador→cliente)', {
        telefone: o.telefone,
        detalhe: sent.error || null,
      });
    }
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

  try {
    await invalidateSessaoCache(cliente.id);
    await setSessaoCache(cliente.id, { estado_atual: novoEstado, dados_temporarios: novosDados });
  } catch (e) {
    await logger.warn('webhook', 'redis sessão falhou (resposta ainda enviada)', { err: e.message });
  }

  for (const line of resultado.respostas) {
    const sent = await sendTextNotify(telefone, line);
    if (!sent.ok && !sent.skipped) {
      await logger.error('webhook', 'falha envio WhatsApp ao cliente', {
        telefone,
        trecho: line.slice(0, 80),
        detalhe: sent.error || null,
      });
    }
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

    logger.info('webhook-entrada', 'payload recebido', {
      empresa_id: empresa.id,
      keys: Object.keys(body),
      data_keys: body.data ? Object.keys(body.data) : null,
      event: body.event || body.type || null,
      fromMe: body.data?.key?.fromMe ?? body.key?.fromMe ?? null,
    });

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
      const d = body?.data;
      logger.warn('webhook-entrada', 'payload sem telefone (estrutura não reconhecida)', {
        empresa_id: empresa.id,
        event: body.event || body.type || null,
        dataIsArray: Array.isArray(d),
        dataLen: Array.isArray(d) ? d.length : d && typeof d === 'object' ? Object.keys(d).length : null,
        topKeys: Object.keys(body || {}).slice(0, 24),
      });
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
