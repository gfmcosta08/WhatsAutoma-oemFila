'use strict';

const express = require('express');
const path = require('path');
const repos = require('../../database/repos');
const reposEmpresa = require('../../database/reposEmpresa');
const reposAgendamento = require('../../database/reposAgendamento');
const reposWhatsapp = require('../../database/reposWhatsappSettings');
const whatsappRuntime = require('../../config/whatsappRuntime');
const config = require('../../config');
const { requireAdmin, parseCookies, verifySessionCookie, signSessionExp } = require('../middleware/adminAuth');

function webhookUrl(token) {
  const base = (config.webhookBaseUrl || '').replace(/\/$/, '');
  return `${base}/webhook/entrada/${token}`;
}

function metaWebhookUrl() {
  const base = (config.webhookBaseUrl || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/webhook/whatsapp`;
}

const router = express.Router();

router.post('/api/auth/login', express.json(), (req, res) => {
  if (!config.adminPassword) {
    return res.json({ ok: true, auth_required: false });
  }
  const { password } = req.body || {};
  if (password !== config.adminPassword) {
    return res.status(401).json({ error: 'Senha inválida' });
  }
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const token = signSessionExp(exp);
  const maxAge = 7 * 24 * 60 * 60;
  res.setHeader('Set-Cookie', `admin_sess=${token}; HttpOnly; Path=/admin; SameSite=Lax; Max-Age=${maxAge}`);
  res.json({ ok: true, auth_required: true });
});

router.get('/api/auth/status', (req, res) => {
  const required = !!config.adminPassword;
  const cookies = parseCookies(req);
  const ok = !required || verifySessionCookie(cookies.admin_sess);
  res.json({ auth_required: required, ok });
});

router.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_sess=; HttpOnly; Path=/admin; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

router.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (req.path.startsWith('/api/auth/')) return next();
  return requireAdmin(req, res, next);
});

router.get('/api/clientes', async (req, res) => {
  try {
    const rows = await repos.adminListClientes();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/agendamentos-hoje', async (req, res) => {
  try {
    const rows = await repos.adminAgendamentosDoDia();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/mensagens/:clienteId', async (req, res) => {
  try {
    const rows = await repos.adminMensagensCliente(req.params.clienteId);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/estatisticas', async (req, res) => {
  try {
    const row = await repos.adminEstatisticas();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/empresa', async (req, res) => {
  try {
    const lista = await reposEmpresa.listEmpresas();
    res.json(
      lista.map((e) => ({
        id: e.id,
        nome: e.nome,
        email: e.email || '',
        cnpj: e.cnpj || '',
        status: e.status,
        webhook_url: webhookUrl(e.webhook_token),
        created_at: e.created_at,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/api/empresa/:id', express.json(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id !== 1) {
      return res.status(403).json({ error: 'Nesta instância só é permitido editar a empresa id 1.' });
    }
    const { nome, email, cnpj } = req.body || {};
    if (nome !== undefined && !String(nome).trim()) {
      return res.status(400).json({ error: 'O campo "nome" não pode ser vazio.' });
    }
    const updated = await reposEmpresa.updateEmpresa(id, { nome, email, cnpj });
    if (!updated) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json({
      id: updated.id,
      nome: updated.nome,
      email: updated.email || '',
      cnpj: updated.cnpj || '',
      status: updated.status,
      webhook_url: webhookUrl(updated.webhook_token),
      created_at: updated.created_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/empresa', express.json(), async (req, res) => {
  try {
    const { nome, email, cnpj } = req.body || {};
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: 'O campo "nome" é obrigatório.' });
    }
    const empresa = await reposEmpresa.insertEmpresa({ nome, email, cnpj });
    res.status(201).json({
      id: empresa.id,
      nome: empresa.nome,
      email: empresa.email || '',
      cnpj: empresa.cnpj || '',
      status: empresa.status,
      webhook_url: webhookUrl(empresa.webhook_token),
      created_at: empresa.created_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/whatsapp-settings', async (req, res) => {
  try {
    const masked = await reposWhatsapp.getMaskedForAdmin(1);
    const merged = await whatsappRuntime.loadMerged();
    res.json({
      ...masked,
      effective_provider: merged.provider || 'auto',
      env_fallback: {
        token: !!config.whatsapp.token,
        phoneNumberId: !!config.whatsapp.phoneNumberId,
        verifyToken: !!config.whatsapp.verifyToken,
        appSecret: !!config.whatsapp.appSecret,
        uazapiInstanceToken: !!(config.uazapi && config.uazapi.instanceToken),
        uazapiBaseUrl: !!(config.uazapi && config.uazapi.baseUrl),
      },
      effective_preview: {
        phone_number_id: merged.phoneNumberId || '',
        uazapi_base_url: merged.uazapiBaseUrl || '',
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/whatsapp-settings', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, 'phone_number_id')) {
      patch.phone_number_id = body.phone_number_id;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'verify_token')) {
      patch.verify_token = body.verify_token;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'access_token')) {
      patch.access_token = body.access_token;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'app_secret')) {
      patch.app_secret = body.app_secret;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'uazapi_base_url')) {
      patch.uazapi_base_url = body.uazapi_base_url;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'uazapi_instance_token')) {
      patch.uazapi_instance_token = body.uazapi_instance_token;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'uazapi_admin_token')) {
      patch.uazapi_admin_token = body.uazapi_admin_token;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'uazapi_instance_phone')) {
      patch.uazapi_instance_phone = body.uazapi_instance_phone;
    }
    await reposWhatsapp.updatePartial(1, patch);
    whatsappRuntime.invalidateCache();
    const masked = await reposWhatsapp.getMaskedForAdmin(1);
    res.json({ ok: true, ...masked });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/public-urls', async (req, res) => {
  try {
    const emp = await reposEmpresa.findEmpresaById(1);
    const uazapi = emp && emp.webhook_token ? webhookUrl(emp.webhook_token) : '';
    res.json({
      uazapi_webhook_url: uazapi,
      meta_webhook_url: metaWebhookUrl(),
      oazap_webhook_url: uazapi,
      webhook_base_configured: !!(config.webhookBaseUrl && String(config.webhookBaseUrl).trim()),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/config-agendamento', async (req, res) => {
  try {
    const row = await reposAgendamento.getConfig();
    if (!row) return res.json(null);
    res.json({
      id: row.id,
      empresa_id: row.empresa_id,
      phone_number_id: row.phone_number_id,
      phone_number_numero: row.phone_number_numero,
      jid_operador: row.jid_operador,
      horarios_disponiveis: row.horarios_disponiveis || [],
      mensagem_boas_vindas: row.mensagem_boas_vindas || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/config-agendamento', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await reposAgendamento.getConfig();
    const jid_operador =
      body.jid_operador !== undefined ? body.jid_operador : existing ? existing.jid_operador : null;
    const horarios_disponiveis = Array.isArray(body.horarios_disponiveis)
      ? body.horarios_disponiveis
      : existing && existing.horarios_disponiveis
        ? existing.horarios_disponiveis
        : [];
    const mensagem_boas_vindas =
      body.mensagem_boas_vindas !== undefined
        ? body.mensagem_boas_vindas || ''
        : existing
          ? existing.mensagem_boas_vindas || ''
          : '';
    let phone_number_id;
    if (body.phone_number_id !== undefined) {
      phone_number_id =
        body.phone_number_id === null || body.phone_number_id === ''
          ? null
          : String(body.phone_number_id).trim();
    } else {
      phone_number_id = existing ? existing.phone_number_id : null;
    }
    let phone_number_numero;
    if (body.phone_number_numero !== undefined) {
      phone_number_numero =
        body.phone_number_numero === null || body.phone_number_numero === ''
          ? null
          : String(body.phone_number_numero).trim() || null;
    } else {
      phone_number_numero = existing ? existing.phone_number_numero : null;
    }
    const saved = await reposAgendamento.upsertConfig({
      jid_operador,
      horarios_disponiveis,
      mensagem_boas_vindas,
      phone_number_id,
      phone_number_numero,
    });
    res.json({
      id: saved.id,
      empresa_id: saved.empresa_id,
      jid_operador: saved.jid_operador,
      horarios_disponiveis: saved.horarios_disponiveis,
      mensagem_boas_vindas: saved.mensagem_boas_vindas,
      phone_number_id: saved.phone_number_id,
      phone_number_numero: saved.phone_number_numero,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = router;
