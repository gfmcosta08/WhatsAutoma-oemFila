'use client';

import { useCallback, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { API_BASE, fetcher } from '@/lib/api';
import type { AgendamentoServico } from '@/lib/types';

function formatBrl(centavos: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}

function maskBrlFromCentavos(centavos: number): string {
  if (!centavos) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(centavos / 100);
}

export function ServicosSection() {
  const { mutate } = useSWRConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useSWR<AgendamentoServico[]>(`${API_BASE}/agendamento/servicos`, fetcher);

  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('');
  const [precoStr, setPrecoStr] = useState('');
  const [descricao, setDescricao] = useState('');
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const showToast = useCallback((type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await fetch(`${API_BASE}/agendamento/servicos/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erros?.[0] || 'Erro');
      await mutate(`${API_BASE}/agendamento/servicos`);
      const extra = j.erros?.length ? ` — avisos: ${j.erros.join('; ')}` : '';
      showToast('ok', `Importados ${j.criados ?? 0} serviço(s).${extra}`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Erro no upload.');
    }
  }

  async function adicionar() {
    const digits = precoStr.replace(/\D/g, '');
    const preco = parseInt(digits, 10) || 0;
    if (!nome.trim() || !categoria.trim() || preco <= 0) {
      showToast('err', 'Preencha nome, categoria e preço maior que zero.');
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/agendamento/servicos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          categoria: categoria.trim(),
          preco,
          descricao: descricao.trim(),
        }),
        credentials: 'include',
      });
      if (!r.ok) throw new Error('save');
      setNome('');
      setCategoria('');
      setPrecoStr('');
      setDescricao('');
      await mutate(`${API_BASE}/agendamento/servicos`);
      showToast('ok', 'Serviço adicionado.');
    } catch {
      showToast('err', 'Erro ao adicionar.');
    }
  }

  async function remover(id: number) {
    if (!confirm('Remover este serviço?')) return;
    try {
      const r = await fetch(`${API_BASE}/agendamento/servicos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error('del');
      await mutate(`${API_BASE}/agendamento/servicos`);
    } catch {
      showToast('err', 'Erro ao remover.');
    }
  }

  function onPrecoChange(v: string) {
    const digits = v.replace(/\D/g, '');
    if (!digits) {
      setPrecoStr('');
      return;
    }
    const centavos = parseInt(digits, 10);
    setPrecoStr(maskBrlFromCentavos(centavos));
  }

  const list = data || [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Serviços</h2>
        <div>
          <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.ods,.tsv" className="hidden" onChange={onFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-white/10 bg-black/50 px-4 py-2 text-sm text-white hover:bg-white/10"
          >
            📎 Importar Tabela
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-xl px-4 py-2 text-sm ${
            toast.type === 'ok' ? 'bg-emerald-900/50 text-emerald-100' : 'bg-red-900/50 text-red-100'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase text-zinc-500">Nome do serviço</label>
          <input
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase text-zinc-500">Categoria</label>
          <input
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase text-zinc-500">Preço (BRL)</label>
          <input
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white"
            placeholder="R$ 80,00"
            value={precoStr}
            onChange={(e) => onPrecoChange(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase text-zinc-500">Descrição</label>
          <textarea
            rows={1}
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={adicionar}
        className="mb-8 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
      >
        + Adicionar Serviço
      </button>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white/10" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-4">Serviço</th>
                <th className="pb-2 pr-4">Categoria</th>
                <th className="pb-2 pr-4">Preço (BRL)</th>
                <th className="hidden pb-2 pr-4 md:table-cell">Descrição</th>
                <th className="pb-2">Remover</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-white">{s.nome}</td>
                  <td className="py-3 pr-4 text-zinc-300">{s.categoria}</td>
                  <td className="py-3 pr-4 text-zinc-300">{formatBrl(s.preco)}</td>
                  <td className="hidden py-3 pr-4 text-zinc-500 md:table-cell">{s.descricao || '—'}</td>
                  <td className="py-3">
                    <button type="button" onClick={() => remover(s.id)} className="text-red-400 hover:text-red-300">
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.length === 0 && !isLoading && (
        <p className="mt-4 text-sm text-zinc-500">
          Nenhum serviço. Colunas esperadas na planilha: <span className="font-mono text-zinc-400">nome</span>,{' '}
          <span className="font-mono text-zinc-400">categoria</span>, <span className="font-mono text-zinc-400">preco</span>,{' '}
          <span className="font-mono text-zinc-400">descricao</span>
        </p>
      )}
    </div>
  );
}
