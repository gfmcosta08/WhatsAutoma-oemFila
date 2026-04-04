'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { API_BASE, fetcher } from '@/lib/api';

type StatusResp = {
  id: string;
  horario: string;
  status: string;
  status_fila: string | null;
  servico: string;
  posicao_fila: number | null;
  saldo_pontos: number | null;
  veiculo: { placa: string; modelo: string; cor: string };
};

const FILA_LABEL: Record<string, string> = {
  na_fila: '🟡 Na fila',
  lavando: '🔵 Em lavagem',
  finalizando: '🟠 Finalizando',
  pronto: '🟢 Pronto para retirada',
};

export default function AcompanharPage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';
  const url = token ? `${API_BASE}/public/acompanhar/${encodeURIComponent(token)}` : null;
  const { data, error, isLoading } = useSWR<StatusResp>(url, fetcher, { refreshInterval: 6000 });

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link href="/reservar" className="text-sm text-emerald-400 hover:underline">
          ← Nova reserva
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-white">Acompanhar serviço</h1>
        <p className="mt-2 text-sm text-zinc-400">Atualização automática a cada poucos segundos.</p>

        {isLoading ? <p className="mt-8 text-zinc-400">Carregando…</p> : null}
        {error ? (
          <p className="mt-8 text-red-400">Não encontramos este link. Verifique o endereço.</p>
        ) : null}
        {data ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div>
              <p className="text-xs uppercase text-zinc-500">Serviço</p>
              <p className="text-lg text-white">{data.servico}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Horário agendado</p>
              <p className="text-zinc-200">{new Date(data.horario).toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Veículo</p>
              <p className="text-zinc-200">
                {[data.veiculo?.placa, data.veiculo?.modelo].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Reserva</p>
              <p className="capitalize text-zinc-200">{data.status}</p>
            </div>
            {data.saldo_pontos != null ? (
              <div>
                <p className="text-xs uppercase text-zinc-500">Pontos de fidelidade</p>
                <p className="text-lg text-amber-200">{data.saldo_pontos} pts</p>
              </div>
            ) : null}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs uppercase text-zinc-500">Fila / lavagem</p>
              {data.status_fila ? (
                <>
                  <p className="mt-1 text-xl text-white">{FILA_LABEL[data.status_fila] || data.status_fila}</p>
                  {data.status_fila === 'na_fila' && data.posicao_fila != null ? (
                    <p className="mt-2 text-sm text-amber-200">Posição na fila: {data.posicao_fila}</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-zinc-400">Aguardando chegada do veículo no lavajato.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
