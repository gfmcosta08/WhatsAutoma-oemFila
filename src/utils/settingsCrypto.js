'use strict';

const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const PREFIX_PLAIN = 'plain:';

function getKeyBuffer() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* ignore */
  }
  return crypto.createHash('sha256').update(s, 'utf8').digest();
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const key = getKeyBuffer();
  const str = String(plaintext);
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SETTINGS_ENCRYPTION_KEY obrigatório em produção para gravar segredos.');
    }
    return PREFIX_PLAIN + Buffer.from(str, 'utf8').toString('base64');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

function decrypt(stored) {
  if (stored == null || stored === '') return null;
  if (String(stored).startsWith(PREFIX_PLAIN)) {
    const b64 = String(stored).slice(PREFIX_PLAIN.length);
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  const key = getKeyBuffer();
  if (!key) {
    throw new Error('SETTINGS_ENCRYPTION_KEY ausente — não é possível ler segredo cifrado.');
  }
  const parts = String(stored).split('.');
  if (parts.length !== 3) return null;
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const enc = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function maskSecret(value, visible = 4) {
  if (!value || String(value).length < visible) return value ? '****' : '';
  const s = String(value);
  return '****' + s.slice(-visible);
}

module.exports = { encrypt, decrypt, maskSecret };
