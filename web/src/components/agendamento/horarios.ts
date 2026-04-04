export const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
export type Dia = (typeof DIAS)[number];

export const DIA_LABEL: Record<string, string> = {
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
  dom: 'Dom',
};

export function defaultHorariosDisponiveis(): { dia: string; hora: string }[] {
  const hours: string[] = [];
  for (let h = 8; h <= 18; h++) hours.push(`${String(h).padStart(2, '0')}:00`);
  const dias: Dia[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  return dias.flatMap((dia) => hours.map((hora) => ({ dia, hora })));
}

export function listToDayMap(list: { dia: string; hora: string }[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const d of DIAS) m[d] = [];
  for (const { dia, hora } of list) {
    if (!m[dia]) m[dia] = [];
    if (!m[dia].includes(hora)) m[dia].push(hora);
  }
  for (const d of DIAS) {
    m[d].sort((a, b) => a.localeCompare(b));
  }
  return m;
}

export function dayMapToList(m: Record<string, string[]>): { dia: string; hora: string }[] {
  const out: { dia: string; hora: string }[] = [];
  for (const d of DIAS) {
    for (const hora of m[d] || []) out.push({ dia: d, hora });
  }
  return out;
}
