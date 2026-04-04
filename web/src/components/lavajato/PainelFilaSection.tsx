'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { API_BASE, painelFetcher, painelPatchJson } from '@/lib/api';
import { usePainelToken } from '@/lib/usePainelToken';

type FilaRow = {
  id: string;
  horario: string;
  status: string;
  status_fila: string | null;
  cliente_nome: string;
  cliente_telefone: string;
  veiculo_placa: string | null;
  veiculo_modelo: string | null;
  servico_nome: string;
};

const OPCOES_FILA = [
  { value: '', label: '— Sem status na fila —' },
  { value: 'na_fila', label: 'Na fila' },
  { value: 'lavando', label: 'Lavando' },
  { value: 'finalizando', label: 'Finalizando' },
  { value: 'pronto', label: 'Pronto' },
];

export function PainelFilaSection() {
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [data, setData] = useState(hoje);
  const token = usePainelToken();
  const url = `${API_BASE}/agendamento/painel/fila?data=${encodeURIComponent(data)}`;
  const { data: rows, error, mutate, isLoading } = useSWR<FilaRow[]>(token ? url : null, painelFetcher, {
    refreshInterval: 8000,
  });

  async function mudarFila(id: string, status_fila: string) {
    try {
      await painelPatchJson(`/agendamento/painel/fila/${id}`, {
        status_fila: status_fila === '' || status_fila == null ? null : status_fila,
      });
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar fila');
    }
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
        <h2 className="text-lg font-semibold text-white">Fila do dia</h2>
        <p className="mt-2 text-sm text-zinc-300">
          <Link href="/painel/login" className="text-amber-300 underline">
            Faça login no painel operacional
          </Link>{' '}
          para atualizar status (funcionário ou gestor).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Fila do dia</h2>
        <label className="text-xs text-zinc-500">
          Data{' '}
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="ml-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-red-400">{(error as Error).message}</p> : null}
      {isLoading ? <p className="text-zinc-500">Carregando…</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-2">Horário</th>
              <th className="pb-2 pr-2">Cliente</th>
              <th className="pb-2 pr-2">Veículo</th>
              <th className="pb-2 pr-2">Serviço</th>
              <th className="pb-2">Status na fila</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.id} className="border-b border-white/5">
                <td className="py-2 pr-2 text-zinc-300">{new Date(r.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="py-2 pr-2 text-white">{r.cliente_nome || '—'}</td>
                <td className="py-2 pr-2 text-zinc-400">
                  {[r.veiculo_placa, r.veiculo_modelo].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="py-2 pr-2 text-zinc-400">{r.servico_nome}</td>
                <td className="py-2">
                  <select
                    value={r.status_fila || ''}
                    onChange={(e) => mudarFila(r.id, e.target.value)}
                    className="max-w-[160px] rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-xs text-white"
                  >
                    {OPCOES_FILA.map((o) => (
                      <option key={o.value || 'x'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Nenhum agendamento nesta data.</p> : null}
      </div>
    </div>
  );
}
