'use strict';

const { query } = require('./connection');

async function sumPagamentosPeriodo(fromStr, toStr) {
  const r = await query(
    `SELECT COALESCE(SUM(valor_centavos), 0)::bigint AS t,
            COUNT(*)::int AS n
     FROM pagamentos
     WHERE created_at::date >= $1::date AND created_at::date <= $2::date`,
    [fromStr, toStr]
  );
  return { total_centavos: Number(r.rows[0].t), quantidade: r.rows[0].n };
}

async function pagamentosPorMetodo(fromStr, toStr) {
  const r = await query(
    `SELECT metodo, COALESCE(SUM(valor_centavos), 0)::bigint AS total, COUNT(*)::int AS q
     FROM pagamentos
     WHERE created_at::date >= $1::date AND created_at::date <= $2::date
     GROUP BY metodo`,
    [fromStr, toStr]
  );
  return r.rows.map((x) => ({ metodo: x.metodo, total_centavos: Number(x.total), quantidade: x.q }));
}

async function pagamentosPorDia(fromStr, toStr) {
  const r = await query(
    `SELECT created_at::date AS dia,
            COALESCE(SUM(valor_centavos), 0)::bigint AS total
     FROM pagamentos
     WHERE created_at::date >= $1::date AND created_at::date <= $2::date
     GROUP BY 1 ORDER BY 1`,
    [fromStr, toStr]
  );
  return r.rows.map((x) => ({ dia: x.dia, total_centavos: Number(x.total) }));
}

async function rankingServicos(fromStr, toStr, limit = 20) {
  const r = await query(
    `SELECT COALESCE(NULLIF(TRIM(a.servico), ''), '(sem nome)') AS servico, COUNT(*)::int AS q
     FROM agendamentos a
     WHERE a.horario::date >= $1::date AND a.horario::date <= $2::date
     AND a.status NOT IN ('cancelado', 'reagendado')
     GROUP BY 1 ORDER BY q DESC LIMIT $3`,
    [fromStr, toStr, limit]
  );
  return r.rows;
}

async function listPagamentosDetalhe(fromStr, toStr) {
  const r = await query(
    `SELECT p.created_at, p.metodo, p.valor_centavos, a.servico, c.nome AS cliente_nome
     FROM pagamentos p
     JOIN agendamentos a ON a.id = p.agendamento_id
     JOIN clientes c ON c.id = a.cliente_id
     WHERE p.created_at::date >= $1::date AND p.created_at::date <= $2::date
     ORDER BY p.created_at`,
    [fromStr, toStr]
  );
  return r.rows;
}

module.exports = {
  sumPagamentosPeriodo,
  pagamentosPorMetodo,
  pagamentosPorDia,
  rankingServicos,
  listPagamentosDetalhe,
};
