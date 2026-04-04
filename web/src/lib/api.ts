/**
 * - `NEXT_PUBLIC_API_URL` explícito: usa esse host (dev local com API em outra porta).
 * - `NEXT_PUBLIC_SAME_ORIGIN_API=1` (build Replit unificado): base vazia → fetch relativo.
 * - Caso contrário: fallback `http://localhost:3000` para `next dev` sem .env.
 */
function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim().replace(/\/$/, '');
  }
  if (process.env.NEXT_PUBLIC_SAME_ORIGIN_API === '1') {
    return '';
  }
  return 'http://localhost:3000';
}

export const API_BASE = resolveApiBase();

const PAINEL_TOKEN_KEY = 'lavajato_painel_token';
const PAINEL_ROLE_KEY = 'lavajato_painel_role';

/** URL do painel Express `/admin` (mesma origem da API). */
export function getAdminPanelUrl(): string {
  if (!API_BASE) return '/admin/';
  try {
    return new URL(API_BASE).origin + '/admin/';
  } catch {
    return '/admin/';
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function getPainelToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PAINEL_TOKEN_KEY);
}

export function setPainelToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(PAINEL_TOKEN_KEY, token);
  else {
    localStorage.removeItem(PAINEL_TOKEN_KEY);
    localStorage.removeItem(PAINEL_ROLE_KEY);
  }
}

export function setPainelRole(role: string | null) {
  if (typeof window === 'undefined') return;
  if (role) localStorage.setItem(PAINEL_ROLE_KEY, role);
  else localStorage.removeItem(PAINEL_ROLE_KEY);
}

export function getPainelRole(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PAINEL_ROLE_KEY);
}

/** Fetch autenticado do painel operacional (fila, caixa, clientes). */
export async function painelFetcher<T>(url: string): Promise<T> {
  const token = getPainelToken();
  const r = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || String(r.status));
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function painelPatchJson<T>(path: string, body: unknown): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getPainelToken();
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || String(r.status));
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function painelPutJson<T>(path: string, body: unknown): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getPainelToken();
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || String(r.status));
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function painelPostJson<T>(path: string, body: unknown): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getPainelToken();
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || String(r.status));
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function painelDelete(path: string): Promise<void> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getPainelToken();
  const r = await fetch(url, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function painelDownloadBlob(path: string): Promise<Blob> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const token = getPainelToken();
  const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}
