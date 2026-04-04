'use strict';

const { sendText } = require('./client');
const { sendSmsTwilio } = require('../sms/twilio');

/**
 * Envia WhatsApp; se falhar e Twilio estiver configurado, tenta SMS (PRD).
 */
async function sendTextNotify(to, text) {
  const r = await sendText(to, text);
  if (r.ok) return r;
  if (r.skipped) return r;
  console.warn('[notify] WhatsApp indisponível ou falhou — tentativa SMS');
  return sendSmsTwilio(to, text);
}

module.exports = { sendTextNotify };
