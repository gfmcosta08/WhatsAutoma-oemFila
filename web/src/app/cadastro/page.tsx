'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { API_BASE, fetcher, getAdminPanelUrl } from '@/lib/api';
import type { EmpresaCadastro } from '@/lib/types';

type EmpresaStatus = { has_empresa: boolean };

function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export default function CadastroPage() {
  const { mutate } = useSWRConfig();
  const { data: status, isLoading: loadingStatus } = useSWR<EmpresaStatus>(
    `${API_BASE}/empresa/status`,
    fetcher
  );

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [empresa, setEmpresa] = useState<EmpresaCadastro | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!nome.trim()) {
      setErro('O nome da empresa é obrigatório.');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/empresa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim() || null,
          cnpj: cnpj.replace(/\D/g, '') || null,
        }),
        credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao cadastrar.');
      setEmpresa(data as EmpresaCadastro);
      await mutate(`${API_BASE}/empresa/status`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setLoading(false);
    }
  }

  async function copiar() {
    if (!empresa) return;
    try {
      await navigator.clipboard.writeText(empresa.webhook_url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      prompt('Copie a URL do webhook:', empresa.webhook_url);
    }
  }

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-white/10" />
      </div>
    );
  }

  if (empresa) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12">
        <div className="w-full max-w-xl">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
            <h1 className="mb-2 text-2xl font-bold text-white">Instância registrada</h1>
            <p className="mb-6 text-zinc-400">
              <span className="font-semibold text-white">{empresa.nome}</span> — URL de webhook para o{' '}
              <strong className="text-emerald-400">UazAPI</strong>.
            </p>

            <div className="mb-6 rounded-xl border border-emerald-700/40 bg-emerald-950/50 p-4 text-left">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-400">URL do Webhook</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={empresa.webhook_url}
                  className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 font-mono text-sm text-emerald-300 outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={copiar}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    copiado ? 'bg-emerald-800 text-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {copiado ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-600">A URL é fixa neste deploy (single-tenant).</p>
          </div>
        </div>
      </div>
    );
  }

  if (status?.has_empresa) {
    const adminHref = getAdminPanelUrl();
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <h1 className="mb-3 text-2xl font-bold text-white">Esta instância já está configurada</h1>
          <p className="mb-4 text-zinc-400">
            Este projeto roda em modo <strong className="text-zinc-200">um deploy = um cliente</strong>. Não é necessário
            cadastrar outra empresa aqui. A URL do webhook (UazAPI) fica no painel admin da API.
          </p>
          <a
            href={adminHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
          >
            Abrir painel admin
          </a>
          <p className="mt-4 font-mono text-xs text-zinc-500">{adminHref}</p>
          <p className="mt-6 text-xs text-zinc-600">
            Outro negócio (ex.: imobiliária) = outro repositório ou deploy personalizado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Primeira empresa neste banco</h1>
          <p className="mt-2 text-zinc-400">
            Só use se ainda não existir nenhuma linha em <code className="text-zinc-500">empresas</code> (ex.: antes das
            migrações). Depois da migração padrão, use o <strong className="text-zinc-300">/admin</strong> para copiar o
            webhook.
          </p>
        </div>

        <form onSubmit={cadastrar} className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Nome da empresa <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Oficina do João"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">E-mail de contato</label>
            <input
              type="email"
              placeholder="contato@empresa.com"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              CNPJ <span className="text-zinc-600">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="00.000.000/0001-00"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
              value={cnpj}
              onChange={(e) => setCnpj(formatCnpj(e.target.value))}
              maxLength={18}
            />
          </div>

          {erro && (
            <div className="mb-4 rounded-xl border border-red-700/40 bg-red-950/50 px-4 py-2 text-sm text-red-300">{erro}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Cadastrando...
              </span>
            ) : (
              'Registrar e gerar webhook'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
