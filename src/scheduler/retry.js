'use strict';

const repos = require('../database/repos');
const { sendTextNotify } = require('../whatsapp/notify');
const logger = require('../utils/logger');

const MAX_TENTATIVAS = 5;
const BASE_MS = 60 * 1000;

async function processarFilaRetry() {
  const rows = await repos.listFilaRetryProntos();
  for (const row of rows) {
    const payload = row.payload || {};
    const tentativas = (row.tentativas || 0) + 1;
    try {
      if (row.tipo === 'mensagem' && payload.telefone && payload.texto) {
        const r = await sendTextNotify(payload.telefone, payload.texto);
        if (r.ok) {
          await repos.deleteFilaRetry(row.id);
          continue;
        }
      }
      if (tentativas >= MAX_TENTATIVAS) {
        await repos.deleteFilaRetry(row.id);
        await logger.error('scheduler', 'fila_retry abandonado', { id: row.id, tipo: row.tipo });
        continue;
      }
      const backoff = BASE_MS * Math.pow(2, tentativas - 1);
      const proxima = new Date(Date.now() + backoff);
      await repos.updateFilaRetryErro(row.id, tentativas, 'retry', proxima);
    } catch (e) {
      const proxima = new Date(Date.now() + BASE_MS * Math.pow(2, tentativas));
      await repos.updateFilaRetryErro(row.id, tentativas, e.message, proxima);
    }
  }
}

module.exports = { processarFilaRetry };
