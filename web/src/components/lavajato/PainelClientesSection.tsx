'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { API_BASE, painelDelete, painelFetcher, painelPatchJson } from '@/lib/api';

type Veic = { id: string; placa: string; modelo: string; cor: string; ano: number | null };
type ClienteRow = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  preferencias_notas: string | null;
  veiculos: Veic[];
};

type HistRow = {
  id: string;
  horario: string;
  status: string;
  servico: string;
  pago_centavos: string | number;
};

export function PainelClientesSection() {
  const url = `${API_BASE}/agendamento/painel/clientes`;
  const { data: clientes, error, mutate } = useSWR<ClienteRow[]>(url, painelFetcher);

  const [aberto, setAberto] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  const histUrl = aberto ? `${API_BASE}/agendamento/painel/clientes/${aberto}/historico` : null;
  const { data: historico } = useSWR<HistRow[]>(histUrl, painelFetcher);

  async function salvarNotas(clienteId: string, fallback: string) {
    try {
      const texto = notas[clienteId] !== undefined ? notas[clienteId] : fallback;
      await painelPatchJson(`/agendamento/painel/clientes/${clienteId}/preferencias`, { texto });
      await mutate();
      alert('Anotações salvas.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    }
  }

  async function excluirCliente(id: string) {
    if (!confirm('Excluir permanentemente este cliente e histórico (LGPD)?')) return;
    try {
      await painelDelete(`/agendamento/painel/clientes/${id}/lgpd`);
      await mutate();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">Clientes e veículos</h2>
      <p className="mt-1 text-xs text-zinc-500">Últimos cadastros. Expanda para histórico e anotações.</p>
      {error ? (
        <p className="mt-2 text-sm text-red-400">{(error as Error).message}</p>
      ) : null}
      <ul className="mt-4 space-y-2">
        {(clientes || []).map((c) => (
          <li key={c.id} className="rounded-xl border border-white/5 bg-black/20 p-3">
            <button
              type="button"
              onClick={() => setAberto(aberto === c.id ? null : c.id)}
              className="flex w-full items-start justify-between text-left text-sm text-white"
            >
              <span>
                <strong>{c.nome || 'Sem nome'}</strong>
                <span className="block text-xs text-zinc-400">{c.telefone}</span>
              </span>
              <span className="text-zinc-500">{aberto === c.id ? '▲' : '▼'}</span>
            </button>
            <p className="mt-1 text-xs text-zinc-500">
              Veículos:{' '}
              {(c.veiculos || []).map((v) => `${v.placa} (${v.modelo})`).join(' · ') || 'nenhum'}
            </p>
            {aberto === c.id ? (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-xs uppercase text-zinc-500">Histórico recente</p>
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-400">
                  {(historico || []).map((h) => (
                    <li key={h.id}>
                      {new Date(h.horario).toLocaleString('pt-BR')} — {h.servico} — {h.status}
                      {Number(h.pago_centavos) > 0 ? ` — R$ ${(Number(h.pago_centavos) / 100).toFixed(2)}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs uppercase text-zinc-500">Anotações / preferências</p>
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-sm text-white"
                  defaultValue={c.preferencias_notas || ''}
                  onChange={(e) => setNotas((prev) => ({ ...prev, [c.id]: e.target.value }))}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => salvarNotas(c.id, c.preferencias_notas || '')}
                    className="rounded-lg bg-zinc-700 px-3 py-1 text-xs text-white hover:bg-zinc-600"
                  >
                    Salvar anotações
                  </button>
                  <button
                    type="button"
                    onClick={() => excluirCliente(c.id)}
                    className="rounded-lg border border-red-500/50 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    Excluir dados (LGPD)
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
