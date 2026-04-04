'use strict';

const config = require('../config');

/**
 * SMS fallback (PRD §4 / §9) — Twilio REST.
 * https://www.twilio.com/docs/sms/api
 */
async function sendSmsTwilio(toE164Digits, body) {
  const sid = config.twilioAccountSid;
  const token = config.twilioAuthToken;
  const from = config.twilioFrom;
  if (!sid || !token || !from) {
    return { ok: false, skipped: true, reason: 'twilio_not_configured' };
  }
  const num = String(toE164Digits || '').replace(/\D/g, '');
  if (!num) return { ok: false, skipped: true, reason: 'empty_number' };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams();
  form.set('To', num.startsWith('+') ? num : `+${num}`);
  form.set('From', from);
  form.set('Body', String(body).slice(0, 1400));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[sms/twilio] erro', res.status, json);
    return { ok: false, error: json };
  }
  return { ok: true, data: json };
}

module.exports = { sendSmsTwilio };
