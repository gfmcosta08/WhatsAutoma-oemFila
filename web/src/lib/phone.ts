/** Dígitos nacionais (DDD+número) → JID WhatsApp */
export function digitsToJid(digits: string): string | null {
  const d = digits.replace(/\D/g, '');
  if (d.length < 10) return null;
  const full = d.startsWith('55') ? d : `55${d}`;
  return `${full}@s.whatsapp.net`;
}

export function formatPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

export function strip55ForDisplay(jidOrDigits: string): string {
  const d = jidOrDigits.replace(/\D/g, '').replace(/@.*/, '');
  if (d.length > 11 && d.startsWith('55')) return d.slice(2);
  return d;
}
