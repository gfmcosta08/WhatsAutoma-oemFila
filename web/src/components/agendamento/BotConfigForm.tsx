'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { API_BASE, fetcher } from '@/lib/api';
import { digitsToJid, formatPhoneMask } from '@/lib/phone';
import type { AgendamentoConfig } from '@/lib/types';
import { DIAS, DIA_LABEL, dayMapToList, defaultHorariosDisponiveis, listToDayMap } from './horarios';

export function BotConfigForm() {
  const { mutate } = useSWRConfig();
  const { data: config, isLoading } = useSWR<AgendamentoConfig | null>(
    `${API_BASE}/agendamento/config`,
    fetcher
  );

  const [phone, setPhone] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [aprovacaoAutomatica, setAprovacaoAutomatica] = useState(false);
  const [vagasPorSlot, setVagasPorSlot] = useState(1);
  const [datasBloqueadas, setDatasBloqueadas] = useState('');
  const [dayMap, setDayMap] = useState<Record<string, string[]>>(() =>
    listToDayMap(defaultHorariosDisponiveis())
  );
  const [timeInput, setTimeInput] = useState<Record<string, string>>({});

  useEffect(() => {
    if (config === undefined) return;
    if (config == null) {
      setPhone('');
      setMensagem('');
      setAprovacaoAutomatica(false);
      setVagasPorSlot(1);
      setDatasBloqueadas('');
      setDayMap(listToDayMap(defaultHorariosDisponiveis()));
      return;
    }
    const digits = config.jid_operador?.replace('@s.whatsapp.net', '').replace(/\D/g, '') || '';
    const national = digits.startsWith('55') ? digits.slice(2) : digits;
    setPhone(formatPhoneMask(national));
    setMensagem(config.mensagem_boas_vindas || '');
    if (config.horarios_disponiveis?.length) {
      setDayMap(listToDayMap(config.horarios_disponiveis));
    } else {
      setDayMap(listToDayMap(defaultHorariosDisponiveis()));
    }
    setAprovacaoAutomatica(!!config.aprovacao_automatica);
    setVagasPorSlot(config.vagas_por_slot != null ? Number(config.vagas_por_slot) : 1);
    const hb = config.horarios_bloqueados;
    if (Array.isArray(hb)) {
      setDatasBloqueadas(
        hb.map((x: string | { data?: string }) => (typeof x === 'string' ? x : x?.data || '')).filter(Boolean).join('\n')
      );
    } else setDatasBloqueadas('');
  }, [config]);

  function toggleDay(d: string) {
    setDayMap((prev) => {
      const cur = prev[d] || [];
      if (cur.length > 0) {
        return { ...prev, [d]: [] };
      }
      const hours: string[] = [];
      for (let h = 8; h <= 18; h++) hours.push(`${String(h).padStart(2, '0')}:00`);
      return { ...prev, [d]: [...hours] };
    });
  }

  function addHour(d: string) {
    const raw = (timeInput[d] || '08:00').trim();
    if (!/^\d{2}:\d{2}$/.test(raw)) return;
    setDayMap((prev) => {
      const arr = [...(prev[d] || [])];
      if (!arr.includes(raw)) arr.push(raw);
      arr.sort((a, b) => a.localeCompare(b));
      return { ...prev, [d]: arr };
    });
  }

  function removeHour(d: string, hora: string) {
    setDayMap((prev) => ({
      ...prev,
      [d]: (prev[d] || []).filter((h) => h !== hora),
    }));
  }

  async function salvar() {
    const digits = phone.replace(/\D/g, '');
    let jid_operador = '';
    if (digits.length > 0) {
      if (digits.length < 10) {
        alert('Telefone do responsável: mínimo 10 dígitos.');
        return;
      }
      const jid = digitsToJid(digits);
      if (!jid) {
        alert('Número inválido.');
        return;
      }
      jid_operador = jid;
    }
    const horarios_disponiveis = dayMapToList(dayMap);
    const linhasBloq = datasBloqueadas
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const horarios_bloqueados = linhasBloq.filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l));
    const payload = {
      jid_operador,
      horarios_disponiveis,
      mensagem_boas_vindas: mensagem.trim(),
      aprovacao_automatica: aprovacaoAutomatica,
      vagas_por_slot: Math.max(1, vagasPorSlot || 1),
      horarios_bloqueados,
    };
    try {
      const r = await fetch(`${API_BASE}/agendamento/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!r.ok) throw new Error('save');
      await mutate(`${API_BASE}/agendamento/config`);
      alert('Configuração salva!');
    } catch {
      alert('Erro ao salvar.');
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="h-8 w-1/2 rounded bg-white/10" />
        <div className="h-24 rounded bg-white/10" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="mb-4 text-lg font-semibold text-white">Configuração do Bot</h2>

      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Número do Responsável
      </label>
      <div className="mb-1 flex gap-2">
        <span className="flex shrink-0 items-center rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-zinc-300">
          🇧🇷 +55
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="(63) 99999-0000"
          className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
          value={phone}
          onChange={(e) => setPhone(formatPhoneMask(e.target.value))}
        />
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        WhatsApp do gerente: recebe aviso de pendente e pode responder <strong className="text-zinc-400">1</strong>{' '}
        confirmar, <strong className="text-zinc-400">2</strong> cancelar ou <strong className="text-zinc-400">3</strong>{' '}
        pedir reagendamento ao cliente. O telefone da instância do bot pode ser configurado no painel administrativo.
      </p>

      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Texto de apresentação
      </label>
      <textarea
        rows={3}
        placeholder="Ex: Bem-vindo ao nosso lavajato!"
        className="mb-1 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-zinc-600"
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
      />
      <p className="mb-4 text-xs text-zinc-500">
        Aparece antes do menu. Nome do cliente e lista de serviços são adicionados automaticamente. Deixar em
        branco = omite o texto.
      </p>

      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Reserva pelo site
      </label>
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={aprovacaoAutomatica}
          onChange={(e) => setAprovacaoAutomatica(e.target.checked)}
          className="rounded border-white/20 bg-black/50"
        />
        Aprovar agendamentos web automaticamente (sem pendência no WhatsApp)
      </label>
      <label className="mb-1 block text-xs text-zinc-500">Vagas por horário (mesmo slot)</label>
      <input
        type="number"
        min={1}
        max={50}
        className="mb-4 w-24 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
        value={vagasPorSlot}
        onChange={(e) => setVagasPorSlot(parseInt(e.target.value, 10) || 1)}
      />
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Datas bloqueadas (uma por linha, AAAA-MM-DD)
      </label>
      <textarea
        rows={3}
        placeholder={'2026-12-25\n2026-01-01'}
        className="mb-4 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-white placeholder:text-zinc-600"
        value={datasBloqueadas}
        onChange={(e) => setDatasBloqueadas(e.target.value)}
      />

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Dias e Horários Disponíveis
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {DIAS.map((d) => {
          const active = (dayMap[d] || []).length > 0;
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-primary text-white'
                  : 'border border-white/10 bg-transparent text-zinc-400 hover:bg-white/5'
              }`}
            >
              {DIA_LABEL[d]}
            </button>
          );
        })}
      </div>

      {DIAS.map((d) => {
        const active = (dayMap[d] || []).length > 0;
        if (!active) return null;
        return (
          <div key={d} className="mb-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="mb-2 text-sm font-medium text-zinc-300">{DIA_LABEL[d]}</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="time"
                className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
                value={timeInput[d] || '08:00'}
                onChange={(e) => setTimeInput((prev) => ({ ...prev, [d]: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => addHour(d)}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500"
              >
                + Adicionar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(dayMap[d] || []).map((hora) => (
                <span
                  key={hora}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-mono text-sm text-zinc-200"
                >
                  {hora}
                  <button
                    type="button"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => removeHour(d, hora)}
                    aria-label="Remover"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={salvar}
        className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 md:w-auto md:px-6"
      >
        Salvar Configuração
      </button>
    </div>
  );
}
