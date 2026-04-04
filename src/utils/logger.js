'use strict';

const { query } = require('../database/connection');

async function logDb(nivel, modulo, mensagem, metadata) {
  try {
    await query(`INSERT INTO logs_sistema (nivel, modulo, mensagem, metadata) VALUES ($1, $2, $3, $4)`, [
      nivel,
      modulo,
      mensagem,
      metadata ?? null,
    ]);
  } catch (e) {
    console.error('[logger] falha ao gravar logs_sistema', e.message);
  }
}

function info(modulo, mensagem, metadata) {
  console.log(`[${modulo}] ${mensagem}`);
  return logDb('info', modulo, mensagem, metadata);
}

function warn(modulo, mensagem, metadata) {
  console.warn(`[${modulo}] ${mensagem}`);
  return logDb('warn', modulo, mensagem, metadata);
}

function error(modulo, mensagem, metadata) {
  console.error(`[${modulo}] ${mensagem}`);
  return logDb('error', modulo, mensagem, metadata);
}

module.exports = { info, warn, error, logDb };
