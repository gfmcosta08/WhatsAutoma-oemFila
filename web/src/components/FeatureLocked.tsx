'use client';

type Props = {
  supportUrl: string;
};

export function FeatureLocked({ supportUrl }: Props) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 text-5xl" aria-hidden>
        🔒
      </div>
      <h1 className="mb-3 text-2xl font-bold text-white">Funcionalidade não disponível</h1>
      <p className="mb-8 max-w-md text-zinc-400">
        Esta funcionalidade não está incluída no seu plano atual. Entre em contato com o suporte para
        habilitar o Agendamento via WhatsApp.
      </p>
      <a
        href={supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500"
      >
        Falar com suporte
      </a>
    </div>
  );
}
