'use strict';

/**
 * Formato em agendamento_config.horarios_disponiveis (JSONB):
 * - Grade semanal (app Next): { "dia": "seg"|"ter"|...|"dom", "hora": "08:00" }
 * - Legado: { "label", "daysFromNow", "hour", "minute" }
 * - Ou array de strings (labels): usa progressão de dias igual ao padrão legado (7,8,9,10,11)
 * - Vazio / inválido: cai no padrão de 5 slots
 */
const DEFAULT_SLOTS = [
  { n: 1, label: 'Segunda 08:00', daysFromNow: 7, hour: 8, minute: 0 },
  { n: 2, label: 'Segunda 14:00', daysFromNow: 8, hour: 14, minute: 0 },
  { n: 3, label: 'Terça 09:00', daysFromNow: 9, hour: 9, minute: 0 },
  { n: 4, label: 'Quarta 10:00', daysFromNow: 10, hour: 10, minute: 0 },
  { n: 5, label: 'Quinta 11:00', daysFromNow: 11, hour: 11, minute: 0 },
];

const DIA_TO_DOW = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const DIA_LABEL = {
  dom: 'Dom',
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
};

// Aliases NLP por dia da semana (sem acentos, lowercase, ordenados do mais longo para o mais curto)
const NLP_DAY_ALIASES = {
  0: ['domingo', 'dom'],
  1: ['segunda feira', 'segunda-feira', 'segunda', 'seg'],
  2: ['terca feira', 'terca-feira', 'terca', 'ter'],
  3: ['quarta feira', 'quarta-feira', 'quarta', 'qua'],
  4: ['quinta feira', 'quinta-feira', 'quinta', 'qui'],
  5: ['sexta feira', 'sexta-feira', 'sexta', 'sex'],
  6: ['sabado', 'sab'],
};

/**
 * Normaliza string para comparação NLP: lowercase, sem acentos, hífens → espaço.
 */
function normalizeStrNlp(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();
}

/**
 * Retorna o dia da semana (0=dom…6=sab) do slot baseado em daysFromNow.
 */
function slotDow(s) {
  const dt = new Date();
  dt.setDate(dt.getDate() + (s.daysFromNow || 0));
  return dt.getDay();
}

function parseHoraStr(horaStr) {
  const m = String(horaStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Próxima ocorrência do weekday + hora; retorna dias a somar a partir de hoje (0 = hoje). */
function daysFromNowForWeekdayHour(targetDow, hour, minute) {
  const now = new Date();
  for (let d = 0; d < 28; d++) {
    const t = new Date(now);
    t.setDate(t.getDate() + d);
    t.setHours(hour, minute, 0, 0);
    if (t.getDay() !== targetDow) continue;
    if (t.getTime() > now.getTime()) return d;
  }
  return 7;
}

function isDiaHoraGrid(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.some((o) => o && typeof o === 'object' && o.dia != null && o.hora != null);
}

function slotsFromDiaHoraGrid(arr) {
  const items = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object' || o.dia == null || o.hora == null) continue;
    const diaKey = String(o.dia).toLowerCase().trim();
    const targetDow = DIA_TO_DOW[diaKey];
    if (targetDow === undefined) continue;
    const hm = parseHoraStr(o.hora);
    if (!hm) continue;
    const daysFromNow = daysFromNowForWeekdayHour(targetDow, hm.hour, hm.minute);
    const label = `${DIA_LABEL[diaKey] || diaKey} ${String(hm.hour).padStart(2, '0')}:${String(hm.minute).padStart(2, '0')}`;
    items.push({
      daysFromNow,
      hour: hm.hour,
      minute: hm.minute,
      label,
      _sort: daysFromNow * 1440 + hm.hour * 60 + hm.minute,
    });
  }
  items.sort((a, b) => a._sort - b._sort);
  return items.map((it, i) => ({
    n: i + 1,
    label: it.label,
    daysFromNow: it.daysFromNow,
    hour: it.hour,
    minute: it.minute,
  }));
}

function parseHorariosConfig(raw) {
  if (!raw) return DEFAULT_SLOTS;
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return DEFAULT_SLOTS;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_SLOTS;

  if (isDiaHoraGrid(arr)) {
    const grid = slotsFromDiaHoraGrid(arr);
    return grid.length ? grid : DEFAULT_SLOTS;
  }

  if (typeof arr[0] === 'string') {
    return arr.map((label, i) => ({
      n: i + 1,
      label: String(label),
      daysFromNow: 7 + i,
      hour: DEFAULT_SLOTS[i] ? DEFAULT_SLOTS[i].hour : 9,
      minute: DEFAULT_SLOTS[i] ? DEFAULT_SLOTS[i].minute : 0,
    }));
  }

  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o || typeof o !== 'object') continue;
    const label = o.label != null ? String(o.label) : `Opção ${i + 1}`;
    const daysFromNow = Number.isFinite(Number(o.daysFromNow)) ? Number(o.daysFromNow) : 7 + i;
    const hour = Number.isFinite(Number(o.hour)) ? Number(o.hour) : 9;
    const minute = Number.isFinite(Number(o.minute)) ? Number(o.minute) : 0;
    out.push({ n: i + 1, label, daysFromNow, hour, minute });
  }
  return out.length ? out : DEFAULT_SLOTS;
}

