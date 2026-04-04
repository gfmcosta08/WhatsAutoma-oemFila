'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE, fetcher, setPainelRole, setPainelToken } from '@/lib/api';

type Status = { painel_auth_enabled: boolean; login_mode: string; usuarios_cadastrados?: number };

export default function PainelLoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetcher<Status>(`${API_BASE}/agendamento/painel/status`)
      .then(setStatus)
      .catch(() => setStatus({ painel_auth_enabled: true, login_mode: 'password' }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const body: Record<string, string> = { password };
      if (status?.login_mode === 'email') {
        body.email = email.trim().toLowerCase();
        if (needTotp || totp) body.totp = totp.replace(/\s/g, '');
      }
      const r = await fetch(`${API_BASE}/agendamento/painel/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (j.need_totp) {
        setNeedTotp(true);
        setLoading(false);
        return;
      }
      if (!r.ok) throw new Error(j.error || 'Falha no login');
      setPainelToken(j.token);
      setPainelRole(j.role || null);
      router.push('/agendamento');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }

  const modoEmail = status?.login_mode === 'email';

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-16">
      <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-xl font-bold text-white">Painel operacional</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {modoEmail
            ? 'Entre com o e-mail e a senha cadastrados para sua conta.'
            : 'Use ADMIN_PASSWORD (gestor) ou STAFF_PASSWORD (funcionário), se definidos no servidor.'}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          {modoEmail ? (
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="E-mail"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          ) : null}
          <input
            type="password"
            required
            autoComplete={modoEmail ? 'current-password' : 'current-password'}
            placeholder="Senha"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {needTotp ? (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Código 2FA (6 dígitos)"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
            />
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="mt-4 text-xs text-zinc-500">
          Primeiro acesso com e-mail? Rode no servidor:{' '}
          <code className="text-zinc-400">npm run bootstrap:painel</code> com PAINEL_BOOTSTRAP_EMAIL e
          PAINEL_BOOTSTRAP_PASSWORD.
        </p>
        <Link href="/agendamento" className="mt-6 block text-center text-sm text-zinc-400 hover:text-white">
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
