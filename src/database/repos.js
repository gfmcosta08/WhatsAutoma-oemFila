'use strict';

const { v4: uuidv4 } = require('uuid');
const { query } = require('./connection');

async function findClienteByTelefone(telefone) {
  const r = await query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
  return r.rows[0] || null;
}

async function insertCliente({ telefone, nome, whatsapp_name }) {
  const id = uuidv4();
  await query(
    `INSERT INTO clientes (id, telefone, nome, whatsapp_name, primeiro_contato, status, ultima_interacao, total_mensagens)
     VALUES ($1, $2, $3, $4, NOW(), 'ativo', NOW(), 0)`,
    [id, telefone, nome || null, whatsapp_name || null]
  );
  return findClienteById(id);
}

async function findClienteById(id) {
  const r = await query('SELECT * FROM clientes WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function updateClienteUltimaInteracao(clienteId) {
  await query(
    `UPDATE clientes SET ultima_interacao = NOW(), total_mensagens = total_mensagens + 1, updated_at = NOW() WHERE id = $1`,
    [clienteId]
  );
}

async function updateClienteNome(clienteId, nome) {
  await query(`UPDATE clientes SET nome = $2, updated_at = NOW() WHERE id = $1`, [clienteId, nome]);
}

async function findSessaoByClienteId(clienteId) {
  const r = await query('SELECT * FROM sessoes WHERE cliente_id = $1 ORDER BY updated_at DESC LIMIT 1', [clienteId]);
  return r.rows[0] || null;
}

async function insertSessao(clienteId, estado_atual, dados_temporarios = {}) {
  const id = uuidv4();
  await query(
    `INSERT INTO sessoes (id, cliente_id, estado_atual, dados_temporarios) VALUES ($1, $2, $3, $4::jsonb)`,
    [id, clienteId, estado_atual, JSON.stringify(dados_temporarios)]
  );
  return findSessaoById(id);
}

async function findSessaoById(id) {
  const r = await query('SELECT * FROM sessoes WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function updateSessao(sessaoId, fields) {
  const { estado_atual, dados_temporarios, ultima_mensagem_id, ultimo_menu_enviado, tentativas_erro } = fields;
  const parts = [];
  const vals = [];
  let i = 1;
  if (estado_atual !== undefined) {
    parts.push(`estado_atual = $${i++}`);
    vals.push(estado_atual);
  }
  if (dados_temporarios !== undefined) {
    parts.push(`dados_temporarios = $${i++}::jsonb`);
    vals.push(JSON.stringify(dados_temporarios));
  }
  if (ultima_mensagem_id !== undefined) {
    parts.push(`ultima_mensagem_id = $${i++}`);
    vals.push(ultima_mensagem_id);
  }
  if (ultimo_menu_enviado !== undefined) {
    parts.push(`ultimo_menu_enviado = $${i++}`);
    vals.push(ultimo_menu_enviado);
  }
  if (tentativas_erro !== undefined) {
    parts.push(`tentativas_erro = $${i++}`);
    vals.push(tentativas_erro);
  }
  parts.push('updated_at = NOW()');
  vals.push(sessaoId);
  await query(`UPDATE sessoes SET ${parts.join(', ')} WHERE id = $${i}`, vals);
}

async function mergeSessaoDadosTemporarios(clienteId, novos) {
  await query(
    `UPDATE sessoes SET dados_temporarios = COALESCE(dados_temporarios, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
     WHERE id = (SELECT id FROM sessoes WHERE cliente_id = $1 ORDER BY updated_at DESC LIMIT 1)`,
    [clienteId, JSON.stringify(novos)]
  );
}

async function insertMensagemInbound(row) {
  const id = uuidv4();
  await query(
    `INSERT INTO mensagens (id, cliente_id, direcao, texto, tipo, whatsapp_message_id, whatsapp_timestamp, status_entrega, estado_na_momento, tempo_resposta_ms)
     VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      row.cliente_id,
      row.texto,
      row.tipo || 'texto',
      row.whatsapp_message_id,
      row.whatsapp_timestamp,
      row.status_entrega || 'entregue',
      row.estado_na_momento,
      row.tempo_resposta_ms,
    ]
  );
  return id;
}

async function insertMensagemOutbound(row) {
  const id = uuidv4();
  await query(
    `INSERT INTO mensagens (id, cliente_id, direcao, texto, tipo, estado_na_momento, status_entrega)
     VALUES ($1, $2, 'outbound', $3, $4, $5, $6)`,
    [
      id,
      row.cliente_id,
      row.texto,
      row.tipo || 'texto',
      row.estado_na_momento != null ? row.estado_na_momento : null,
      row.status_entrega || 'enviada',
    ]
  );
  return id;
}

async function insertHistoricoEstado({ cliente_id, sessao_id, estado_anterior, estado_novo, mensagem_trigger, metadata }) {
  const id = uuidv4();
  await query(
    `INSERT INTO historico_estados (id, cliente_id, sessao_id, estado_anterior, estado_novo, mensagem_trigger, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, cliente_id, sessao_id, estado_anterior, estado_novo, mensagem_trigger, metadata || {}]
  );
}

async function insertAgendamento({
  cliente_id,
  horario,
  servico,
  descricao,
  status,
  reagendado_de_id,
  veiculo_id,
  servico_catalogo_id,
  origem,
}) {
  const id = uuidv4();
  await query(
    `INSERT INTO agendamentos (id, cliente_id, horario, servico, descricao, status, reagendado_de_id,
      veiculo_id, servico_catalogo_id, origem, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'whatsapp'), NOW())`,
    [
      id,
      cliente_id,
      horario,
      servico,
      descricao,
      status,
      reagendado_de_id || null,
      veiculo_id || null,
      servico_catalogo_id || null,
      origem || null,
    ]
  );
  return findAgendamentoById(id);
}

async function findAgendamentoById(id) {
  const r = await query('SELECT * FROM agendamentos WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function findAgendamentoAtivoPorCliente(clienteId) {
  const r = await query(
    `SELECT * FROM agendamentos WHERE cliente_id = $1 AND status IN ('pendente', 'confirmado') ORDER BY horario ASC LIMIT 1`,
    [clienteId]
  );
  return r.rows[0] || null;
}

async function updateAgendamentoCancelar(agendamentoId, status_anterior, motivo) {
  await query(
    `UPDATE agendamentos SET status = 'cancelado', status_anterior = $2, cancelado_em = NOW(),
     motivo_cancelamento = $3, cancelado_por = 'cliente', updated_at = NOW() WHERE id = $1`,
    [agendamentoId, status_anterior, motivo]
  );
}

async function updateAgendamentoCancelarOperador(agendamentoId, status_anterior, motivo) {
  await query(
    `UPDATE agendamentos SET status = 'cancelado', status_anterior = $2, cancelado_em = NOW(),
     motivo_cancelamento = $3, cancelado_por = 'operador', updated_at = NOW() WHERE id = $1`,
    [agendamentoId, status_anterior, motivo || 'Cancelado pelo gerente']
  );
}

async function updateAgendamentoConfirmar(agendamentoId) {
  await query(
    `UPDATE agendamentos SET status = 'confirmado', confirmado_em = NOW(), confirmado_por = 'operador', updated_at = NOW()
     WHERE id = $1 AND status = 'pendente'`,
    [agendamentoId]
  );
}

async function findOldestAgendamentoPendente() {
  const r = await query(
    `SELECT a.*, c.telefone, c.nome
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     WHERE a.status = 'pendente'
     ORDER BY a.created_at ASC NULLS LAST, a.horario ASC
     LIMIT 1`
  );
  return r.rows[0] || null;
}

async function updateAgendamentoReagendado(origemId, novoId, statusAnt) {
  await query(
    `UPDATE agendamentos SET status = 'reagendado', status_anterior = $2, reagendado_para_id = $3, updated_at = NOW() WHERE id = $1`,
    [origemId, statusAnt, novoId]
  );
}

async function insertLembretesParaAgendamento({ cliente_id, agendamento_id, horario }) {
  const base = new Date(horario);
  const rows = [
    { tipo: 'confirmacao', disparo_em: new Date() },
    { tipo: 'lembrete_24h', disparo_em: new Date(base.getTime() - 24 * 60 * 60 * 1000) },
    { tipo: 'lembrete_1h', disparo_em: new Date(base.getTime() - 60 * 60 * 1000) },
  ];
  for (const r of rows) {
    const id = uuidv4();
    await query(
      `INSERT INTO lembretes (id, cliente_id, agendamento_id, tipo, disparo_em, status) VALUES ($1, $2, $3, $4, $5, 'pendente')`,
      [id, cliente_id, agendamento_id, r.tipo, r.disparo_em]
    );
  }
}

async function cancelarLembretesPendentes(agendamentoId) {
  await query(`UPDATE lembretes SET status = 'cancelado' WHERE agendamento_id = $1 AND status = 'pendente'`, [agendamentoId]);
}

async function listLembretesPendentesAteAgora() {
  const r = await query(
    `SELECT l.*, c.telefone, c.nome, a.horario, a.servico
     FROM lembretes l
     JOIN clientes c ON c.id = l.cliente_id
     JOIN agendamentos a ON a.id = l.agendamento_id
     WHERE l.disparo_em <= NOW() AND l.status = 'pendente'`
  );
  return r.rows;
}

async function updateLembreteEnviado(id, mensagem) {
  await query(
    `UPDATE lembretes SET status = 'enviado', mensagem_enviada = $2, enviado_em = NOW() WHERE id = $1`,
    [id, mensagem]
  );
}

async function incrementLembreteTentativas(id) {
  await query(`UPDATE lembretes SET tentativas = tentativas + 1 WHERE id = $1`, [id]);
}

async function updateLembreteFalhou(id) {
  await query(`UPDATE lembretes SET status = 'falhou' WHERE id = $1`, [id]);
}

async function getLembreteById(id) {
  const r = await query('SELECT * FROM lembretes WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function insertFilaRetry({ cliente_id, tipo, payload, proxima_tentativa }) {
  const id = uuidv4();
  await query(
    `INSERT INTO fila_retry (id, cliente_id, tipo, payload, tentativas, proxima_tentativa) VALUES ($1, $2, $3, $4::jsonb, 0, $5)`,
    [id, cliente_id, tipo, JSON.stringify(payload || {}), proxima_tentativa]
  );
  return id;
}

async function listFilaRetryProntos() {
  const r = await query(
    `SELECT * FROM fila_retry WHERE proxima_tentativa IS NULL OR proxima_tentativa <= NOW() ORDER BY created_at ASC LIMIT 50`
  );
  return r.rows;
}

async function deleteFilaRetry(id) {
  await query('DELETE FROM fila_retry WHERE id = $1', [id]);
}

async function updateFilaRetryErro(id, tentativas, erro, proxima) {
  await query(
    `UPDATE fila_retry SET tentativas = $2, erro_ultimo = $3, proxima_tentativa = $4 WHERE id = $1`,
    [id, tentativas, erro, proxima]
  );
}

/** PONTO 8 — consultas admin (estatísticas conforme documento) */
async function adminListClientes() {
  const r = await query(
    `SELECT id, nome, telefone, ultima_interacao, status FROM clientes ORDER BY ultima_interacao DESC NULLS LAST`
  );
  return r.rows;
}

async function adminAgendamentosDoDia() {
  const r = await query(
    `SELECT a.*, c.nome, c.telefone
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     WHERE DATE(a.horario) = CURRENT_DATE
     AND a.status IN ('pendente', 'confirmado')
     ORDER BY a.horario`
  );
  return r.rows;
}

async function adminMensagensCliente(clienteId, limit = 50) {
  const r = await query(
    `SELECT * FROM mensagens WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [clienteId, limit]
  );
  return r.rows;
}

async function adminEstatisticas() {
  const r = await query(
    `SELECT
       (SELECT COUNT(*)::bigint FROM clientes) AS total_clientes,
       (SELECT COUNT(*)::bigint FROM agendamentos
         WHERE horario IS NOT NULL AND status NOT IN ('cancelado','concluido')) AS agendamentos_ativos,
       (SELECT COUNT(*)::bigint FROM mensagens WHERE created_at > NOW() - INTERVAL '24 HOUR') AS mensagens_24h`
  );
  return r.rows[0];
}

module.exports = {
  findClienteByTelefone,
  insertCliente,
  findClienteById,
  updateClienteUltimaInteracao,
  updateClienteNome,
  findSessaoByClienteId,
  insertSessao,
  findSessaoById,
  updateSessao,
  mergeSessaoDadosTemporarios,
  insertMensagemInbound,
  insertMensagemOutbound,
  insertHistoricoEstado,
  insertAgendamento,
  findAgendamentoById,
  findAgendamentoAtivoPorCliente,
  updateAgendamentoCancelar,
  updateAgendamentoCancelarOperador,
  updateAgendamentoConfirmar,
  findOldestAgendamentoPendente,
  updateAgendamentoReagendado,
  insertLembretesParaAgendamento,
  cancelarLembretesPendentes,
  listLembretesPendentesAteAgora,
  updateLembreteEnviado,
  incrementLembreteTentativas,
  updateLembreteFalhou,
  getLembreteById,
  insertFilaRetry,
  listFilaRetryProntos,
  deleteFilaRetry,
  updateFilaRetryErro,
  adminListClientes,
  adminAgendamentosDoDia,
  adminMensagensCliente,
  adminEstatisticas,
};
