'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BASE, fetcher } from '@/lib/api';
import type { AgendamentoServico } from '@/lib/types';

type Slot = { horario_iso: string; label: string };

export default function ReservarPage() {
  const [servicos, setServicos] = useState<AgendamentoServico[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [cor, setCor] = useState('');
  const [ano, setAno] = useState('');
  const [servicoId, setServicoId] = useState<number | ''>('');
  const [horarioIso, setHorarioIso] = useState('');
  const [lgpd, setLgpd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, sl] = await Promise.all([
          fetcher<AgendamentoServico[]>(`${API_BASE}/public/servicos`),
          fetcher<Slot[]>(`${API_BASE}/public/slots?days=14`),
        ]);
        if (!alive) return;
        setServicos(s);
        setSlots(sl);
        if (s.length) setServicoId((prev) => (prev === '' ? s[0].id : prev));
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Não foi possível carregar dados.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setOkMsg('');
    if (!lgpd) {
      setErr('Aceite o tratamento dos dados (LGPD) para continuar.');
      return;
    }
    if (!servicoId || !horarioIso) {
      setErr('Selecione serviço e horário.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/public/reserva`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          telefone: telefone.replace(/\D/g, ''),
          email: email.trim() || undefined,
          veiculo: {
            placa,
            modelo: modelo.trim(),
            cor: cor.trim(),
            ano: ano ? parseInt(ano, 10) : undefined,
          },
          servico_id: servicoId,
          horario_iso: horarioIso,
          consentimento_lgpd: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Falha no envio');
      const token = j.token_acompanhamento as string;
      setOkMsg(
        `Pedido registrado! Acompanhe em /acompanhar/${token} — o link também foi enviado por WhatsApp quando possível.`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-12 text-center text-zinc-400">Carregando…</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex flex-wrap justify-between gap-4">
          <Link href="/agendamento" className="text-sm text-emerald-400 hover:underline">
            ← Painel interno
          </Link>
          <Link href="/privacidade" className="text-sm text-zinc-400 hover:underline">
            Privacidade / exclusão de dados
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white">Agendar lavagem</h1>
        <p className="mt-2 text-sm text-zinc-400">Preencha os dados do veículo e escolha o serviço.</p>

        <form onSubmit={enviar} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          {okMsg ? <p className="text-sm text-emerald-400">{okMsg}</p> : null}

          <div>
            <label className="block text-xs uppercase text-zinc-500">Nome</label>
            <input
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-zinc-500">WhatsApp / telefone</label>
            <input
              required
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-zinc-500">E-mail (opcional)</label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <p className="border-t border-white/10 pt-4 text-sm font-medium text-zinc-300">Veículo</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase text-zinc-500">Placa</label>
              <input
                required
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 uppercase text-white"
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-zinc-500">Cor</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase text-zinc-500">Modelo</label>
            <input
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-zinc-500">Ano (opcional)</label>
            <input
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-zinc-500">Serviço</label>
            <select
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={servicoId === '' ? '' : servicoId}
              onChange={(e) => setServicoId(parseInt(e.target.value, 10))}
            >
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} — R$ {(s.preco / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase text-zinc-500">Horário</label>
            <select
              required
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white"
              value={horarioIso}
              onChange={(e) => setHorarioIso(e.target.value)}
            >
              <option value="">Selecione…</option>
              {slots.map((s) => (
                <option key={s.horario_iso} value={s.horario_iso}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={lgpd} onChange={(e) => setLgpd(e.target.checked)} className="mt-1" />
            <span>
              Autorizo o uso dos meus dados para agendamento e contato por WhatsApp, conforme a LGPD. Sei que posso
              solicitar exclusão entrando em contato com o estabelecimento.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Confirmar pedido'}
          </button>
        </form>
      </div>
    </div>
  );
}
