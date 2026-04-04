'use strict';

const express = require('express');
const repos = require('../database/reposEmpresa');
const config = require('../config');

const router = express.Router();

/** Indica se já existe linha em `empresas` (deploy já “registrado”; modelo single-tenant). */
router.get('/status', async (req, res) => {
  try {
    const has_empresa = await repos.hasAnyEmpresa();
    res.json({ has_empresa });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function webhookUrl(token) {
  const base = (config.webhookBaseUrl || '').replace(/\/$/, '');
  return `${base}/webhook/entrada/${token}`;
}

// POST /empresa — cadastro público (cliente self-service ou admin)
router.post('/', async (req, res) => {
  try {
    const { nome, email, cnpj } = req.body || {};
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: 'O campo "nome" é obrigatório.' });
    }
    const empresa = await repos.insertEmpresa({ nome, email, cnpj });
    res.status(201).json({
      id: empresa.id,
      nome: empresa.nome,
      email: empresa.email,
      cnpj: empresa.cnpj,
      status: empresa.status,
      webhook_url: webhookUrl(empresa.webhook_token),
      created_at: empresa.created_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listagem e detalhe ficam apenas em /admin/api/empresa (sem expor dados no endpoint público).

module.exports = router;
