'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE, painelFetcher } from '@/lib/api';

type CalRow = {
  id: string;
  horario: string;
  status: string;
  status_fila: string | null;
  cliente_nome: string;
  veiculo_placa: string | null;
  veiculo_modelo: string | null;
};

export function PainelCalendarioSection() {
  const inicio = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(inicio);
  const [to, setTo] = useState(inicio);
  const url = `${API_BASE}/agendamento/painel/calendario?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const { data: rows, error, isLoading } = useSWR<CalRow[]>(url, painelFetcher);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">Calendário (lista)</h2>
      <p className="mt-1 text-xs text-zinc-500">Intervalo de datas para visão rápida dos agendamentos.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          De{' '}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Até{' '}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-red-400">{(error as Error).message}</p> : null}
      {isLoading ? <p className="mt-4 text-zinc-500">Carregando…</p> : null}
      <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm">
        {(rows || []).map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 py-2 text-zinc-300">
            <span className="text-white">{new Date(r.horario).toLocaleString('pt-BR')}</span>
            <span>{r.cliente_nome}</span>
            <span className="text-xs text-zinc-500">
              {[r.veiculo_placa, r.veiculo_modelo].filter(Boolean).join(' · ')} · {r.status}
              {r.status_fila ? ` · fila: ${r.status_fila}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {rows && rows.length === 0 && !isLoading ? (
        <p className="mt-4 text-sm text-zinc-500">Nenhum agendamento no período.</p>
      ) : null}
    </div>
  );
}
