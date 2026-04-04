'use strict';

const { query } = require('./connection');
const repos = require('./repos');
const { sendTextNotify } = require('../whatsapp/notify');

const EMPRESA_ID = 1;

async function getConfig() {
  const r = await query(`SELECT * FROM fidelidade_config WHERE empresa_id = $1`, [EMPRESA_ID]);
  return r.rows[0] || null;
}

async function upsertConfig(fields) {
  const cur = await getConfig();
  const ativo = fields.ativo !== undefined ? !!fields.ativo : cur?.ativo ?? false;
  const centavos_por_ponto =
    fields.centavos_por_ponto != null ? Math.max(1, parseInt(String(fields.centavos_por_ponto), 10) || 100) : cur?.centavos_por_ponto ?? 100;
  const pontos_resgate_minimo =
    fields.pontos_resgate_minimo != null
      ? Math.max(1, parseInt(String(fields.pontos_resgate_minimo), 10) || 100)
      : cur?.pontos_resgate_minimo ?? 100;
  const desconto_resgate_centavos =
    fields.desconto_resgate_centavos != null
      ? Math.max(1, parseInt(String(fields.desconto_resgate_centavos), 10) || 1000)
      : cur?.desconto_resgate_centavos ?? 1000;
  const notificar_marco_pontos =
    fields.notificar_marco_pontos != null
      ? Math.max(1, parseInt(String(fields.notificar_marco_pontos), 10) || 100)
      : cur?.notificar_marco_pontos ?? 100;

  await query(
    `INSERT INTO fidelidade_config (empresa_id, ativo, centavos_por_ponto, pontos_resgate_minimo, desconto_resgate_centavos, notificar_marco_pontos, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (empresa_id) DO UPDATE SET
       ativo = EXCLUDED.ativo,
       centavos_por_ponto = EXCLUDED.centavos_por_ponto,
       pontos_resgate_minimo = EXCLUDED.pontos_resgate_minimo,
       desconto_resgate_centavos = EXCLUDED.desconto_resgate_centavos,
       notificar_marco_pontos = EXCLUDED.notificar_marco_pontos,
       updated_at = NOW()`,
    [EMPRESA_ID, ativo, centavos_por_ponto, pontos_resgate_minimo, desconto_resgate_centavos, notificar_marco_pontos]
  );
  return getConfig();
}

async function saldoCliente(clienteId) {
  const r = await query(`SELECT COALESCE(SUM(delta), 0)::int AS s FROM pontos_movimentos WHERE cliente_id = $1`, [clienteId]);
  return r.rows[0].s;
}

async function addMovimento({ cliente_id, delta, motivo, agendamento_id, pagamento_id }) {
  await query(
    `INSERT INTO pontos_movimentos (cliente_id, delta, motivo, agendamento_id, pagamento_id) VALUES ($1, $2, $3, $4, $5)`,
    [cliente_id, delta, motivo, agendamento_id || null, pagamento_id || null]
  );
}

async function creditarPorPagamento({ cliente_id, valor_centavos, pagamento_id, agendamento_id }) {
  const cfg = await getConfig();
  if (!cfg || !cfg.ativo) return { pontos: 0 };
  const cpp = cfg.centavos_por_ponto || 100;
  const pontos = Math.floor(valor_centavos / cpp);
  if (pontos <= 0) return { pontos: 0 };

  const antes = await saldoCliente(cliente_id);
  await addMovimento({
    cliente_id,
    delta: pontos,
    motivo: 'Pagamento registrado',
    agendamento_id,
    pagamento_id,
  });
  const depois = antes + pontos;
  const marco = cfg.notificar_marco_pontos || 100;
  if (marco > 0 && Math.floor(depois / marco) > Math.floor(antes / marco)) {
    const cli = await repos.findClienteById(cliente_id);
    if (cli && cli.telefone) {
      const atingido = Math.floor(depois / marco) * marco;
      await sendTextNotify(cli.telefone, `🎁 Fidelidade: você passou de ${atingido} pontos! Saldo atual: ${depois} pts. Obrigado por preferir nosso lavajato!`);
    }
  }
  return { pontos, saldo: depois };
}

async function resgatarPontos({ cliente_id, pontos }) {
  const cfg = await getConfig();
  if (!cfg || !cfg.ativo) throw new Error('Programa de fidelidade inativo');
  const p = parseInt(String(pontos), 10);
  if (!p || p < cfg.pontos_resgate_minimo) throw new Error(`Mínimo de ${cfg.pontos_resgate_minimo} pontos para resgate`);
  const saldo = await saldoCliente(cliente_id);
  if (saldo < p) throw new Error('Saldo insuficiente');
  await addMovimento({
    cliente_id,
    delta: -p,
    motivo: `Resgate: desconto R$ ${(cfg.desconto_resgate_centavos / 100).toFixed(2)}`,
    agendamento_id: null,
    pagamento_id: null,
  });
  return { desconto_centavos: cfg.desconto_resgate_centavos, saldo_apos: saldo - p };
}

async function listMovimentos(clienteId, limit = 50) {
  const r = await query(
    `SELECT id, delta, motivo, created_at FROM pontos_movimentos WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [clienteId, limit]
  );
  return r.rows;
}

module.exports = {
  getConfig,
  upsertConfig,
  saldoCliente,
  addMovimento,
  creditarPorPagamento,
  resgatarPontos,
  listMovimentos,
};
