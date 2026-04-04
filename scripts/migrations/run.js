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
    process.env.PGSSLMODE === 'require';
  const client = new Client({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : false });
  await client.connect();
  const migDir = path.join(__dirname, '..', '..', 'src', 'database', 'migrations');
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    await client.query(sql);
    console.log('Migração aplicada:', f);
  }
  await client.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
