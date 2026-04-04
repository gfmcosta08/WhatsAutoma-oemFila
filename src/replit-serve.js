'use strict';

/**
 * Um único processo na PORT do Replit: API Express + Next (web/).
 * Build: cd web && npm run build
 * Env: SAME_ORIGIN_NEXT=true (definido aqui), NEXT_PUBLIC_API_URL vazio no build do Next.
 */
require('dotenv').config();
process.env.SAME_ORIGIN_NEXT = 'true';

const path = require('path');
const http = require('http');
const { createApp } = require('./createApp');
const { iniciar } = require('./scheduler');

const webDir = path.join(__dirname, '..', 'web');
let next;
try {
  next = require(require.resolve('next', { paths: [webDir] }));
} catch (e) {
  console.error(
    '[replit-serve] Next.js não encontrado. Rode: cd web && npm install && npm run build'
  );
  process.exit(1);
}

const dev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
const nextApp = next({ dev, dir: webDir });
const handle = nextApp.getRequestHandler();

const port = parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

nextApp.prepare().then(() => {
  const app = createApp();
  app.all('*', (req, res) => handle(req, res));

  http.createServer(app).listen(port, host, () => {
    console.log(`[replit] API + Next em http://${host}:${port}`);
    iniciar();
  });
}).catch((err) => {
  console.error('[replit-serve]', err);
  process.exit(1);
});