/**
 * Interpreta texto em linguagem natural e retorna o slot correspondente.
 * Entende: "segunda", "seg", "seg 8", "segunda-feira as 8", "ter 09:00", etc.
 * Retorna o slot ou null se não reconhecer.
 */
function slotFromNlp(texto, slots) {
  if (!texto || !slots || !slots.length) return null;
  const norm = normalizeStrNlp(texto);

  // 1. Encontrar dia da semana (testa aliases do maior para menor para evitar match parcial)
  let targetDow = null;
  outer: for (const [dowStr, aliases] of Object.entries(NLP_DAY_ALIASES)) {
    for (const alias of aliases) {
      // Precisa ser palavra inteira (início, fim ou cercada por espaços/as)
      const re = new RegExp('(?:^|\\s)' + alias.replace(/ /g, '\\s+') + '(?:\\s|$)');
      if (re.test(norm)) {
        targetDow = Number(dowStr);
        break outer;
      }
    }
  }
  if (targetDow === null) return null;

  // 2. Extrair hora (opcional) — aceita: "8", "8h", "8:00", "08:30", "14"
  const hourMatch = norm.match(/\b(\d{1,2})(?::(\d{2}))?\s*h?\b/);
  const targetHour = hourMatch ? parseInt(hourMatch[1], 10) : null;
  const targetMinute = hourMatch && hourMatch[2] ? parseInt(hourMatch[2], 10) : 0;

  // 3. Filtrar slots pelo dia da semana
  const daySlots = slots.filter(s => slotDow(s) === targetDow);
  if (!daySlots.length) return null;

  if (targetHour !== null) {
    // Tenta match exato hora + minuto
    const exact = daySlots.find(s => s.hour === targetHour && (s.minute || 0) === targetMinute);
    if (exact) return exact;
    // Tenta match só pela hora
    const hourOnly = daySlots.find(s => s.hour === targetHour);
    if (hourOnly) return hourOnly;
  }

  // Sem hora especificada: retorna primeiro slot do dia
  return daySlots[0];
}

/**
 * Retorna os slots de um dia específico para desambiguação NLP.
 * Só é chamada quando o usuário digitou apenas o nome do dia (sem hora).
 * Retorna { dow, dayStr, dateStr, daySlots } ou null.
 */
function getDaySlotsForNlp(texto, slots) {
  if (!texto || !slots || !slots.length) return null;
  const norm = normalizeStrNlp(texto);
  // Se contém dígito, provavelmente tem hora — deixa slotFromNlp tratar
  if (/\d/.test(norm)) return null;

  let targetDow = null;
  outer: for (const [dowStr, aliases] of Object.entries(NLP_DAY_ALIASES)) {
    for (const alias of aliases) {
      const re = new RegExp('(?:^|\\s)' + alias.replace(/ /g, '\\s+') + '(?:\\s|$)');
      if (re.test(norm)) {
        targetDow = Number(dowStr);
        break outer;
      }
    }
  }
  if (targetDow === null) return null;

  const daySlots = slots.filter(s => slotDow(s) === targetDow);
  if (!daySlots.length) return null;

  const dt = new Date();
  dt.setDate(dt.getDate() + daySlots[0].daysFromNow);
  const weekday = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dayStr = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return { dow: targetDow, dayStr, dateStr, daySlots };
}

/**
 * Exibe horários agrupados por dia com data e numeração.
 * Exemplo:
 *   *Horários disponíveis:*
 *
 *   *Segunda-feira, 07/04*
 *   1) 08:00
 *   2) 14:00
 *
 *   *Terça-feira, 08/04*
 *   3) 09:00
 *
 *   _Digite o número ou o horário (ex: seg 08:00)_
 */
function slotsHorarioText(slots) {
  const list = slots && slots.length ? slots : DEFAULT_SLOTS;
  const now = new Date();

  // Agrupar por dia calendário preservando a ordem
  const byDay = new Map(); // key → { dayStr, dateStr, slots[] }
  for (const s of list) {
    const dt = new Date(now);
    dt.setDate(now.getDate() + (s.daysFromNow || 0));
    const weekday = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dayStr = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const key = `${dayStr}|${dateStr}`;
    if (!byDay.has(key)) byDay.set(key, { dayStr, dateStr, slots: [] });
    byDay.get(key).slots.push(s);
  }

  const lines = ['*Horários disponíveis:*', ''];
  for (const { dayStr, dateStr, slots: daySlots } of byDay.values()) {
    lines.push(`*${dayStr}, ${dateStr}*`);
    for (const s of daySlots) {
      const hh = String(s.hour).padStart(2, '0');
      const mm = String(s.minute || 0).padStart(2, '0');
      lines.push(`${s.n}) ${hh}:${mm}`);
    }
    lines.push('');
  }
  lines.push('_Digite o número ou o horário (ex: seg 08:00)_');

  return lines.join('\n');
}

