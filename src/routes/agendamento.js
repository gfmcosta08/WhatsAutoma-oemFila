'use strict';

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const repos = require('../database/reposAgendamento');
const reposLavajato = require('../database/reposLavajato');
const reposCore = require('../database/repos');
const reposFidelidade = require('../database/reposFidelidade');
const reposDespesas = require('../database/reposDespesas');
const reposRelatorio = require('../database/reposRelatorio');
const reposPainelUsuarios = require('../database/reposPainelUsuarios');
const { generateSecret, generateURI, verifySync } = require('otplib');
const {
  requirePainel,
  requireGestor,
  loginPainel,
  getPainelStatusPayload,
} = require('../middleware/painelAuth');
const { notificarMudancaFila } = require('../filaNotificacoes');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = express.Router();

function accessFlags() {
  const enable = String(process.env.ENABLE_AGENDAMENTO || 'true').toLowerCase() === 'true';
  const superadmin = String(process.env.SUPERADMIN || 'false').toLowerCase() === 'true';
  return { enable_agendamento: enable, is_superadmin: superadmin };
}

router.get('/access', (req, res) => {
  res.json(accessFlags());
});

router.get('/config', async (req, res) => {
  try {
    const row = await repos.getConfig();
    if (!row) return res.json(null);
    res.json({
      id: row.id,
      empresa_id: row.empresa_id,
      phone_number_id: row.phone_number_id,
      phone_number_numero: row.phone_number_numero,
      jid_operador: row.jid_operador,
      horarios_disponiveis: row.horarios_disponiveis || [],
      mensagem_boas_vindas: row.mensagem_boas_vindas || '',
      aprovacao_automatica: !!row.aprovacao_automatica,
      vagas_por_slot: row.vagas_por_slot != null ? row.vagas_por_slot : 1,
      horarios_bloqueados: row.horarios_bloqueados || [],
      ...(await getPainelStatusPayload()),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/config', async (req, res) => {
  try {
    const body = req.body || {};
    const existing = await repos.getConfig();
    const jid_operador =
      body.jid_operador !== undefined ? body.jid_operador : existing ? existing.jid_operador : null;
    const horarios_disponiveis = Array.isArray(body.horarios_disponiveis)
      ? body.horarios_disponiveis
      : existing && existing.horarios_disponiveis
        ? existing.horarios_disponiveis
        : [];
    const mensagem_boas_vindas =
      body.mensagem_boas_vindas !== undefined
        ? body.mensagem_boas_vindas || ''
        : existing
          ? existing.mensagem_boas_vindas || ''
          : '';
    let phone_number_id;
    if (body.phone_number_id !== undefined) {
      phone_number_id =
        body.phone_number_id === null || body.phone_number_id === ''
          ? null
          : String(body.phone_number_id).trim();
    } else {
      phone_number_id = existing ? existing.phone_number_id : null;
    }
    let phone_number_numero;
    if (body.phone_number_numero !== undefined) {
      phone_number_numero =
        body.phone_number_numero === null || body.phone_number_numero === ''
          ? null
          : String(body.phone_number_numero).trim() || null;
    } else {
      phone_number_numero = existing ? existing.phone_number_numero : null;
    }
    const aprovacao_automatica =
      body.aprovacao_automatica !== undefined ? !!body.aprovacao_automatica : existing ? !!existing.aprovacao_automatica : false;
    const vagas_por_slot =
      body.vagas_por_slot !== undefined
        ? Math.max(1, parseInt(String(body.vagas_por_slot), 10) || 1)
        : existing
          ? existing.vagas_por_slot || 1
          : 1;
    let horarios_bloqueados = existing ? existing.horarios_bloqueados : [];
    if (body.horarios_bloqueados !== undefined) horarios_bloqueados = body.horarios_bloqueados;

    const saved = await repos.upsertConfig({
      jid_operador,
      horarios_disponiveis,
      mensagem_boas_vindas,
      phone_number_id,
      phone_number_numero,
      aprovacao_automatica,
      vagas_por_slot,
      horarios_bloqueados,
    });
    res.json({
      id: saved.id,
      empresa_id: saved.empresa_id,
      jid_operador: saved.jid_operador,
      horarios_disponiveis: saved.horarios_disponiveis,
      mensagem_boas_vindas: saved.mensagem_boas_vindas,
      phone_number_id: saved.phone_number_id,
      phone_number_numero: saved.phone_number_numero,
      aprovacao_automatica: !!saved.aprovacao_automatica,
      vagas_por_slot: saved.vagas_por_slot,
      horarios_bloqueados: saved.horarios_bloqueados || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pendentes', async (req, res) => {
  try {
    const rows = await repos.listPendentes();
    res.json(
      rows.map((r) => ({
        id: r.id,
        cliente_nome: r.cliente_nome,
        cliente_jid: r.cliente_jid,
        horario_escolhido: r.horario_escolhido,
        descricao: r.descricao || '',
        data_criacao: r.data_criacao,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agendamentos', async (req, res) => {
  try {
    const status = (req.query.status || 'todos').toString().toLowerCase();
    const map = {
      todos: 'todos',
      pendentes: 'pendente',
      confirmados: 'confirmado',
      concluidos: 'concluido',
      cancelados: 'cancelado',
    };
    const filt = map[status] || 'todos';
    const rows = await repos.listAgendamentos(filt);
    res.json(
      rows.map((r) => ({
        id: r.id,
        cliente_nome: r.cliente_nome,
        data_hora: r.data_hora,
        duracao: r.duracao || '1h',
        status: r.status,
        descricao_problema: r.descricao_problema || '',
        status_fila: r.status_fila || null,
        origem: r.origem || 'whatsapp',
        veiculo_placa: r.veiculo_placa || null,
        veiculo_modelo: r.veiculo_modelo || null,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/agendamentos/:id', async (req, res) => {
  try {
    const ok = await repos.deleteAgendamento(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/servicos', async (req, res) => {
  try {
    const rows = await repos.listServicos();
    res.json(
      rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        categoria: r.categoria,
        preco: r.preco,
        descricao: r.descricao || '',
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/servicos', async (req, res) => {
  try {
    const { nome, categoria, preco, descricao } = req.body || {};
    const precoNum = typeof preco === 'number' ? preco : parseInt(String(preco), 10);
    if (!nome || !categoria || !precoNum || precoNum <= 0) {
      return res.status(400).json({ error: 'nome, categoria e preço (>0 centavos) obrigatórios' });
    }
    const row = await repos.insertServico({
      nome: String(nome).trim(),
      categoria: String(categoria).trim(),
      preco_centavos: precoNum,
      descricao: descricao ? String(descricao) : '',
    });
    res.json({
      id: row.id,
      nome: row.nome,
      categoria: row.categoria,
      preco: row.preco,
      descricao: row.descricao || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function sheetToRows(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const out = [];
  for (const raw of rows) {
    const keys = Object.keys(raw);
    const lower = {};
    for (const k of keys) {
      lower[String(k).toLowerCase().trim()] = raw[k];
    }
    const nome = lower.nome || lower.name || lower.servico;
    const categoria = lower.categoria || lower.category;
    let precoRaw = lower.preco || lower.price || lower.valor;
    let preco_centavos = 0;
    if (typeof precoRaw === 'number' && Number.isFinite(precoRaw)) {
      preco_centavos = precoRaw < 1000 ? Math.round(precoRaw * 100) : Math.round(precoRaw);
    } else {
      const s = String(precoRaw || '')
        .replace(/R\$\s*/gi, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
      const n = parseFloat(s);
      if (!Number.isNaN(n)) preco_centavos = Math.round(n * 100);
    }
    out.push({
      nome: nome ? String(nome).trim() : '',
      categoria: categoria ? String(categoria).trim() : '',
      preco_centavos,
      descricao: String(lower.descricao || lower.description || '').trim(),
    });
  }
  return out;
}

function parseDelimitedText(buf, sep) {
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const idx = (name) => {
    const aliases = {
      nome: ['nome', 'name', 'servico'],
      categoria: ['categoria', 'category'],
      preco: ['preco', 'price', 'valor'],
      descricao: ['descricao', 'description', 'desc'],
    };
    for (const a of aliases[name] || [name]) {
      const i = header.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iNome = idx('nome');
  const iCat = idx('categoria');
  const iPreco = idx('preco');
  const iDesc = idx('descricao');
  const out = [];
  for (let li = 1; li < lines.length; li++) {
    const parts = lines[li].split(sep);
    const row = {
      nome: iNome >= 0 ? String(parts[iNome] || '').trim() : '',
      categoria: iCat >= 0 ? String(parts[iCat] || '').trim() : '',
      preco_centavos: 0,
      descricao: iDesc >= 0 ? String(parts[iDesc] || '').trim() : '',
    };
    if (iPreco >= 0) {
      const s = String(parts[iPreco] || '')
        .replace(/R\$\s*/gi, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
      const n = parseFloat(s);
      if (!Number.isNaN(n)) row.preco_centavos = Math.round(n * 100);
    }
    out.push(row);
  }
  return out;
}

router.post('/servicos/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ criados: 0, erros: ['Arquivo ausente'] });
    }
    const name = (req.file.originalname || '').toLowerCase();
    let rows = [];
    if (name.endsWith('.csv')) {
      rows = parseDelimitedText(req.file.buffer, ',');
    } else if (name.endsWith('.tsv')) {
      rows = parseDelimitedText(req.file.buffer, '\t');
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = sheetToRows(sheet);
    } else if (name.endsWith('.ods')) {
      return res.status(400).json({ criados: 0, erros: ['Formato .ods: exporte para CSV ou XLSX e envie novamente.'] });
    } else {
      return res.status(400).json({ criados: 0, erros: ['Extensão não suportada'] });
    }
    const result = await repos.insertServicosBulk(rows);
    res.json(result);
  } catch (e) {
    res.status(500).json({ criados: 0, erros: [e.message] });
  }
});

router.delete('/servicos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
    const ok = await repos.deleteServico(id);
    if (!ok) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/painel/status', async (req, res) => {
  try {
    res.json(await getPainelStatusPayload());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/login', express.json(), async (req, res) => {
  try {
    const r = await loginPainel(req.body || {});
    if (r.need_totp) return res.status(200).json(r);
    if (r.error) return res.status(401).json({ error: r.error });
    res.json({ token: r.token, role: r.role, email: r.email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/painel/fila', requirePainel, async (req, res) => {
  try {
    const d = (req.query.data || '').toString().trim() || new Date().toISOString().slice(0, 10);
    const rows = await reposLavajato.listFilaPorData(d);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/painel/fila/:id', requirePainel, express.json(), async (req, res) => {
  try {
    const { status_fila } = req.body || {};
    const { anterior, row } = await reposLavajato.updateStatusFila(req.params.id, status_fila);
    if (row && status_fila && status_fila !== anterior) {
      await notificarMudancaFila(row, status_fila);
    }
    res.json({ ok: true, status_fila: row && row.status_fila, entrada_fila_em: row && row.entrada_fila_em });
  } catch (e) {
    const code = e.message && e.message.includes('não encontrado') ? 404 : 400;
    res.status(code).json({ error: e.message });
  }
});

router.get('/painel/calendario', requirePainel, async (req, res) => {
  try {
    const from = (req.query.from || '').toString() || new Date().toISOString().slice(0, 10);
    const to = (req.query.to || '').toString() || from;
    const fromTs = `${from}T00:00:00.000Z`;
    const toDate = new Date(to);
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    const toTs = toDate.toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const rows = await reposLavajato.listCalendario(fromTs, toTs);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/painel/clientes', requirePainel, async (req, res) => {
  try {
    const rows = await reposLavajato.listClientesComVeiculos();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/painel/clientes/:id/historico', requirePainel, async (req, res) => {
  try {
    const rows = await reposLavajato.historicoCliente(req.params.id);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/painel/clientes/:id/preferencias', requirePainel, express.json(), async (req, res) => {
  try {
    await reposLavajato.updatePreferenciasCliente(req.params.id, (req.body || {}).texto);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/pagamentos', requirePainel, requireGestor, express.json(), async (req, res) => {
  try {
    const { agendamento_id, metodo, valor_centavos } = req.body || {};
    const vc = typeof valor_centavos === 'number' ? valor_centavos : parseInt(String(valor_centavos), 10);
    if (!agendamento_id || !metodo || !vc || vc <= 0) {
      return res.status(400).json({ error: 'agendamento_id, metodo e valor_centavos obrigatórios' });
    }
    const id = await reposLavajato.insertPagamento({ agendamento_id, metodo, valor_centavos: vc });
    const ag = await reposCore.findAgendamentoById(agendamento_id);
    if (ag && ag.cliente_id) {
      await reposFidelidade.creditarPorPagamento({
        cliente_id: ag.cliente_id,
        valor_centavos: vc,
        pagamento_id: id,
        agendamento_id,
      });
    }
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/painel/caixa/:data', requirePainel, requireGestor, async (req, res) => {
  try {
    const data = req.params.data;
    const [lista, total] = await Promise.all([
      reposLavajato.listPagamentosPorDia(data),
      reposLavajato.sumPagamentosDia(data),
    ]);
    res.json({ data, total_centavos: total, pagamentos: lista });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/painel/fidelidade', requirePainel, requireGestor, async (req, res) => {
  try {
    const row = await reposFidelidade.getConfig();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/painel/fidelidade', requirePainel, requireGestor, express.json(), async (req, res) => {
  try {
    const saved = await reposFidelidade.upsertConfig(req.body || {});
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/fidelidade/resgatar', requirePainel, requireGestor, express.json(), async (req, res) => {
  try {
    const { cliente_id, pontos } = req.body || {};
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id obrigatório' });
    const out = await reposFidelidade.resgatarPontos({ cliente_id, pontos });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/painel/relatorio', requirePainel, requireGestor, async (req, res) => {
  try {
    const from = (req.query.from || '').toString() || new Date().toISOString().slice(0, 10);
    const to = (req.query.to || '').toString() || from;
    const [pagTotais, porMetodo, porDia, ranking, despesasTotal] = await Promise.all([
      reposRelatorio.sumPagamentosPeriodo(from, to),
      reposRelatorio.pagamentosPorMetodo(from, to),
      reposRelatorio.pagamentosPorDia(from, to),
      reposRelatorio.rankingServicos(from, to, 30),
      reposDespesas.sumDespesasPeriodo(from, to),
    ]);
    res.json({
      periodo: { from, to },
      pagamentos: pagTotais,
      por_metodo: porMetodo,
      por_dia: porDia,
      ranking_servicos: ranking,
      despesas_total_centavos: despesasTotal,
      liquido_centavos: pagTotais.total_centavos - despesasTotal,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/painel/relatorio.xlsx', requirePainel, requireGestor, async (req, res) => {
  try {
    const from = (req.query.from || '').toString() || new Date().toISOString().slice(0, 10);
    const to = (req.query.to || '').toString() || from;
    const [pagTotais, porMetodo, porDia, ranking, detalhe, despesas] = await Promise.all([
      reposRelatorio.sumPagamentosPeriodo(from, to),
      reposRelatorio.pagamentosPorMetodo(from, to),
      reposRelatorio.pagamentosPorDia(from, to),
      reposRelatorio.rankingServicos(from, to, 50),
      reposRelatorio.listPagamentosDetalhe(from, to),
      reposDespesas.listDespesasPeriodo(from, to),
    ]);
    const despesasTotal = await reposDespesas.sumDespesasPeriodo(from, to);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { metrica: 'Total recebido (centavos)', valor: pagTotais.total_centavos },
        { metrica: 'Qtd pagamentos', valor: pagTotais.quantidade },
        { metrica: 'Total despesas (centavos)', valor: despesasTotal },
        { metrica: 'Líquido (centavos)', valor: pagTotais.total_centavos - despesasTotal },
      ]),
      'Resumo'
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porMetodo), 'Por método');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porDia), 'Por dia');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ranking), 'Ranking serviços');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), 'Pagamentos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(despesas), 'Despesas');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio-lavajato-${from}_${to}.xlsx`);
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/despesas', requirePainel, requireGestor, express.json(), async (req, res) => {
  try {
    const { descricao, categoria, valor_centavos } = req.body || {};
    const id = await reposDespesas.insertDespesa({ descricao, categoria, valor_centavos });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/painel/despesas', requirePainel, requireGestor, async (req, res) => {
  try {
    const from = (req.query.from || '').toString() || new Date().toISOString().slice(0, 10);
    const to = (req.query.to || '').toString() || from;
    const rows = await reposDespesas.listDespesasPeriodo(from, to);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/painel/clientes/:id/lgpd', requirePainel, requireGestor, async (req, res) => {
  try {
    const ok = await reposLavajato.deleteClienteCascade(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/usuarios', requirePainel, requireGestor, express.json(), async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email e password obrigatórios' });
    const u = await reposPainelUsuarios.createUser({
      email,
      password,
      role: role === 'funcionario' ? 'funcionario' : 'gestor',
    });
    res.json({ id: u.id, email: u.email, role: u.role });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/painel/conta/totp/iniciar', requirePainel, async (req, res) => {
  try {
    if (!req.painelUserId) {
      return res.status(400).json({ error: 'Login com e-mail necessário para 2FA' });
    }
    const user = await reposPainelUsuarios.getAuthRowById(req.painelUserId);
    if (!user || user.role !== 'gestor') {
      return res.status(403).json({ error: 'Apenas gestor configura 2FA' });
    }
    const secret = generateSecret();
    await reposPainelUsuarios.setTotpSecret(user.id, secret);
    const otpauth_url = generateURI({ issuer: 'Lavajato', label: user.email, secret });
    res.json({ secret, otpauth_url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/conta/totp/confirmar', requirePainel, express.json(), async (req, res) => {
  try {
    if (!req.painelUserId) return res.status(400).json({ error: 'Sem usuário' });
    const user = await reposPainelUsuarios.getAuthRowById(req.painelUserId);
    const { code } = req.body || {};
    const tok = String(code || '').replace(/\s/g, '');
    const vr = user.totp_secret ? verifySync({ token: tok, secret: user.totp_secret }) : { valid: false };
    if (!vr.valid) {
      return res.status(400).json({ error: 'Código inválido' });
    }
    await reposPainelUsuarios.enableTotp(user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/painel/conta/totp/desativar', requirePainel, express.json(), async (req, res) => {
  try {
    if (!req.painelUserId) return res.status(400).json({ error: 'Sem usuário' });
    await reposPainelUsuarios.disableTotp(req.painelUserId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
