'use strict';

const { sendText } = require('./client');
const { sendSmsTwilio } = require('../sms/twilio');

async function sendTextNotify(to, text) {
  console.log('[notify] ENVIANDO MENSAGEM WHATSAPP', {
    to: to ? to.substring(0, 6) + '***' : null,
    text_preview: text ? text.substring(0, 80) : null,
  });
  const r = await sendText(to, text);
  console.log('[notify] RESULTADO ENVIO', { ok: r.ok, skipped: r.skipped, error: r.error ? JSON.stringify(r.error).substring(0, 200) : null });
  if (r.ok) return r;
  if (r.skipped) {
    console.warn('[notify] Mensagem pulada (skipped)');
    return r;
  }
  console.warn('[notify] WhatsApp indisponível ou falhou — tentativa SMS');
  return sendSmsTwilio(to, text);
}

module.exports = { sendTextNotify };