/**
 * Converte a escolha do usuário (número ou texto NLP) em { horario: Date, label: string }.
 * Retorna null se não reconhecer a entrada.
 */
function slotFromChoice(opcao, slots) {
  const list = slots && slots.length ? slots : DEFAULT_SLOTS;
  const str = String(opcao || '').trim();

  // 1. Seleção por número
  const n = parseInt(str, 10);
  if (Number.isFinite(n) && n > 0 && String(n) === str) {
    const byNum = list.find(x => x.n === n);
    if (byNum) {
      const dt = new Date();
      dt.setDate(dt.getDate() + byNum.daysFromNow);
      dt.setHours(byNum.hour, byNum.minute || 0, 0, 0);
      return { horario: dt, label: byNum.label };
    }
  }

  // 2. NLP: texto livre ("segunda 8", "ter 09:00", etc.)
  const nlp = slotFromNlp(str, list);
  if (nlp) {
    const dt = new Date();
    dt.setDate(dt.getDate() + nlp.daysFromNow);
    dt.setHours(nlp.hour, nlp.minute || 0, 0, 0);
    const hh = String(nlp.hour).padStart(2, '0');
    const mm = String(nlp.minute || 0).padStart(2, '0');
    const weekday = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dayStr = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const label = nlp.label || `${dayStr} ${hh}:${mm}`;
    return { horario: dt, label };
  }

  // Sem match
  return null;
}

const DOW_TO_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function toYMDLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * horarios_bloqueados: array de strings "YYYY-MM-DD" ou objetos { tipo: "dia", data: "YYYY-MM-DD" }
 */
function isDataBloqueada(date, bloqueados) {
  if (!bloqueados) return false;
  let arr = bloqueados;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const ymd = toYMDLocal(date);
  for (const item of arr) {
    if (typeof item === 'string' && item.trim() === ymd) return true;
    if (item && typeof item === 'object' && item.data && String(item.data).slice(0, 10) === ymd) return true;
  }
  return false;
}

/**
 * Gera horários concretos (Date) nos próximos numDays dias para grade semanal ou formato legado.
 */
function concreteSlotsFromConfig(rawHorarios, numDays = 14) {
  const now = new Date();
  const slots = [];
  let arr = rawHorarios;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    const parsed = parseHorariosConfig(null);
    for (const s of parsed) {
      const dt = new Date();
      dt.setDate(dt.getDate() + s.daysFromNow);
      dt.setHours(s.hour, s.minute || 0, 0, 0);
      if (dt.getTime() > now.getTime()) {
        slots.push({ start: dt, label: s.label });
      }
    }
    slots.sort((a, b) => a.start - b.start);
    return slots;
  }

  if (isDiaHoraGrid(arr)) {
    for (let d = 0; d < numDays; d++) {
      const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      const diaKey = DOW_TO_DIA[cur.getDay()];
      for (const o of arr) {
        if (!o || typeof o !== 'object' || o.dia == null || o.hora == null) continue;
        const dk = String(o.dia).toLowerCase().trim();
        if (dk !== diaKey) continue;
        const hm = parseHoraStr(o.hora);
        if (!hm) continue;
        const slot = new Date(cur);
        slot.setHours(hm.hour, hm.minute, 0, 0);
        if (slot.getTime() <= now.getTime()) continue;
        const label = `${DIA_LABEL[diaKey] || dk} ${String(hm.hour).padStart(2, '0')}:${String(hm.minute).padStart(2, '0')} — ${cur.toLocaleDateString('pt-BR')}`;
        slots.push({ start: slot, label });
      }
    }
    slots.sort((a, b) => a.start - b.start);
    return slots;
  }

  const parsed = parseHorariosConfig(arr);
  for (const s of parsed) {
    const dt = new Date();
    dt.setDate(dt.getDate() + s.daysFromNow);
    dt.setHours(s.hour, s.minute || 0, 0, 0);
    if (dt.getTime() > now.getTime()) {
      slots.push({ start: dt, label: s.label });
    }
  }
  slots.sort((a, b) => a.start - b.start);
  return slots;
}

module.exports = {
  parseHorariosConfig,
  slotFromChoice,
  slotFromNlp,
  slotsHorarioText,
  getDaySlotsForNlp,
  DEFAULT_SLOTS,
  concreteSlotsFromConfig,
  isDataBloqueada,
  toYMDLocal,
};
