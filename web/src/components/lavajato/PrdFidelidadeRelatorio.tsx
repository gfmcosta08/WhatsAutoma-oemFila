'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  API_BASE,
  painelDownloadBlob,
  painelFetcher,
  painelPostJson,
  painelPutJson,
} from '@/lib/api';

type FidCfg = {
  ativo: boolean;
  centavos_por_ponto: number;
  pontos_resgate_minimo: number;
  desconto_resgate_centavos: number;
  notificar_marco_pontos: number;
};

type Rel = {
  periodo: { from: string; to: string };
  pagamentos: { total_centavos: number; quantidade: number };
  por_metodo: { metodo: string; total_centavos: number; quantidade: number }[];
  ranking_servicos: { servico: string; q: number }[];
  despesas_total_centavos: number;
  liquido_centavos: number;
};

export function PrdFidelidadeRelatorio() {
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(hoje);
  const [to, setTo] = useState(hoje);

  const { data: fid, mutate: mutFid } = useSWR<FidCfg>(
    `${API_BASE}/agendamento/painel/fidelidade`,
    painelFetcher
  );
  const { data: rel } = useSWR<Rel>(
    `${API_BASE}/agendamento/painel/relatorio?from=${from}&to=${to}`,
    painelFetcher
  );
  const { data: despesas, mutate: mutDesp } = useSWR<unknown[]>(
    `${API_BASE}/agendamento/painel/despesas?from=${from}&to=${to}`,
    painelFetcher
  );

  const [ativo, setAtivo] = useState(false);
  const [cpp, setCpp] = useState(100);
  const [prm, setPrm] = useState(100);
  const [drc, setDrc] = useState(1000);
  const [marco, setMarco] = useState(100);
  const [resCliente, setResCliente] = useState('');
  const [resPontos, setResPontos] = useState('');
  const [dDesc, setDDesc] = useState('');
  const [dCat, setDCat] = useState('');
  const [dVal, setDVal] = useState('');

  useEffect(() => {
    if (fid) {
      setAtivo(!!fid.ativo);
      setCpp(fid.centavos_por_ponto ?? 100);
      setPrm(fid.pontos_resgate_minimo ?? 100);
      setDrc(fid.desconto_resgate_centavos ?? 1000);
      setMarco(fid.notificar_marco_pontos ?? 100);
    }
  }, [fid]);

  async function salvarFid() {
    await painelPutJson('/agendamento/painel/fidelidade', {
      ativo,
      centavos_por_ponto: cpp,
      pontos_resgate_minimo: prm,
      desconto_resgate_centavos: drc,
      notificar_marco_pontos: marco,
    });
    await mutFid();
    alert('Fidelidade salva.');
  }

  async function resgatar() {
    await painelPostJson('/agendamento/painel/fidelidade/resgatar', {
      cliente_id: resCliente.trim(),
      pontos: parseInt(resPontos, 10),
    });
    setResCliente('');
    setResPontos('');
    alert('Resgate registrado (desconto conforme configuração).');
  }

  async function addDespesa() {
    const reais = parseFloat(dVal.replace(',', '.'));
    if (!dDesc.trim() || Number.isNaN(reais)) return;
    await painelPostJson('/agendamento/painel/despesas', {
      descricao: dDesc,
      categoria: dCat,
      valor_centavos: Math.round(reais * 100),
    });
    setDDesc('');
    setDVal('');
    await mutDesp();
  }

  async function baixarXlsx() {
    const blob = await painelDownloadBlob(
      `/agendamento/painel/relatorio.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${from}_${to}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Programa de fidelidade</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Pontos = valor pago ÷ centavos por ponto (ex.: 100 = R$1,00 = 1 ponto).
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Programa ativo
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-zinc-500">
              Centavos por 1 ponto
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
                value={cpp}
                onChange={(e) => setCpp(parseInt(e.target.value, 10) || 100)}
              />
            </label>
            <label className="text-zinc-500">
              Mín. pontos p/ resgate
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
                value={prm}
                onChange={(e) => setPrm(parseInt(e.target.value, 10) || 100)}
              />
            </label>
            <label className="text-zinc-500">
              Desconto resgate (centavos)
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
                value={drc}
                onChange={(e) => setDrc(parseInt(e.target.value, 10) || 1000)}
              />
            </label>
            <label className="text-zinc-500">
              Notificar a cada N pontos
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
                value={marco}
                onChange={(e) => setMarco(parseInt(e.target.value, 10) || 100)}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => salvarFid()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Salvar fidelidade
          </button>
        </div>
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="text-sm font-medium text-zinc-300">Resgate no balcão</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              placeholder="UUID cliente"
              className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1 font-mono text-xs text-white"
              value={resCliente}
              onChange={(e) => setResCliente(e.target.value)}
            />
            <input
              placeholder="Pontos"
              className="w-24 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
              value={resPontos}
              onChange={(e) => setResPontos(e.target.value)}
            />
            <button
              type="button"
              onClick={() => resgatar()}
              className="rounded-lg bg-amber-600 px-3 py-1 text-sm text-white"
            >
              Registrar resgate
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Relatório financeiro</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
          />
          <button
            type="button"
            onClick={() => baixarXlsx()}
            className="rounded-lg bg-zinc-600 px-3 py-1 text-sm text-white"
          >
            Exportar Excel
          </button>
        </div>
        {rel ? (
          <div className="mt-4 space-y-2 text-sm text-zinc-300">
            <p>
              Receitas: R$ {(rel.pagamentos.total_centavos / 100).toFixed(2)} ({rel.pagamentos.quantidade}{' '}
              pagamentos)
            </p>
            <p>Despesas no período: R$ {(rel.despesas_total_centavos / 100).toFixed(2)}</p>
            <p className="font-medium text-emerald-400">Líquido: R$ {(rel.liquido_centavos / 100).toFixed(2)}</p>
            <p className="text-xs text-zinc-500">Por método: {rel.por_metodo.map((m) => `${m.metodo}: R$ ${(m.total_centavos / 100).toFixed(2)}`).join(' · ')}</p>
          </div>
        ) : null}

        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="text-sm font-medium text-zinc-300">Despesa operacional</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              placeholder="Descrição"
              className="min-w-[140px] flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
              value={dDesc}
              onChange={(e) => setDDesc(e.target.value)}
            />
            <input
              placeholder="Categoria"
              className="w-28 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
              value={dCat}
              onChange={(e) => setDCat(e.target.value)}
            />
            <input
              placeholder="Valor R$"
              className="w-24 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-white"
              value={dVal}
              onChange={(e) => setDVal(e.target.value)}
            />
            <button type="button" onClick={() => addDespesa()} className="rounded-lg bg-red-900/60 px-3 py-1 text-sm text-white">
              Lançar despesa
            </button>
          </div>
          <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-zinc-500">
            {(despesas || []).map((d: { id: string; descricao: string; valor_centavos: number; created_at: string }) => (
              <li key={d.id}>
                {new Date(d.created_at).toLocaleDateString('pt-BR')} — {d.descricao} — R${' '}
                {(d.valor_centavos / 100).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
