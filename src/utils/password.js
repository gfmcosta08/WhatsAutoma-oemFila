'use strict';

const crypto = require('crypto');

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64);
  return { hash, salt };
}

function verifyPassword(plain, hashBuf, saltBuf) {
  if (!plain || !hashBuf || !saltBuf) return false;
  try {
    const h = crypto.scryptSync(String(plain), saltBuf, 64);
    if (h.length !== hashBuf.length) return false;
    return crypto.timingSafeEqual(h, hashBuf);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
