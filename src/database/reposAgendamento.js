'use strict';

/**
 * Agendamento SaaS — modelo single-tenant por deploy.
 * Cada instalação (lavajato, etc.) roda com uma única empresa lógica no banco (id = 1, seed na migração 002).
 * Outros verticais = outro repositório/deploy, não multi-tenant neste projeto.
 */
const { query } = require('./connection');

const EMPRESA_ID = 1;

async function getConfig() {
  const r = await query(
    `SELECT id, empresa_id, jid_operador, horarios_disponiveis, mensagem_boas_vindas,
            phone_number_id, phone_number_numero,
            aprovacao_automatica, vagas_por_slot, horarios_bloqueados,
            updated_at
     FROM agendamento_config WHERE empresa_id = $1`,
    [EMPRESA_ID]
  );
  return r.rows[0] || null;
}

async function upsertConfig({
  jid_operador,
  horarios_disponiveis,
  mensagem_boas_vindas,
  phone_number_id,
  phone_number_numero,
  aprovacao_automatica,
  vagas_por_slot,
  horarios_bloqueados,
}) {
  const existing = await getConfig();
  const hj = JSON.stringify(horarios_disponiveis || []);
  const hb = JSON.stringify(horarios_bloqueados != null ? horarios_bloqueados : existing?.horarios_bloqueados || []);
  if (existing) {
    await query(
      `UPDATE agendamento_config SET
        jid_operador = $2,
        horarios_disponiveis = $3::jsonb,
        mensagem_boas_vindas = COALESCE($4, ''),
        phone_number_id = $5,
        phone_number_numero = $6,
        aprovacao_automatica = COALESCE($7, aprovacao_automatica),
        vagas_por_slot = COALESCE($8, vagas_por_slot),
        horarios_bloqueados = $9::jsonb,
        updated_at = NOW()
       WHERE empresa_id = $1`,
      [
        EMPRESA_ID,
        jid_operador || null,
        hj,
        mensagem_boas_vindas,
        phone_number_id ?? null,
        phone_number_numero ?? null,
        typeof aprovacao_automatica === 'boolean' ? aprovacao_automatica : existing.aprovacao_automatica,
        vagas_por_slot != null ? Math.max(1, parseInt(String(vagas_por_slot), 10) || 1) : existing.vagas_por_slot || 1,
        hb,
      ]
    );
    return getConfig();
  }
  const ins = await query(
    `INSERT INTO agendamento_config (empresa_id, jid_operador, horarios_disponiveis, mensagem_boas_vindas, phone_number_id, phone_number_numero,
      aprovacao_automatica, vagas_por_slot, horarios_bloqueados)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, COALESCE($7, false), COALESCE($8, 1), $9::jsonb)
     RETURNING *`,
    [
      EMPRESA_ID,
      jid_operador || null,
      hj,
      mensagem_boas_vindas || '',
      phone_number_id ?? null,
      phone_number_numero ?? null,
      typeof aprovacao_automatica === 'boolean' ? aprovacao_automatica : false,
      vagas_por_slot != null ? Math.max(1, parseInt(String(vagas_por_slot), 10) || 1) : 1,
      hb,
    ]
  );
  return ins.rows[0];
}

async function listPendentes() {
  const r = await query(
    `SELECT id, cliente_nome, cliente_jid, horario_escolhido, descricao, created_at AS data_criacao
     FROM solicitacoes_pendentes WHERE empresa_id = $1 ORDER BY created_at DESC`,
    [EMPRESA_ID]
  );
  return r.rows;
}

async function listAgendamentos(statusFilter) {
  let sql = `
    SELECT a.id, c.nome AS cliente_nome, a.horario AS data_hora, a.duracao, a.status,
           COALESCE(a.descricao_problema, a.descricao, '') AS descricao_problema,
           a.status_fila, a.origem, v.placa AS veiculo_placa, v.modelo AS veiculo_modelo
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN veiculos v ON v.id = a.veiculo_id
    WHERE 1=1`;
  const params = [];
  if (statusFilter && statusFilter !== 'todos') {
    params.push(statusFilter);
    sql += ` AND LOWER(a.status) = LOWER($${params.length})`;
  }
  sql += ` ORDER BY a.horario DESC`;
  const r = await query(sql, params);
  return r.rows;
}

async function deleteAgendamento(id) {
  await query(`DELETE FROM lembretes WHERE agendamento_id = $1`, [id]);
  const r = await query(`DELETE FROM agendamentos WHERE id = $1 RETURNING id`, [id]);
  return r.rowCount > 0;
}

async function listServicos() {
  const r = await query(
    `SELECT id, nome, categoria, preco_centavos AS preco, descricao
     FROM agendamento_servicos WHERE empresa_id = $1 ORDER BY nome`,
    [EMPRESA_ID]
  );
  return r.rows;
}

async function insertServico({ nome, categoria, preco_centavos, descricao }) {
  const r = await query(
    `INSERT INTO agendamento_servicos (empresa_id, nome, categoria, preco_centavos, descricao)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, categoria, preco_centavos AS preco, descricao`,
    [EMPRESA_ID, nome, categoria, preco_centavos, descricao || '']
  );
  return r.rows[0];
}

async function insertServicosBulk(rows) {
  let criados = 0;
  const erros = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.nome || !row.categoria || !row.preco_centavos || row.preco_centavos <= 0) {
        erros.push(`Linha ${i + 2}: nome, categoria e preço válido são obrigatórios`);
        continue;
      }
      await insertServico(row);
      criados++;
    } catch (e) {
      erros.push(`Linha ${i + 2}: ${e.message}`);
    }
  }
  return { criados, erros };
}

async function deleteServico(id) {
  const r = await query(
    `DELETE FROM agendamento_servicos WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, EMPRESA_ID]
  );
  return r.rowCount > 0;
}

async function getServicoById(id) {
  const r = await query(
    `SELECT id, nome, categoria, preco_centavos AS preco, descricao FROM agendamento_servicos WHERE id = $1 AND empresa_id = $2`,
    [id, EMPRESA_ID]
  );
  return r.rows[0] || null;
}

module.exports = {
  EMPRESA_ID,
  getConfig,
  upsertConfig,
  listPendentes,
  listAgendamentos,
  deleteAgendamento,
  listServicos,
  insertServico,
  insertServicosBulk,
  deleteServico,
  getServicoById,
};
