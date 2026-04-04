'use client';

import { useState } from 'react';
import { getPainelRole, painelPostJson } from '@/lib/api';
import { usePainelToken } from '@/lib/usePainelToken';

export function TotpPainelSection() {
  const token = usePainelToken();
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  if (!token || getPainelRole() !== 'gestor') return null;

  async function iniciar() {
    setMsg('');
    const j = await painelPostJson<{ secret: string; otpauth_url: string }>(
      '/agendamento/painel/conta/totp/iniciar',
      {}
    );
    setSecret(j.secret);
    setOtpauth(j.otpauth_url);
  }

  async function confirmar() {
    setMsg('');
    await painelPostJson('/agendamento/painel/conta/totp/confirmar', { code });
    setMsg('2FA ativado.');
    setSecret('');
    setOtpauth('');
    setCode('');
  }

  async function desativar() {
    if (!confirm('Desativar 2FA nesta conta?')) return;
    await painelPostJson('/agendamento/painel/conta/totp/desativar', {});
    setMsg('2FA desativado.');
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-base font-semibold text-white">Autenticação em duas etapas (gestor)</h2>
      <p className="mt-2 text-xs text-zinc-500">
        Exige login com e-mail. Escaneie o QR no Google Authenticator ou similar e confirme o código.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => iniciar()}
          className="rounded-lg bg-zinc-600 px-3 py-2 text-sm text-white"
        >
          Gerar segredo / QR
        </button>
        <button type="button" onClick={() => desativar()} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300">
          Desativar 2FA
        </button>
      </div>
      {secret ? (
        <div className="mt-4 space-y-2 rounded-lg bg-black/40 p-3 text-xs text-zinc-400">
          <p className="break-all font-mono text-amber-200/90">{secret}</p>
          <p className="break-all">{otpauth}</p>
          <div className="flex gap-2">
            <input
              placeholder="Código 6 dígitos"
              className="flex-1 rounded border border-white/10 bg-black/50 px-2 py-1 text-white"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="button" onClick={() => confirmar()} className="rounded bg-emerald-600 px-3 py-1 text-white">
              Confirmar
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-sm text-emerald-400">{msg}</p> : null}
    </div>
  );
}
