'use strict';

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL não configurado');
    const ssl =
      connectionString.includes('render.com') ||
      connectionString.includes('amazonaws.com') ||
      process.env.PGSSLMODE === 'require'
        ? { rejectUnauthorized: false }
        : false;
    pool = new Pool({ connectionString, ssl, max: 20, idleTimeoutMillis: 30000 });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, query };
