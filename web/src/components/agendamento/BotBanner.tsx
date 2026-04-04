import type { AgendamentoConfig } from '@/lib/types';
import { formatPhoneMask, strip55ForDisplay } from '@/lib/phone';

type Props = {
  config: AgendamentoConfig | null | undefined;
  loading: boolean;
};

export function BotBanner({ config, loading }: Props) {
  if (loading) {
    return (
      <div className="mb-6 h-20 w-full animate-pulse rounded-2xl bg-white/5 ring-1 ring-white/10" />
    );
  }

  if (config) {
    const hasOp = Boolean(config.jid_operador && config.jid_operador.includes('@'));
    const num = hasOp ? formatPhoneMask(strip55ForDisplay(config.jid_operador)) : '';
    return (
      <div className="mb-6 w-full rounded-2xl border border-emerald-800/50 bg-emerald-950/80 px-4 py-3 text-emerald-100 backdrop-blur-sm">
        <p className="font-semibold">🟢 Bot ativo</p>
        <p className="mt-1 text-sm text-emerald-200/90">
          {hasOp
            ? `Respondendo clientes — operador: ${num}`
            : 'Respondendo clientes automaticamente — sem número de operador'}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 w-full rounded-2xl border border-amber-700/40 bg-amber-950/60 px-4 py-3 text-amber-100 backdrop-blur-sm">
      <p className="font-semibold">🟡 Bot não configurado</p>
      <p className="mt-1 text-sm text-amber-200/90">Acesse Configurações para ativar o bot</p>
    </div>
  );
}
