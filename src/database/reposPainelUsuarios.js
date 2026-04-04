'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('./connection');
const { hashPassword } = require('../utils/password');

async function count() {
  const r = await query(`SELECT COUNT(*)::int AS c FROM painel_usuarios`);
  return r.rows[0].c;
}

async function findByEmail(email) {
  const r = await query(`SELECT * FROM painel_usuarios WHERE LOWER(email) = LOWER($1)`, [email]);
  return r.rows[0] || null;
}

async function findById(id) {
  const r = await query(`SELECT id, email, role, totp_secret, totp_enabled, created_at FROM painel_usuarios WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function createUser({ email, password, role }) {
  const { hash, salt } = hashPassword(password);
  const id = uuidv4();
  await query(
    `INSERT INTO painel_usuarios (id, email, password_hash, password_salt, role) VALUES ($1, $2, $3, $4, $5)`,
    [id, String(email).trim().toLowerCase(), hash, salt, role === 'funcionario' ? 'funcionario' : 'gestor']
  );
  return findById(id);
}

async function setTotpSecret(userId, secret) {
  await query(`UPDATE painel_usuarios SET totp_secret = $2, totp_enabled = FALSE WHERE id = $1`, [userId, secret]);
}

async function enableTotp(userId) {
  await query(`UPDATE painel_usuarios SET totp_enabled = TRUE WHERE id = $1`, [userId]);
}

async function disableTotp(userId) {
  await query(`UPDATE painel_usuarios SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1`, [userId]);
}

/** Retorna hash/salt para verify (findByEmail já retorna row completo) */
async function getAuthRowById(id) {
  const r = await query(`SELECT * FROM painel_usuarios WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

module.exports = {
  count,
  findByEmail,
  findById,
  createUser,
  setTotpSecret,
  enableTotp,
  disableTotp,
  getAuthRowById,
};
