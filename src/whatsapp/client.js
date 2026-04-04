'use strict';

const whatsappRuntime = require('../config/whatsappRuntime');

const FETCH_TIMEOUT_MS = 15000; // 15 segundos

function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

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
  const fetchFn = typeof opts.fetch === 'function' ? opts.fetch : fetchWithTimeout;
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
  try {
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
  } catch (e) {
    console.error('[whatsapp] erro envio Meta (timeout/rede)', e.message);
    return { ok: false, error: { message: e.message } };
  }
}

function rawDigits(to) {
  return String(to || '').replace(/\D/g, '');
}

function uazapiErrorLooksLikeInvalidWhatsAppNumber(json) {
  const s = JSON.stringify(json || {}).toLowerCase();
  return s.includes('not on whatsapp') || s.includes('não está no whatsapp');
}

/**
 * Monta POST /send/text com dígitos já normalizados (E.164 sem +).
 */
function buildUazapiSendRequestDigits(creds, num, text) {
  const { baseUrl, instanceToken, adminToken, authMode } = creds;
  if (!instanceToken) {
    return { error: 'no_token' };
  }
  if (!num) {
    return { error: 'no_number' };
  }
  const body = JSON.stringify({ number: num, text });
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base || !base.startsWith('http')) {
    return { error: 'invalid_base_url' };
  }
  let url = `${base}/send/text`;
  const headers = { 'Content-Type': 'application/json' };
  if (authMode === 'header') {
    headers.token = instanceToken;
    if (adminToken) headers.admintoken = adminToken;
  } else {
    try {
      const u = new URL(url);
      u.searchParams.set('token', instanceToken);
      if (adminToken) u.searchParams.set('admintoken', adminToken);
      url = u.toString();
    } catch (e) {
      return { error: 'url_parse_failed', detail: e.message };
    }
  }
  return { url, headers, body, authMode };
}

/**
 * Monta URL/headers/body do POST /send/text (UazAPI). Útil para testes e depuração.
 */
function buildUazapiSendRequest(creds, to, text) {
  return buildUazapiSendRequestDigits(creds, normalizeNumber(to), text);
}

/**
 * UazAPI: POST {base}/send/text
 * - uazapiGO v2 / *.uazapi.dev: headers token (+ admintoken opcional) — ver https://docs.uazapi.com
 * - legado / n8n: query ?token=&admintoken= (body: number, text)
 * @param {object} [opts] - `{ fetch: (url, init) => Promise<Response> }` para testes
 */
async function sendTextUazapi(to, text, opts = {}) {
  const fetchFn = typeof opts.fetch === 'function' ? opts.fetch : fetchWithTimeout;
  const creds = await whatsappRuntime.getUazapiSendCredentials();
  console.log('[whatsapp] UazAPI creds check', {
    hasBaseUrl: !!(creds.baseUrl),
    hasInstanceToken: !!(creds.instanceToken),
    baseUrl: creds.baseUrl,
    instanceTokenPrefix: creds.instanceToken ? creds.instanceToken.substring(0, 8) + '...' : null,
    authMode: creds.authMode,
  });

  async function postDigits(num) {
    const built = buildUazapiSendRequestDigits(creds, num, text);
    if (built.error) return { built, res: null, json: {} };
    try {
      const res = await fetchFn(built.url, {
        method: 'POST',
        headers: built.headers,
        body: built.body,
      });
      const json = await res.json().catch(() => ({}));
      return { built, res, json };
    } catch (e) {
      console.error('[whatsapp] erro envio UazAPI (timeout/rede)', e.message);
      return { built, res: { ok: false, status: 0 }, json: { error: e.message } };
    }
  }

  const first = await postDigits(normalizeNumber(to));
  if (first.built.error === 'no_token') {
    console.warn('[whatsapp] UAZAPI_INSTANCE_TOKEN ausente — mensagem não enviada');
    return { ok: false, skipped: true };
  }
  if (first.built.error === 'no_number') {
    console.warn('[whatsapp] Destino vazio — não enviado');
    return { ok: false, skipped: true };
  }
  if (first.res.ok) {
    return { ok: true, data: first.json };
  }
  console.error('[whatsapp] erro envio UazAPI', first.res.status, first.built.authMode, first.json);

  const raw = rawDigits(to);
  /** BR: webhook costuma mandar DDD+número sem 55; UazAPI exige E.164. */
  const tryBrRetry =
    uazapiErrorLooksLikeInvalidWhatsAppNumber(first.json) &&
    raw.length >= 10 &&
    raw.length <= 11 &&
    !raw.startsWith('55');

  if (tryBrRetry) {
    const second = await postDigits('55' + raw);
    if (second.res && second.res.ok) {
      console.log('[whatsapp] envio OK com DDI 55 (retry após erro "not on WhatsApp")');
      return { ok: true, data: second.json };
    }
    if (second.res) {
      console.error('[whatsapp] erro envio UazAPI após retry 55', second.res.status, second.json);
    }
    return { ok: false, error: second.json && Object.keys(second.json).length ? second.json : first.json };
  }

  return { ok: false, error: first.json };
}

async function sendText(to, text, opts) {
  const o = opts || {};
  const provider = await whatsappRuntime.getProvider();
  console.log('[whatsapp] sendText.provider:', provider);
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
  buildUazapiSendRequestDigits,
  normalizeNumber,
};
