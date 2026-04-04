'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definido');
    process.exit(1);
  }
  const needsSsl =
    url.includes('amazonaws.com') ||
    url.includes('render.com') ||
    url.includes('onrender.com') ||
    process.env.PGSSLMODE === 'require';
  const client = new Client({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : false });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const { rows: applied } = await client.query('SELECT filename FROM _migrations');
  const appliedSet = new Set(applied.map((r) => r.filename));

  const migDir = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    if (appliedSet.has(f)) {
      console.log('Migração já aplicada (ignorando):', f);
      continue;
    }
    const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      console.log('Migração aplicada:', f);
    } catch (err) {
      console.error(`Erro na migração ${f}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
