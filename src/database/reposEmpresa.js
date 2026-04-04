'use strict';

const crypto = require('crypto');
const { query } = require('./connection');

function gerarWebhookToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function insertEmpresa({ nome, email, cnpj }) {
  let token;
  let livre = false;
  for (let i = 0; i < 8; i++) {
    token = gerarWebhookToken();
    const existe = await query('SELECT id FROM empresas WHERE webhook_token = $1', [token]);
    if (existe.rows.length === 0) {
      livre = true;
      break;
    }
  }
  if (!livre) {
    throw new Error('Não foi possível gerar webhook_token único. Tente novamente.');
  }

  const r = await query(
    `INSERT INTO empresas (nome, email, cnpj, webhook_token, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ativo', NOW(), NOW())
     RETURNING id, nome, email, cnpj, webhook_token, status, created_at`,
    [
      String(nome).trim(),
      email ? String(email).trim().toLowerCase() : null,
      cnpj ? String(cnpj).replace(/\D/g, '') : null,
      token,
    ]
  );
  return r.rows[0];
}

async function listEmpresas() {
  const r = await query(
    `SELECT id, nome, email, cnpj, webhook_token, status, created_at, updated_at
     FROM empresas ORDER BY created_at DESC`
  );
  return r.rows;
}

async function findEmpresaById(id) {
  const r = await query(
    `SELECT id, nome, email, cnpj, webhook_token, status, created_at, updated_at
     FROM empresas WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function findEmpresaByToken(token) {
  const r = await query(
    `SELECT id, nome, email, cnpj, webhook_token, status, created_at
     FROM empresas WHERE webhook_token = $1`,
    [token]
  );
  return r.rows[0] || null;
}

async function updateEmpresaStatus(id, status) {
  await query(
    `UPDATE empresas SET status = $2, updated_at = NOW() WHERE id = $1`,
    [id, status]
  );
}

async function updateEmpresa(id, { nome, email, cnpj }) {
  const fields = [];
  const vals = [];
  let n = 0;
  if (nome !== undefined) {
    n += 1;
    fields.push(`nome = $${n}`);
    vals.push(String(nome).trim());
  }
  if (email !== undefined) {
    n += 1;
    fields.push(`email = $${n}`);
    vals.push(email ? String(email).trim().toLowerCase() : null);
  }
  if (cnpj !== undefined) {
    n += 1;
    fields.push(`cnpj = $${n}`);
    vals.push(cnpj ? String(cnpj).replace(/\D/g, '') : null);
  }
  if (fields.length === 0) return findEmpresaById(id);
  fields.push(`updated_at = NOW()`);
  n += 1;
  vals.push(id);
  const r = await query(
    `UPDATE empresas SET ${fields.join(', ')} WHERE id = $${n} RETURNING id, nome, email, cnpj, webhook_token, status, created_at, updated_at`,
    vals
  );
  return r.rows[0] || null;
}

async function hasAnyEmpresa() {
  const r = await query('SELECT EXISTS (SELECT 1 FROM empresas LIMIT 1) AS e');
  return r.rows[0].e === true;
}

module.exports = {
  insertEmpresa,
  listEmpresas,
  findEmpresaById,
  findEmpresaByToken,
  updateEmpresaStatus,
  updateEmpresa,
  hasAnyEmpresa,
};
