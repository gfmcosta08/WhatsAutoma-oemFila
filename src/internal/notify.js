'use strict';

const express = require('express');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/notify', express.json(), async (req, res) => {
  const secret = process.env.INTERNAL_NOTIFY_SECRET;
  if (secret && req.get('x-internal-secret') !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { evento, dados } = req.body || {};
  await logger.info('internal', 'notify', { evento, dados });
  res.json({ ok: true });
});

module.exports = router;
