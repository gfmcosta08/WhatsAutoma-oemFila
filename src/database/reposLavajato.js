'use strict';

const { v4: uuidv4 } = require('uuid');
const { query, getPool } = require('./connection');
const repos = require('./repos');
const reposAgendamento = require('./reposAgendamento');
const { concreteSlotsFromConfig, isDataBloqueada } = require('../processor/horariosHelper');

function normalizeTelefone(t) {
  return String(t || '').replace(/\D/g, '');
}

function normalizePlaca(p) {
  return String(p || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

async function countOcupacaoHorario(horario) {
  const r = await query(
    `SELECT COUNT(*)::int AS c FROM agendamentos
     WHERE status NOT IN ('cancelado', 'reagendado')
     AND date_trunc('minute', horario) = date_trunc('minute', $1::timestamptz)`,
    [horario]
  );
  return r.rows[0].c;
}

async function listPublicSlots(numDays = 14) {
  const cfg = await reposAgendamento.getConfig();
  if (!cfg) return [];
  const vagas = Math.max(1, parseInt(String(cfg.vagas_por_slot), 10) || 1);
  const bloqueados = cfg.horarios_bloqueados;
  const candidatos = concreteSlotsFromConfig(cfg.horarios_disponiveis, numDays);
  const out = [];
  for (const { start, label } of candidatos) {
    if (isDataBloqueada(start, bloqueados)) continue;
    const c = await countOcupacaoHorario(start);
    if (c >= vagas) continue;
    out.push({ horario_iso: start.toISOString(), label });
  }
  return out;
}

async function upsertVeiculo(client, { cliente_id, placa, modelo, cor, ano }) {
  const p = normalizePlaca(placa);
  if (!p || !modelo) throw new Error('Placa e modelo obrigatórios');
  const r = await client.query(
    `INSERT INTO veiculos (id, cliente_id, placa, modelo, cor, ano)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (cliente_id, placa) DO UPDATE SET
       modelo = EXCLUDED.modelo, cor = EXCLUDED.cor, ano = EXCLUDED.ano
     RETURNING id`,
    [uuidv4(), cliente_id, p, String(modelo).trim(), String(cor || '').trim(), ano ? parseInt(String(ano), 10) || null : null]
  );
  return r.rows[0].id;
}

/**
 * Cria reserva pelo site: cliente, veículo, agendamento.
 */
async function createReservaPublica({
  nome,
  telefone,
  email,
  veiculo,
  servico_id,
  horario_iso,
  consentimento_lgpd,
}) {
  if (!consentimento_lgpd) {
    const err = new Error('É necessário aceitar o uso dos dados conforme LGPD.');
    err.code = 'LGPD';
    throw err;
  }
  const tel = normalizeTelefone(telefone);
  if (tel.length < 10) throw new Error('Telefone inválido');

  const horario = new Date(horario_iso);
  if (Number.isNaN(horario.getTime())) throw new Error('Horário inválido');

  const servicoRow = await reposAgendamento.getServicoById(parseInt(String(servico_id), 10));
  if (!servicoRow) throw new Error('Serviço não encontrado');

  const cfg = await reposAgendamento.getConfig();
  if (!cfg) throw new Error('Configuração não disponível');
  const vagas = Math.max(1, parseInt(String(cfg.vagas_por_slot), 10) || 1);
  if (isDataBloqueada(horario, cfg.horarios_bloqueados)) throw new Error('Data não disponível');

  const disponiveis = concreteSlotsFromConfig(cfg.horarios_disponiveis, 14);
  const match = disponiveis.some(
    (s) => Math.abs(s.start.getTime() - horario.getTime()) < 60000
  );
  if (!match) throw new Error('Horário não está entre as opções disponíveis');

  const ocupacao = await countOcupacaoHorario(horario);
  if (ocupacao >= vagas) throw new Error('Horário esgotado');

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ocupacao2 = await client.query(
      `SELECT COUNT(*)::int AS c FROM agendamentos
       WHERE status NOT IN ('cancelado', 'reagendado')
       AND date_trunc('minute', horario) = date_trunc('minute', $1::timestamptz)`,
      [horario]
    );
    if (ocupacao2.rows[0].c >= vagas) {
      throw new Error('Horário esgotado');
    }

    let cli = await client.query('SELECT * FROM clientes WHERE telefone = $1', [tel]);
    let clienteId;
    if (cli.rows[0]) {
      clienteId = cli.rows[0].id;
      await client.query(
        `UPDATE clientes SET nome = COALESCE($2, nome), email = COALESCE(NULLIF($3, ''), email),
         lgpd_consentimento_em = NOW(), updated_at = NOW() WHERE id = $1`,
        [clienteId, nome ? String(nome).trim() : null, email ? String(email).trim() : null]
      );
    } else {
      clienteId = uuidv4();
      await client.query(
        `INSERT INTO clientes (id, telefone, nome, email, primeiro_contato, status, ultima_interacao, total_mensagens, lgpd_consentimento_em)
         VALUES ($1, $2, $3, $4, NOW(), 'ativo', NOW(), 0, NOW())`,
        [clienteId, tel, nome ? String(nome).trim() : null, email ? String(email).trim() : null]
      );
    }

    const veiculoId = await upsertVeiculo(client, {
      cliente_id: clienteId,
      placa: veiculo.placa,
      modelo: veiculo.modelo,
      cor: veiculo.cor,
      ano: veiculo.ano,
    });

    const statusInicial = cfg.aprovacao_automatica ? 'confirmado' : 'pendente';
    const agId = uuidv4();
    await client.query(
      `INSERT INTO agendamentos (id, cliente_id, horario, servico, descricao, status,
        veiculo_id, servico_catalogo_id, origem, confirmado_em, confirmado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'web', $9, $10)`,
      [
        agId,
        clienteId,
        horario,
        servicoRow.nome,
        servicoRow.descricao || '',
        statusInicial,
        veiculoId,
        servicoRow.id,
        cfg.aprovacao_automatica ? new Date() : null,
        cfg.aprovacao_automatica ? 'sistema' : null,
      ]
    );

    await client.query('COMMIT');

    const ag = await repos.findAgendamentoById(agId);
    const clienteRow = await repos.findClienteById(clienteId);
    return { agendamento: ag, cliente: clienteRow, servico: servicoRow };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function findAgendamentoPublicoPorToken(token) {
  const r = await query(
    `SELECT a.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
            v.placa AS veiculo_placa, v.modelo AS veiculo_modelo, v.cor AS veiculo_cor
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     LEFT JOIN veiculos v ON v.id = a.veiculo_id
     WHERE a.token_acompanhamento = $1`,
    [token]
  );
  return r.rows[0] || null;
}

async function posicaoNaFila(agendamentoId) {
  const r = await query(
    `WITH ordered AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY entrada_fila_em ASC NULLS LAST, created_at ASC) AS pos
       FROM agendamentos
       WHERE status_fila = 'na_fila'
       AND horario::date = (SELECT horario::date FROM agendamentos WHERE id = $1::uuid)
     )
     SELECT COALESCE((SELECT pos FROM ordered WHERE id = $1::uuid), 1) AS pos`,
    [agendamentoId]
  );
  return r.rows[0].pos;
}

async function listFilaPorData(dataStr) {
  const r = await query(
    `SELECT a.id, a.horario, a.status, a.status_fila, a.entrada_fila_em,
            c.nome AS cliente_nome, c.telefone AS cliente_telefone,
            v.placa AS veiculo_placa, v.modelo AS veiculo_modelo,
            COALESCE(s.nome, a.servico) AS servico_nome
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     LEFT JOIN veiculos v ON v.id = a.veiculo_id
     LEFT JOIN agendamento_servicos s ON s.id = a.servico_catalogo_id
     WHERE a.horario::date = $1::date
     AND a.status IN ('pendente', 'confirmado', 'concluido')
     ORDER BY a.horario ASC, a.created_at ASC`,
    [dataStr]
  );
  return r.rows;
}

async function listCalendario(fromStr, toStr) {
  const r = await query(
    `SELECT a.id, a.horario, a.status, a.status_fila, c.nome AS cliente_nome,
            v.placa AS veiculo_placa, v.modelo AS veiculo_modelo
     FROM agendamentos a
     JOIN clientes c ON c.id = a.cliente_id
     LEFT JOIN veiculos v ON v.id = a.veiculo_id
     WHERE a.horario >= $1::timestamptz AND a.horario < $2::timestamptz
     AND a.status NOT IN ('cancelado', 'reagendado')
     ORDER BY a.horario`,
    [fromStr, toStr]
  );
  return r.rows;
}

async function updateStatusFila(agendamentoId, novoStatus) {
  const permitidos = new Set(['na_fila', 'lavando', 'finalizando', 'pronto', null, '']);
  const ns = novoStatus === '' || novoStatus == null ? null : String(novoStatus);
  if (ns && !permitidos.has(ns)) throw new Error('Status de fila inválido');

  const prev = await query(`SELECT * FROM agendamentos WHERE id = $1`, [agendamentoId]);
  const ag = prev.rows[0];
  if (!ag) throw new Error('Agendamento não encontrado');
  if (['cancelado', 'reagendado'].includes(ag.status)) throw new Error('Agendamento não está ativo');

  let entradaFila = ag.entrada_fila_em;
  if (ns === 'na_fila' && !entradaFila) entradaFila = new Date();

  await query(`UPDATE agendamentos SET status_fila = $2, entrada_fila_em = $3, updated_at = NOW() WHERE id = $1`, [
    agendamentoId,
    ns,
    entradaFila,
  ]);

  const updated = await query(`SELECT a.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
    v.placa AS veiculo_placa FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN veiculos v ON v.id = a.veiculo_id
    WHERE a.id = $1`, [agendamentoId]);
  return { anterior: ag.status_fila, row: updated.rows[0] };
}

async function insertPagamento({ agendamento_id, metodo, valor_centavos }) {
  const metodos = new Set(['dinheiro', 'pix', 'cartao']);
  if (!metodos.has(metodo)) throw new Error('Método inválido');
  const id = uuidv4();
  await query(
    `INSERT INTO pagamentos (id, agendamento_id, metodo, valor_centavos) VALUES ($1, $2, $3, $4)`,
    [id, agendamento_id, metodo, valor_centavos]
  );
  return id;
}

async function listPagamentosPorDia(dataStr) {
  const r = await query(
    `SELECT p.*, a.servico, c.nome AS cliente_nome
     FROM pagamentos p
     JOIN agendamentos a ON a.id = p.agendamento_id
     JOIN clientes c ON c.id = a.cliente_id
     WHERE p.created_at::date = $1::date
     ORDER BY p.created_at DESC`,
    [dataStr]
  );
  return r.rows;
}

async function sumPagamentosDia(dataStr) {
  const r = await query(
    `SELECT COALESCE(SUM(valor_centavos), 0)::bigint AS total FROM pagamentos WHERE created_at::date = $1::date`,
    [dataStr]
  );
  return Number(r.rows[0].total);
}

async function listClientesComVeiculos() {
  const r = await query(
    `SELECT c.id, c.nome, c.telefone, c.email, c.ultima_interacao, c.preferencias_notas,
            COALESCE((
              SELECT json_agg(json_build_object(
                'id', v.id, 'placa', v.placa, 'modelo', v.modelo, 'cor', v.cor, 'ano', v.ano
              ) ORDER BY v.created_at DESC)
              FROM veiculos v WHERE v.cliente_id = c.id
            ), '[]'::json) AS veiculos
     FROM clientes c
     ORDER BY c.ultima_interacao DESC NULLS LAST
     LIMIT 200`
  );
  return r.rows;
}

async function historicoCliente(clienteId) {
  const r = await query(
    `SELECT a.id, a.horario, a.status, a.servico, a.status_fila,
            (SELECT COALESCE(SUM(p.valor_centavos), 0) FROM pagamentos p WHERE p.agendamento_id = a.id) AS pago_centavos
     FROM agendamentos a
     WHERE a.cliente_id = $1
     ORDER BY a.horario DESC
     LIMIT 100`,
    [clienteId]
  );
  return r.rows;
}

async function updatePreferenciasCliente(clienteId, texto) {
  await query(`UPDATE clientes SET preferencias_notas = $2, updated_at = NOW() WHERE id = $1`, [
    clienteId,
    texto != null ? String(texto) : '',
  ]);
}

async function deleteClienteCascade(clienteId) {
  const r = await query(`DELETE FROM clientes WHERE id = $1 RETURNING id`, [clienteId]);
  return r.rowCount > 0;
}

/**
 * LGPD: cliente solicita exclusão com telefone + token de acompanhamento.
 */
async function excluirDadosClientePublico({ telefone, token }) {
  const row = await findAgendamentoPublicoPorToken(token);
  if (!row) throw new Error('Token inválido');
  const tel = normalizeTelefone(telefone);
  const rtel = normalizeTelefone(row.cliente_telefone);
  if (!tel || tel !== rtel) throw new Error('Telefone não confere com o cadastro desta reserva');
  await query(`DELETE FROM clientes WHERE id = $1`, [row.cliente_id]);
  return true;
}

module.exports = {
  normalizeTelefone,
  normalizePlaca,
  listPublicSlots,
  createReservaPublica,
  findAgendamentoPublicoPorToken,
  posicaoNaFila,
  listFilaPorData,
  listCalendario,
  updateStatusFila,
  insertPagamento,
  listPagamentosPorDia,
  sumPagamentosDia,
  listClientesComVeiculos,
  historicoCliente,
  updatePreferenciasCliente,
  countOcupacaoHorario,
  deleteClienteCascade,
  excluirDadosClientePublico,
};
