'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { API_BASE, painelFetcher, painelPostJson } from '@/lib/api';
import { usePainelToken } from '@/lib/usePainelToken';

type PagRow = {
  id: string;
  metodo: string;
  valor_centavos: number;
  created_at: string;
  servico: string;
  cliente_nome: string;
};

type CaixaResp = { data: string; total_centavos: number; pagamentos: PagRow[] };

export function PainelCaixaSection() {
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [data, setData] = useState(hoje);
  const token = usePainelToken();
  const url = `${API_BASE}/agendamento/painel/caixa/${encodeURIComponent(data)}`;
  const { data: caixa, error, mutate, isLoading } = useSWR<CaixaResp>(token ? url : null, painelFetcher);

  const [agId, setAgId] = useState('');
  const [metodo, setMetodo] = useState('pix');
  const [valor, setValor] = useState('');
  const [localErr, setLocalErr] = useState('');

  async function registrar() {
    setLocalErr('');
    const reais = parseFloat(valor.replace(',', '.'));
    if (!agId.trim() || Number.isNaN(reais) || reais <= 0) {
      setLocalErr('Informe UUID do agendamento e valor válido.');
      return;
    }
    const centavos = Math.round(reais * 100);
    try {
      await painelPostJson('/agendamento/painel/pagamentos', {
        agendamento_id: agId.trim(),
        metodo,
        valor_centavos: centavos,
      });
      setValor('');
      setAgId('');
      await mutate();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Erro');
    }
  }

  if (!token) return null;

  const forbidden =
    error &&
    (String((error as Error).message).includes('403') || String((error as Error).message).includes('Apenas gestor'));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white">Caixa (gestor)</h2>
      {forbidden ? (
        <p className="mt-2 text-sm text-zinc-400">
          Apenas gestor vê o caixa. Entre com{' '}
          <Link href="/painel/login" className="text-amber-300 underline">
            ADMIN_PASSWORD
          </Link>
          .
        </p>
      ) : null}
      {!forbidden ? (
        <>
          <label className="mt-4 block text-xs text-zinc-500">
            Dia{' '}
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="ml-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
            />
          </label>
          {isLoading ? <p className="mt-2 text-zinc-500">Carregando…</p> : null}
          {caixa ? (
            <p className="mt-4 text-lg text-emerald-400">
              Total do dia: R$ {(caixa.total_centavos / 100).toFixed(2)}
            </p>
          ) : null}
          <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
            <p className="text-sm font-medium text-zinc-300">Registrar pagamento</p>
            {localErr ? <p className="text-xs text-red-400">{localErr}</p> : null}
            <input
              placeholder="UUID do agendamento"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-white"
              value={agId}
              onChange={(e) => setAgId(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartão</option>
              </select>
              <input
                placeholder="Valor (ex: 80,00)"
                className="min-w-[120px] flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
              <button
                type="button"
                onClick={() => registrar()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Salvar
              </button>
            </div>
          </div>
          <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto text-xs text-zinc-400">
            {(caixa?.pagamentos || []).map((p) => (
              <li key={p.id}>
                {new Date(p.created_at).toLocaleTimeString('pt-BR')} — {p.cliente_nome} — {p.metodo} — R${' '}
                {(p.valor_centavos / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
