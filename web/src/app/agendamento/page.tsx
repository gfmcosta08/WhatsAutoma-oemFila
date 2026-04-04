'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AgendamentosSection } from '@/components/agendamento/AgendamentosSection';
import { BotBanner } from '@/components/agendamento/BotBanner';
import { BotConfigForm } from '@/components/agendamento/BotConfigForm';
import { ComandosGuia } from '@/components/agendamento/ComandosGuia';
import { PendentesSection } from '@/components/agendamento/PendentesSection';
import { ServicosSection } from '@/components/agendamento/ServicosSection';
import { FeatureLocked } from '@/components/FeatureLocked';
import { PainelCalendarioSection } from '@/components/lavajato/PainelCalendarioSection';
import { PainelCaixaSection } from '@/components/lavajato/PainelCaixaSection';
import { PainelClientesSection } from '@/components/lavajato/PainelClientesSection';
import { PainelFilaSection } from '@/components/lavajato/PainelFilaSection';
import { PrdFidelidadeRelatorio } from '@/components/lavajato/PrdFidelidadeRelatorio';
import { AdminConfigSection } from '@/components/admin/AdminConfigSection';
import { API_BASE, fetcher } from '@/lib/api';
import type { AccessFlags, AgendamentoConfig } from '@/lib/types';

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || 'https://wa.me/5511999999999';

type View = 'principal' | 'configuracao';

export default function AgendamentoPage() {
  const [view, setView] = useState<View>('principal');

  const { data: access, isLoading: loadingAccess } = useSWR<AccessFlags>(
    `${API_BASE}/agendamento/access`,
    fetcher
  );
  const { data: config, isLoading: loadingConfig } = useSWR<AgendamentoConfig | null>(
    `${API_BASE}/agendamento/config`,
    fetcher
  );

  if (loadingAccess) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-10">
        <div className="mx-auto max-w-6xl animate-pulse space-y-6">
          <div className="h-10 w-1/2 rounded bg-white/10" />
          <div className="h-20 rounded-2xl bg-white/5" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-96 rounded-2xl bg-white/5" />
            <div className="h-64 rounded-2xl bg-white/5" />
          </div>
        </div>
      </div>
    );
  }

  if (access && !access.enable_agendamento && !access.is_superadmin) {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-10">
        <FeatureLocked supportUrl={SUPPORT_URL} />
      </div>
    );
  }

  if (view === 'configuracao') {
    return (
      <div className="min-h-screen bg-zinc-950 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setView('principal')}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
            >
              ← Voltar
            </button>
            <h1 className="text-xl font-bold text-white">Configurações</h1>
          </header>

          <BotConfigForm />

          <AdminConfigSection />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">Lavajato — Painel</h1>
            <p className="mt-2 text-zinc-400">WhatsApp, reserva web, fila e caixa.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link
                href="/reservar"
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-emerald-300 hover:bg-emerald-500/20"
              >
                Abrir página do cliente (reserva)
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setView('configuracao')}
            className="shrink-0 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 hover:bg-white/10"
          >
            ⚙ Configurações
          </button>
        </header>

        <BotBanner config={config} loading={loadingConfig} />

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <PainelFilaSection />
          <PainelCalendarioSection />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <PainelCaixaSection />
          <PainelClientesSection />
        </div>

        <div className="mt-6">
          <PrdFidelidadeRelatorio />
        </div>

        <PendentesSection />

        <div className="mt-6 space-y-6">
          <AgendamentosSection />
          <ServicosSection />
          <ComandosGuia />
        </div>
      </div>
    </div>
  );
}
