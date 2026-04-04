'use strict';

const config = require('./index');
const reposWhatsapp = require('../database/reposWhatsappSettings');

const TTL_MS = 30 * 1000;
let cache = { at: 0, data: null };

function invalidateCache() {
  cache = { at: 0, data: null };
}

function hasUazapiCredentials(m) {
  const envTok = (process.env.UAZAPI_INSTANCE_TOKEN || '').trim();
  return !!(m.uazapiInstanceToken || envTok || (config.uazapi && config.uazapi.instanceToken));
}

function hasMetaCredentials(m) {
  const envTok = (process.env.WHATSAPP_TOKEN || '').trim();
  const envPid = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  return !!((m.token || envTok) && (m.phoneNumberId || envPid));
}

function whatsappProviderEnv() {
  return (process.env.WHATSAPP_PROVIDER || config.whatsapp.provider || 'auto').toLowerCase();
}

/**
 * auto: uazapi se houver token de instância (DB ou env); senão meta se token+phone id.
 */
function resolveProvider(m) {
  const p = whatsappProviderEnv();
  if (p === 'uazapi') return 'uazapi';
  if (p === 'meta') return 'meta';
  if (hasUazapiCredentials(m)) return 'uazapi';
  if (hasMetaCredentials(m)) return 'meta';
  return 'uazapi';
}

async function loadMerged() {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL_MS) {
    return cache.data;
  }
  let db = null;
  try {
    db = await reposWhatsapp.getDecrypted(reposWhatsapp.EMPRESA_ID);
  } catch {
    /* tabela pode não existir antes de migrate; fallback para env */
  }
  const w = config.whatsapp || {};
  const u = config.uazapi || {};
  const envWaTok = (process.env.WHATSAPP_TOKEN || '').trim();
  const envWaPid = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const envUazTok = (process.env.UAZAPI_INSTANCE_TOKEN || '').trim();
  const envUazBase = (process.env.UAZAPI_BASE_URL || '').trim();
  const envUazAdm = (process.env.UAZAPI_ADMIN_TOKEN || '').trim();
  const envUazPhone = (process.env.UAZAPI_INSTANCE_PHONE || '').replace(/\D/g, '') || '';
  const merged = {
    token: (db && db.access_token) || envWaTok || w.token || null,
    phoneNumberId: (db && db.phone_number_id) || envWaPid || w.phoneNumberId || null,
    verifyToken: (db && db.verify_token) || w.verifyToken || null,
    appSecret: (db && db.app_secret) || w.appSecret || null,
    uazapiBaseUrl:
      (db && db.uazapi_base_url) || envUazBase || u.baseUrl || 'https://focus.uazapi.com',
    uazapiInstanceToken: (db && db.uazapi_instance_token) || envUazTok || u.instanceToken || null,
    uazapiAdminToken: (db && db.uazapi_admin_token) || envUazAdm || u.adminToken || null,
    uazapiInstancePhone:
      (db && db.uazapi_instance_phone) || envUazPhone || u.instancePhone || null,
    _fromDb: {
      token: !!(db && db.access_token),
      phoneNumberId: !!(db && db.phone_number_id),
      verifyToken: !!(db && db.verify_token),
      appSecret: !!(db && db.app_secret),
      uazapiInstanceToken: !!(db && db.uazapi_instance_token),
      uazapiAdminToken: !!(db && db.uazapi_admin_token),
      uazapiBaseUrl: !!(db && db.uazapi_base_url),
      uazapiInstancePhone: !!(db && db.uazapi_instance_phone),
    },
  };
  merged.provider = resolveProvider({
    token: merged.token,
    phoneNumberId: merged.phoneNumberId,
    uazapiInstanceToken: merged.uazapiInstanceToken,
  });
  cache = { at: now, data: merged };
  return merged;
}

async function getProvider() {
  const m = await loadMerged();
  return m.provider;
}

async function getSendCredentials() {
  const m = await loadMerged();
  return { token: m.token, phoneNumberId: m.phoneNumberId };
}

function resolveUazapiAuthMode(baseUrl, mode) {
  const m = String(mode || 'auto').toLowerCase();
  if (m === 'header' || m === 'query') return m;
  try {
    const raw = (baseUrl || '').trim();
    if (!raw) return 'query';
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    if (host === 'uazapi.dev' || host.endsWith('.uazapi.dev')) return 'header';
  } catch {
    /* ignore */
  }
  return 'query';
}

async function getUazapiSendCredentials() {
  const m = await loadMerged();
  const baseUrl = (m.uazapiBaseUrl || 'https://focus.uazapi.com').replace(/\/$/, '');
  return {
    baseUrl,
    instanceToken: m.uazapiInstanceToken || '',
    adminToken: m.uazapiAdminToken || '',
    instancePhone: m.uazapiInstancePhone || '',
    authMode: resolveUazapiAuthMode(
      baseUrl,
      (process.env.UAZAPI_AUTH_MODE && process.env.UAZAPI_AUTH_MODE.trim()) || config.uazapiAuthMode
    ),
  };
}

async function getVerifyToken() {
  const m = await loadMerged();
  return m.verifyToken || null;
}

async function getAppSecret() {
  const m = await loadMerged();
  return m.appSecret || null;
}

module.exports = {
  loadMerged,
  getProvider,
  getSendCredentials,
  getUazapiSendCredentials,
  getVerifyToken,
  getAppSecret,
  invalidateCache,
};
