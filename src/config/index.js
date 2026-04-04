'use strict';

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  whatsapp: {
    provider: (process.env.WHATSAPP_PROVIDER || 'auto').toLowerCase(),
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
  },
  uazapi: {
    baseUrl: process.env.UAZAPI_BASE_URL || 'https://focus.uazapi.com',
    instanceToken: process.env.UAZAPI_INSTANCE_TOKEN || '',
    adminToken: process.env.UAZAPI_ADMIN_TOKEN || '',
    instancePhone: (process.env.UAZAPI_INSTANCE_PHONE || '').replace(/\D/g, ''),
  },
  /** auto | query | header — ver docs.uazapi.com (v2: headers). auto usa header em *.uazapi.dev */
  uazapiAuthMode: (process.env.UAZAPI_AUTH_MODE || 'auto').toLowerCase(),
  internalNotifySecret: process.env.INTERNAL_NOTIFY_SECRET,
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  /** Senha opcional para perfil funcionário (fila). Se vazio, só gestor (ADMIN_PASSWORD) acessa o painel operacional. */
  staffPassword: process.env.STAFF_PASSWORD || '',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.INTERNAL_NOTIFY_SECRET || '',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  /** Ex: +15551234567 ou número aprovado na Twilio */
  twilioFrom: process.env.TWILIO_FROM_NUMBER || '',
};
