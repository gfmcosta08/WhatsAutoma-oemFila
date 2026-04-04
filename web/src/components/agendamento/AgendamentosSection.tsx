'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { API_BASE, fetcher } from '@/lib/api';
import type { Agendamento } from '@/lib/types';

const FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'confirmados', label: 'Confirmados' },
  { value: 'concluidos', label: 'Concluídos' },
  { value: 'cancelados', label: 'Cancelados' },
];

function statusClass(s: string) {
  const x = s.toLowerCase();
  if (x === 'confirmado') return 'text-emerald-400';
  if (x === 'pendente') return 'text-amber-400';
  if (x === 'cancelado') return 'text-red-400';
  if (x === 'concluido') return 'text-blue-400';
  return 'text-zinc-400';
}

export function AgendamentosSection() {
  const { mutate } = useSWRConfig();
  const [filtro, setFiltro] = useState('todos');
  const url = useMemo(
    () => `${API_BASE}/agendamento/agendamentos?status=${encodeURIComponent(filtro)}`,
    [filtro]
  );
  const { data, isLoading } = useSWR<Agendamento[]>(url, fetcher);

  async function remover(id: string) {
    if (!confirm('Remover este agendamento?')) return;
    try {
      const r = await fetch(`${API_BASE}/agendamento/agendamentos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error('delete');
      await mutate(url);
    } catch {
      alert('Erro ao remover.');
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="h-8 w-full rounded bg-white/10" />
      </div>
    );
  }

  const rows = data || [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Agendamentos</h2>
        <label className="text-xs uppercase text-zinc-500">
          <span className="mr-2">Filtrar</span>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-4">Cliente</th>
              <th className="pb-2 pr-4">Data/Hora</th>
              <th className="hidden pb-2 pr-4 lg:table-cell">Veículo</th>
              <th className="hidden pb-2 pr-4 md:table-cell">Duração</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Fila</th>
              <th className="pb-2">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-white/5">
                <td className="py-3 pr-4 font-medium text-white">{a.cliente_nome}</td>
                <td className="py-3 pr-4 text-zinc-300">
                  {new Date(a.data_hora).toLocaleString('pt-BR')}
                </td>
                <td className="hidden py-3 pr-4 text-zinc-400 lg:table-cell">
                  {a.veiculo_placa || a.veiculo_modelo
                    ? [a.veiculo_placa, a.veiculo_modelo].filter(Boolean).join(' · ')
                    : '—'}
                </td>
                <td className="hidden py-3 pr-4 text-zinc-400 md:table-cell">{a.duracao}</td>
                <td className={`py-3 pr-4 font-medium capitalize ${statusClass(a.status)}`}>
                  {a.status}
                  {a.origem === 'web' ? (
                    <span className="ml-1 text-[10px] font-normal text-zinc-500">web</span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-xs text-zinc-400">{a.status_fila || '—'}</td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => remover(a.id)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-4 text-zinc-500">Nenhum agendamento neste filtro.</p>}
    </div>
  );
}
