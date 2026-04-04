'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('./connection');

async function insertDespesa({ descricao, categoria, valor_centavos }) {
  const vc = parseInt(String(valor_centavos), 10);
  if (!descricao || !vc || vc <= 0) throw new Error('Descrição e valor obrigatórios');
  const id = uuidv4();
  await query(
    `INSERT INTO despesas_operacionais (id, descricao, categoria, valor_centavos) VALUES ($1, $2, $3, $4)`,
    [id, String(descricao).trim(), String(categoria || '').trim(), vc]
  );
  return id;
}

async function listDespesasPeriodo(fromStr, toStr) {
  const r = await query(
    `SELECT id, descricao, categoria, valor_centavos, created_at
     FROM despesas_operacionais
     WHERE created_at::date >= $1::date AND created_at::date <= $2::date
     ORDER BY created_at DESC`,
    [fromStr, toStr]
  );
  return r.rows;
}

async function sumDespesasPeriodo(fromStr, toStr) {
  const r = await query(
    `SELECT COALESCE(SUM(valor_centavos), 0)::bigint AS t
     FROM despesas_operacionais
     WHERE created_at::date >= $1::date AND created_at::date <= $2::date`,
    [fromStr, toStr]
  );
  return Number(r.rows[0].t);
}

module.exports = { insertDespesa, listDespesasPeriodo, sumDespesasPeriodo };
