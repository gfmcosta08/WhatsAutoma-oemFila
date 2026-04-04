'use strict';

const Redis = require('ioredis');

let client;

function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    });
  }
  return client;
}

async function getSessaoCache(clienteId) {
  const r = getRedis();
  if (!r) return null;
  const key = `sessao:${clienteId}`;
  const raw = await r.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setSessaoCache(clienteId, sessao, ttlSec = 3600) {
  const r = getRedis();
  if (!r) return;
  const key = `sessao:${clienteId}`;
  await r.set(key, JSON.stringify(sessao), 'EX', ttlSec);
}

async function invalidateSessaoCache(clienteId) {
  const r = getRedis();
  if (!r) return;
  await r.del(`sessao:${clienteId}`);
}

module.exports = { getRedis, getSessaoCache, setSessaoCache, invalidateSessaoCache };
