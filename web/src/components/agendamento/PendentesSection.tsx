'use client';

import useSWR from 'swr';
import { API_BASE, fetcher } from '@/lib/api';
import type { Pendente } from '@/lib/types';

export function PendentesSection() {
  const { data, isLoading } = useSWR<Pendente[]>(`${API_BASE}/agendamento/pendentes`, fetcher);

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="h-6 w-2/3 rounded bg-white/10" />
      </div>
    );
  }

  const list = data || [];
  const n = list.length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="mb-4 text-lg font-semibold text-white">Solicitações Pendentes ({n})</h2>
      {n === 0 ? (
        <p className="text-zinc-400">Nenhuma solicitação aguardando confirmação.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((p) => (
            <li key={p.id} className="border-b border-white/5 pb-4 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-white">{p.cliente_nome}</p>
                  <p className="text-amber-300">Horário solicitado: {p.horario_escolhido}</p>
                  <p className="text-sm text-zinc-400">{p.descricao || '—'}</p>
                  <p className="mt-2 font-mono text-xs text-emerald-400/90">
                    confirmar {p.cliente_nome.split(/\s+/)[0]} {p.horario_escolhido} 1h
                  </p>
                </div>
                <time className="text-xs text-zinc-500" dateTime={p.data_criacao}>
                  {new Date(p.data_criacao).toLocaleString('pt-BR')}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
