'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_BASE } from '@/lib/api';

export default function PrivacidadePage() {
  const [telefone, setTelefone] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function excluir(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const r = await fetch(`${API_BASE}/public/lgpd/exclusao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: telefone.replace(/\D/g, ''),
          token_acompanhamento: token.trim(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Falha');
      setMsg(j.mensagem || 'Dados excluídos.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Link href="/reservar" className="text-sm text-emerald-400 hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-white">Privacidade e LGPD</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Você pode solicitar a exclusão dos seus dados pessoais. Para confirmar que a solicitação é sua, usamos o
          mesmo telefone cadastrado na reserva e o token do link de acompanhamento (última parte da URL após
          /acompanhar/).
        </p>
        <form onSubmit={excluir} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}
          <div>
            <label className="text-xs uppercase text-zinc-500">Telefone (WhatsApp)</label>
            <input
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-zinc-500">Token de acompanhamento (UUID)</label>
            <input
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-sm text-white"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <button type="submit" className="w-full rounded-xl bg-red-900/70 py-3 font-semibold text-white hover:bg-red-800">
            Excluir meus dados
          </button>
        </form>
      </div>
    </div>
  );
}
