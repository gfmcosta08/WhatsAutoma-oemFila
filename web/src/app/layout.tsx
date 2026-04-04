import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agendamento via WhatsApp',
  description: 'Configure o bot, gerencie serviços e acompanhe os agendamentos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
