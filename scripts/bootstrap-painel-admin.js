'use strict';

/**
 * Cria o primeiro usuário do painel (e-mail + senha).
 * Uso: PAINEL_BOOTSTRAP_EMAIL=a@b.com PAINEL_BOOTSTRAP_PASSWORD=xxx node scripts/bootstrap-painel-admin.js
 */
require('dotenv').config();
const reposPainelUsuarios = require('../src/database/reposPainelUsuarios');

async function main() {
  const email = process.env.PAINEL_BOOTSTRAP_EMAIL;
  const password = process.env.PAINEL_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    console.error('Defina PAINEL_BOOTSTRAP_EMAIL e PAINEL_BOOTSTRAP_PASSWORD');
    process.exit(1);
  }
  const n = await reposPainelUsuarios.count();
  if (n > 0) {
    console.log('Já existem usuários em painel_usuarios. Nada a fazer.');
    process.exit(0);
  }
  await reposPainelUsuarios.createUser({ email, password, role: 'gestor' });
  console.log('Gestor criado:', email);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
