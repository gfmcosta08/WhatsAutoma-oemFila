'use strict';

const crypto = require('crypto');
const { verifySync } = require('otplib');
const config = require('../config');
const whatsappRuntime = require('../config/whatsappRuntime');
const reposPainelUsuarios = require('../database/reposPainelUsuarios');
const { verifyPassword } = require('../utils/password');

function getSecret() {
  return String(config.adminSessionSecret || config.internalNotifySecret || 'dev-insecure');
}

function signPainelToken(role, sub) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp, role, sub: sub || null })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyPainelToken(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data.exp || Date.now() > data.exp) return null;
  if (data.role !== 'gestor' && data.role !== 'funcionario') return null;
  return { role: data.role, sub: data.sub || null };
}

async function isPainelWideOpen() {
  const cnt = await reposPainelUsuarios.count();
  if (cnt > 0) return false;
  return !config.adminPassword && !config.staffPassword;
}

async function painelAuthEnabledAsync() {
  const cnt = await reposPainelUsuarios.count();
  return cnt > 0 || !!(config.adminPassword || config.staffPassword);
}

function requirePainel(req, res, next) {
  (async () => {
    if (await isPainelWideOpen()) {
      req.painelRole = 'gestor';
      req.painelUserId = null;
      return next();
    }
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : req.headers['x-painel-token'];
    const v = verifyPainelToken(token);
    if (!v) {
      res.status(401).json({ error: 'Não autorizado', painel_auth_required: true });
      return;
    }
    req.painelRole = v.role;
    req.painelUserId = v.sub;
    next();
  })().catch(next);
}

function requireGestor(req, res, next) {
  (async () => {
    if (await isPainelWideOpen()) return next();
    if (req.painelRole !== 'gestor') {
      res.status(403).json({ error: 'Apenas gestor' });
      return;
    }
    next();
  })().catch(next);
}

async function loginPainel(body = {}) {
  const { email, password, totp } = body;
  const cnt = await reposPainelUsuarios.count();

  if (cnt > 0) {
    if (!email || !password) return { error: 'Informe e-mail e senha' };
    const user = await reposPainelUsuarios.findByEmail(String(email).trim().toLowerCase());
    if (!user) return { error: 'Credenciais inválidas' };
    if (!verifyPassword(password, user.password_hash, user.password_salt)) return { error: 'Credenciais inválidas' };
    if (user.totp_enabled) {
      const code = totp != null ? String(totp).replace(/\s/g, '') : '';
      if (!code) return { need_totp: true, email: user.email };
      const v = user.totp_secret ? verifySync({ token: code, secret: user.totp_secret }) : { valid: false };
      if (!v.valid) {
        return { error: 'Código 2FA inválido' };
      }
    }
    return { token: signPainelToken(user.role, user.id), role: user.role, email: user.email };
  }

  if (!password) return { error: 'Informe a senha' };
  if (config.adminPassword && password === config.adminPassword) {
    return { token: signPainelToken('gestor', null), role: 'gestor' };
  }
  if (config.staffPassword && password === config.staffPassword) {
    return { token: signPainelToken('funcionario', null), role: 'funcionario' };
  }
  return { error: 'Credenciais inválidas' };
}

async function getPainelStatusPayload() {
  const cnt = await reposPainelUsuarios.count();
  const enabled = await painelAuthEnabledAsync();
  const m = await whatsappRuntime.loadMerged();
  const whatsapp_pode_enviar =
    m.provider === 'uazapi'
      ? !!(m.uazapiInstanceToken && String(m.uazapiInstanceToken).trim())
      : !!(m.token && m.phoneNumberId);
  return {
    painel_auth_enabled: enabled,
    login_mode: cnt > 0 ? 'email' : 'password',
    usuarios_cadastrados: cnt,
    whatsapp_provider: m.provider,
    whatsapp_pode_enviar,
  };
}

module.exports = {
  signPainelToken,
  verifyPainelToken,
  requirePainel,
  requireGestor,
  painelAuthEnabledAsync,
  loginPainel,
  getPainelStatusPayload,
  isPainelWideOpen,
};
