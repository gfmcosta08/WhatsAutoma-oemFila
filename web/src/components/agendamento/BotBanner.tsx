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
    const waOk = config.whatsapp_pode_enviar !== false;
    const hasOp = Boolean(config.jid_operador && config.jid_operador.includes('@'));
    const num = hasOp ? formatPhoneMask(strip55ForDisplay(config.jid_operador)) : '';
    if (!waOk) {
      return (
        <div className="mb-6 w-full rounded-2xl border border-orange-700/45 bg-orange-950/70 px-4 py-3 text-orange-100 backdrop-blur-sm">
          <p className="font-semibold">🟠 WhatsApp sem credenciais de envio</p>
          <p className="mt-1 text-sm text-orange-200/90">
            Em Configurações, informe o token da instância (UazAPI) ou token + ID do número (Meta), e o webhook na
            UazAPI.
          </p>
        </div>
      );
    }
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
      <p className="font-semibold">🟡 Agenda ainda não inicializada</p>
      <p className="mt-1 text-sm text-amber-200/90">
        Não foi possível carregar a configuração. Verifique o banco e as migrações, ou salve algo em Configurações.
      </p>
    </div>
  );
}
