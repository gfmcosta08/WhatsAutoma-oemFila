'use strict';

const cron = require('node-cron');
const { processarLembretesPendentes } = require('./lembretes');
const { processarFilaRetry } = require('./retry');

function iniciar() {
  cron.schedule('* * * * *', () => {
    processarLembretesPendentes().catch((e) => console.error('[cron lembretes]', e));
  });
  cron.schedule('*/5 * * * *', () => {
    processarFilaRetry().catch((e) => console.error('[cron retry]', e));
  });
}

module.exports = { iniciar };
