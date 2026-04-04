'use strict';

const whatsappRuntime = require('../config/whatsappRuntime');

async function buildMetaUrl() {
  const { phoneNumberId } = await whatsappRuntime.getSendCredentials();
  if (!phoneNumberId) throw new Error('Phone Number ID não configurado (admin ou WHATSAPP_PHONE_NUMBER_ID)');
  return `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
}

function defaultCountryDigits() {
  return String(process.env.WHATSAPP_DEFAULT_CC || '')
    .trim()
    .replace(/\D/g, '');
}

/**
 * Dígitos E.164-friendly. Opcional: WHATSAPP_DEFAULT_CC=55 para anexar DDI quando vier só DDD+número (10–11 dígitos).
 */
function normalizeNumber(to) {
  let n = String(to || '').replace(/\D/g, '');
  const cc = defaultCountryDigits();
  if (cc && n && !n.startsWith(cc) && (n.length === 10 || n.length === 11)) {
    n = cc + n;
  }
  return n;
}

async function sendTextMeta(to, text, opts = {}) {
  const fetchFn = typeof opts.fetch === 'function' ? opts.fetch : global.fetch;
  const { token } = await whatsappRuntime.getSendCredentials();
  if (!token) {
    console.warn('[whatsapp] Token Meta ausente — mensagem não enviada');
    return { ok: false, skipped: true };
  }
  const body = {
    messaging_product: 'whatsapp',
    to: normalizeNumber(to),
    type: 'text',
    text: { body: text },
  };
  const res = await fetchFn(await buildMetaUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[whatsapp] erro envio Meta', res.status, json);
    return { ok: false, error: json };
  }
  return { ok: true, data: json };
}

/**
 * Monta URL/headers/body do POST /send/text (UazAPI). Útil para testes e depuração.
 */
function buildUazapiSendRequest(creds, to, text) {
  const { baseUrl, instanceToken, adminToken, authMode } = creds;
  if (!instanceToken) {
    return { error: 'no_token' };
  }
  const num = normalizeNumber(to);
  if (!num) {
    return { error: 'no_number' };
  }
  const body = JSON.stringify({ number: num, text });
  const base = String(baseUrl || '').replace(/\/$/, '');
  let url = `${base}/send/text`;
  const headers = { 'Content-Type': 'application/json' };
  if (authMode === 'header') {
    headers.token = instanceToken;
    if (adminToken) headers.admintoken = adminToken;
  } else {
    const u = new URL(url);
    u.searchParams.set('token', instanceToken);
    if (adminToken) u.searchParams.set('admintoken', adminToken);
    url = u.toString();
  }
  return { url, headers, body, authMode };
}

/**
 * UazAPI: POST {base}/send/text
 * - uazapiGO v2 / *.uazapi.dev: headers token (+ admintoken opcional) — ver https://docs.uazapi.com
 * - legado / n8n: query ?token=&admintoken= (body: number, text)
 * @param {object} [opts] - `{ fetch: (url, init) => Promise<Response> }` para testes
 */
async function sendTextUazapi(to, text, opts = {}) {
  const fetchFn = typeof opts.fetch === 'function' ? opts.fetch : global.fetch;
  const creds = await whatsappRuntime.getUazapiSendCredentials();
  const built = buildUazapiSendRequest(creds, to, text);
  if (built.error === 'no_token') {
    console.warn('[whatsapp] UAZAPI_INSTANCE_TOKEN ausente — mensagem não enviada');
    return { ok: false, skipped: true };
  }
  if (built.error === 'no_number') {
    console.warn('[whatsapp] Destino vazio — não enviado');
    return { ok: false, skipped: true };
  }
  const res = await fetchFn(built.url, {
    method: 'POST',
    headers: built.headers,
    body: built.body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[whatsapp] erro envio UazAPI', res.status, built.authMode, json);
    return { ok: false, error: json };
  }
  return { ok: true, data: json };
}

async function sendText(to, text, opts) {
  const o = opts || {};
  const provider = await whatsappRuntime.getProvider();
  if (provider === 'meta') {
    return sendTextMeta(to, text, o);
  }
  return sendTextUazapi(to, text, o);
}

module.exports = {
  sendText,
  buildMetaUrl,
  sendTextMeta,
  sendTextUazapi,
  buildUazapiSendRequest,
  normalizeNumber,
};
