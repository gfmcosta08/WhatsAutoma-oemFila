'use strict';

function parseWhatsAppTs(ts) {
  if (ts == null || ts === '') return null;
  if (typeof ts === 'string') {
    const s = ts.trim();
    // ISO-8601 (ex.: oazap.dev / outras integrações)
    if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (Number.isNaN(n)) return null;
  return new Date(n * 1000);
}

module.exports = { parseWhatsAppTs };
