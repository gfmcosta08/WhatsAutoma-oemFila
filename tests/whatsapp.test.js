'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const {
  extractTextFromUazapiBody,
  extractPhoneFromUazapiBody,
} = require('../src/webhook/receiver');

const {
  buildUazapiSendRequest,
  normalizeNumber,
  sendTextUazapi,
  sendTextMeta,
} = require('../src/whatsapp/client');

const whatsappRuntime = require('../src/config/whatsappRuntime');

describe('Webhook UazAPI — parsing de entrada', () => {
  it('extrai texto e telefone de payload estilo n8n / genérico', () => {
    const body = {
      from: '5511999887766',
      text: 'Olá',
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '5511999887766');
    assert.strictEqual(extractTextFromUazapiBody(body), 'Olá');
  });

  it('extrai de message.conversation (Baileys-like)', () => {
    const body = {
      key: { remoteJid: '5511888776655@s.whatsapp.net' },
      message: { conversation: 'Quero agendar' },
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '5511888776655');
    assert.strictEqual(extractTextFromUazapiBody(body), 'Quero agendar');
  });

  it('extrai número de remoteJid puro', () => {
    assert.strictEqual(extractPhoneFromUazapiBody({ remoteJid: '5544999123456@c.us' }), '5544999123456');
  });

  it('retorna vazio quando não há telefone ou texto', () => {
    assert.strictEqual(extractPhoneFromUazapiBody({}), '');
    assert.strictEqual(extractTextFromUazapiBody({}), '');
  });

  it('extrai de data[] (Evolution messages.upsert em lote)', () => {
    const body = {
      event: 'messages.upsert',
      data: [
        {
          key: { remoteJid: '5511999001122@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Oi' },
        },
      ],
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '5511999001122');
    assert.strictEqual(extractTextFromUazapiBody(body), 'Oi');
  });

  it('extrai de data.messages[]', () => {
    const body = {
      data: {
        messages: [
          {
            key: { remoteJid: '5521987654321@s.whatsapp.net', fromMe: false },
            message: { extendedTextMessage: { text: 'texto longo' } },
          },
        ],
      },
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '5521987654321');
    assert.strictEqual(extractTextFromUazapiBody(body), 'texto longo');
  });

  it('ignora fromMe no envelope do array', () => {
    const body = {
      data: [{ key: { remoteJid: '5511999001122@s.whatsapp.net', fromMe: true }, message: { conversation: 'x' } }],
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '');
  });

  it('prioriza remoteJidAlt quando remoteJid é @lid (Baileys)', () => {
    const body = {
      data: [
        {
          key: {
            remoteJid: '123456789012345@lid',
            remoteJidAlt: '5565988861312@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'oi' },
        },
      ],
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '5565988861312');
    assert.strictEqual(extractTextFromUazapiBody(body), 'oi');
  });

  it('usa senderPn quando presente', () => {
    const body = {
      key: {
        remoteJid: '999@lid',
        senderPn: '5511888776655@s.whatsapp.net',
        fromMe: false,
      },
      message: { conversation: 'teste' },
    };
    assert.strictEqual(extractPhoneFromUazapiBody(body), '5511888776655');
  });
});

describe('Envio UazAPI — montagem do pedido HTTP', () => {
  it('WHATSAPP_DEFAULT_CC prefixa DDI em número nacional', () => {
    const prev = process.env.WHATSAPP_DEFAULT_CC;
    process.env.WHATSAPP_DEFAULT_CC = '55';
    const r = buildUazapiSendRequest(
      {
        baseUrl: 'https://focus.uazapi.com',
        instanceToken: 'INST',
        adminToken: '',
        authMode: 'query',
      },
      '65988861312',
      'oi'
    );
    if (prev !== undefined) process.env.WHATSAPP_DEFAULT_CC = prev;
    else delete process.env.WHATSAPP_DEFAULT_CC;
    assert.ok(!r.error);
    assert.deepStrictEqual(JSON.parse(r.body), { number: '5565988861312', text: 'oi' });
  });

  it('modo query (.uazapi.com): token na query string', () => {
    const r = buildUazapiSendRequest(
      {
        baseUrl: 'https://focus.uazapi.com',
        instanceToken: 'INST',
        adminToken: 'ADM',
        authMode: 'query',
      },
      '+55 11 99999-0000',
      'teste'
    );
    assert.ok(!r.error);
    assert.match(r.url, /token=INST/);
    assert.match(r.url, /admintoken=ADM/);
    assert.strictEqual(r.headers['Content-Type'], 'application/json');
    assert.strictEqual(r.body, JSON.stringify({ number: '5511999990000', text: 'teste' }));
  });

  it('modo header (.uazapi.dev): token nos headers', () => {
    const r = buildUazapiSendRequest(
      {
        baseUrl: 'https://free.uazapi.dev',
        instanceToken: 'T1',
        adminToken: '',
        authMode: 'header',
      },
      '5511987654321',
      'oi'
    );
    assert.ok(!r.error);
    assert.strictEqual(r.url, 'https://free.uazapi.dev/send/text');
    assert.strictEqual(r.headers.token, 'T1');
    assert.strictEqual(r.headers.admintoken, undefined);
    assert.deepStrictEqual(JSON.parse(r.body), { number: '5511987654321', text: 'oi' });
  });

  it('sem token de instância retorna erro', () => {
    const r = buildUazapiSendRequest(
      { baseUrl: 'https://x.com', instanceToken: '', adminToken: '', authMode: 'query' },
      '5511',
      'x'
    );
    assert.strictEqual(r.error, 'no_token');
  });
});

describe('normalizeNumber', () => {
  it('remove não-dígitos', () => {
    assert.strictEqual(normalizeNumber('+55 (11) 98765-4321'), '5511987654321');
  });
});

describe('Envio — mock fetch (sem rede)', () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    process.env.WHATSAPP_PROVIDER = 'uazapi';
    process.env.UAZAPI_INSTANCE_TOKEN = 'mock-inst';
    process.env.UAZAPI_BASE_URL = 'https://mock.uazapi.com';
    process.env.UAZAPI_AUTH_MODE = 'query';
    delete process.env.UAZAPI_ADMIN_TOKEN;
    whatsappRuntime.invalidateCache();
  });

  it('sendTextUazapi chama fetch com POST e corpo number/text', async () => {
    let called = null;
    const mockFetch = async (url, init) => {
      called = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ sent: true }),
      };
    };
    const r = await sendTextUazapi('5511999001122', 'Olá cliente', { fetch: mockFetch });
    assert.strictEqual(r.ok, true);
    assert.ok(called.url.includes('/send/text'));
    assert.strictEqual(called.init.method, 'POST');
    assert.deepStrictEqual(JSON.parse(called.init.body), {
      number: '5511999001122',
      text: 'Olá cliente',
    });
  });

  it('sendTextUazapi retorna skipped sem token (env)', async () => {
    delete process.env.UAZAPI_INSTANCE_TOKEN;
    whatsappRuntime.invalidateCache();
    const r = await sendTextUazapi('5511', 'x', {
      fetch: async () => {
        throw new Error('fetch não deve ser chamado');
      },
    });
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.ok, false);
  });
});

describe('Meta — mock fetch', () => {
  beforeEach(() => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_TOKEN = 'meta-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    delete process.env.UAZAPI_INSTANCE_TOKEN;
    delete process.env.UAZAPI_BASE_URL;
    delete process.env.UAZAPI_AUTH_MODE;
    whatsappRuntime.invalidateCache();
  });

  it('sendTextMeta envia Bearer e messaging_product', async () => {
    let called = null;
    const mockFetch = async (url, init) => {
      called = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid' }] }),
      };
    };
    const r = await sendTextMeta('5511888123456', 'Resposta', { fetch: mockFetch });
    assert.strictEqual(r.ok, true);
    assert.match(called.url, /graph\.facebook\.com/);
    assert.match(called.url, /123456789/);
    assert.strictEqual(called.init.headers.Authorization, 'Bearer meta-token');
    const body = JSON.parse(called.init.body);
    assert.strictEqual(body.messaging_product, 'whatsapp');
    assert.strictEqual(body.to, '5511888123456');
    assert.strictEqual(body.type, 'text');
    assert.strictEqual(body.text.body, 'Resposta');
  });
});
