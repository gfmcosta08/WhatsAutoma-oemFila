'use client';

import { useState } from 'react';
import { getPainelRole, painelPostJson } from '@/lib/api';
import { usePainelToken } from '@/lib/usePainelToken';

export function NovoUsuarioPainel() {
  const token = usePainelToken();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('funcionario');
  const [msg, setMsg] = useState('');

  if (!token || getPainelRole() !== 'gestor') return null;

  async function criar() {
    setMsg('');
    try {
      await painelPostJson('/agendamento/painel/usuarios', { email: email.trim(), password, role });
      setMsg('Usuário criado.');
      setEmail('');
      setPassword('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-base font-semibold text-white">Novo usuário do painel</h2>
      <p className="mt-1 text-xs text-zinc-500">Crie contas com e-mail para login (após bootstrap ou primeiro gestor).</p>
      <div className="mt-4 space-y-2">
        <input
          type="email"
          placeholder="E-mail"
          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Senha"
          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-white"
        >
          <option value="funcionario">Funcionário</option>
          <option value="gestor">Gestor</option>
        </select>
        <button type="button" onClick={() => criar()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">
          Criar
        </button>
        {msg ? <p className="text-sm text-zinc-400">{msg}</p> : null}
      </div>
    </div>
  );
}
