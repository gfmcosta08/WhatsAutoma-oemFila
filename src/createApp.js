'use strict';

const express = require('express');
const cors = require('cors');
const { router: webhookRouter } = require('./webhook/receiver');
const adminRouter = require('./admin/routes/dashboard');
const internalRouter = require('./internal/notify');
const agendamentoRouter = require('./routes/agendamento');
const publicAgendaRouter = require('./routes/publicAgenda');
const empresaRouter = require('./routes/empresa');

/**
 * Mesma origem (Next + API no mesmo host, ex.: Replit com uma porta):
 * GET /agendamento é a página Next; demais /agendamento/* vão para a API Express.
 */
const sameOriginNext = String(process.env.SAME_ORIGIN_NEXT || '').toLowerCase() === 'true';

function createApp() {
  const app = express();

  app.use('/webhook', webhookRouter);
  const corsOrigin =
    process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim()
      ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
      : true;
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use('/public', publicAgendaRouter);
  if (sameOriginNext) {
    app.use('/agendamento', (req, res, next) => {
      const pathOnly = String(req.url || '').split('?')[0];
      if (req.method === 'GET' && (pathOnly === '/' || pathOnly === '')) {
        return next();
      }
      agendamentoRouter(req, res, next);
    });
  } else {
    app.use('/agendamento', agendamentoRouter);
  }
  app.use('/empresa', empresaRouter);
  app.use('/admin', adminRouter);
  app.use('/internal', internalRouter);

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'lavajato-whatsapp' });
  });

  return app;
}

module.exports = { createApp, sameOriginNext };
