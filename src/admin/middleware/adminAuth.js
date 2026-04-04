'use strict';

const crypto = require('crypto');
const config = require('../../config');

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function verifySessionCookie(value) {
  if (!value || !config.adminPassword) return false;
  const parts = String(value).split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const secret = String(config.adminSessionSecret || 'dev-insecure');
  const expected = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function signSessionExp(expMs) {
  const secret = String(config.adminSessionSecret || 'dev-insecure');
  const payload = String(expMs);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function requireAdmin(req, res, next) {
  if (!config.adminPassword) return next();
  const cookies = parseCookies(req);
  if (verifySessionCookie(cookies.admin_sess)) return next();
  return res.status(401).json({ error: 'Não autorizado', auth_required: true });
}

module.exports = {
  parseCookies,
  verifySessionCookie,
  signSessionExp,
  requireAdmin,
};
