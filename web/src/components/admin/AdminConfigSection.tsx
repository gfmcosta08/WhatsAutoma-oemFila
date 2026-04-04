'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

type Empresa = {
  id: number;
  nome: string;
  email: string;
  cnpj: string;
  status: string;
  webhook_url: string;
};

type WhatsappSettings = {
  uazapi_base_url: string;
  uazapi_instance_token_set: boolean;
  uazapi_instance_token_masked: string;
  uazapi_admin_token_set: boolean;
  uazapi_admin_token_masked: string;
  uazapi_instance_phone: string;
  effective_provider: string;
};

type PublicUrls = {
  uazapi_webhook_url: string;
  webhook_base_configured: boolean;
};

const ADMIN_BASE = `${API_BASE}/admin/api`;

let cachedAdminPassword: string | null = null;

async function adminFetch(path: string, opts?: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (cachedAdminPassword) {
    headers['X-Admin-Password'] = cachedAdminPassword;
  }
  const r = await fetch(`${ADMIN_BASE}${path}`, {
    credentials: 'include',
    ...opts,
    headers: { ...headers, ...(opts?.headers as Record<string, string> || {}) },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${r.status}`), { status: r.status });
  }
  return r.json();
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(value);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      prompt('Copie:', value);
    }
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-emerald-300 outline-none"
        />
        <button
          type="button"
          onClick={copiar}
          className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
            copiado ? 'bg-emerald-800 text-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
      />
    </div>
  );
}

function AdminLoginGate({ children }: { children: React.ReactNode }) {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    fetch(`${ADMIN_BASE}/auth/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.auth_required || d.ok) {
          setAuthRequired(false);
        } else {
          setAuthRequired(true);
        }
      })
      .catch(() => setAuthRequired(false));
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLoginError('');
    try {
      const r = await fetch(`${ADMIN_BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Senha inválida');
      cachedAdminPassword = password;
      setAuthRequired(false);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLogging(false);
    }
  }

  if (authRequired === null) {
    return <div className="h-16 animate-pulse rounded-2xl bg-white/5" />;
  }

  if (authRequired) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="mb-1 text-base font-semibold text-white">Acesso protegido</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Digite a senha de administrador (<code className="text-zinc-300">ADMIN_PASSWORD</code>) para acessar as configurações.
        </p>
        <form onSubmit={login} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha de administrador"
            autoFocus
            className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={logging || !password}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {logging ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        {loginError && <p className="mt-2 text-sm text-red-400">{loginError}</p>}
      </div>
    );
  }

  return <>{children}</>;
}

function EmpresaSection({ onWebhookUrl }: { onWebhookUrl?: (url: string) => void }) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const lista = (await adminFetch('/empresa')) as Empresa[];
        if (lista.length > 0) {
          const e = lista[0];
          setEmpresa(e);
          setNome(e.nome);
          setEmail(e.email || '');
          setCnpj(e.cnpj || '');
          if (e.webhook_url) onWebhookUrl?.(e.webhook_url);
        }
      } catch {
        /* empresa ainda não cadastrada */
      } finally {
        setLoading(false);
      }
    })();
  }, [onWebhookUrl]);

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      if (empresa) {
        const updated = (await adminFetch(`/empresa/${empresa.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nome.trim(), email: email.trim() || null, cnpj: cnpj.replace(/\D/g, '') || null }),
        })) as Empresa;
        setEmpresa(updated);
        if (updated.webhook_url) onWebhookUrl?.(updated.webhook_url);
        setMsg('Salvo com sucesso.');
      } else {
        if (!nome.trim()) { setMsg('Nome obrigatório.'); setSaving(false); return; }
        const created = (await adminFetch('/empresa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nome.trim(), email: email.trim() || null, cnpj: cnpj.replace(/\D/g, '') || null }),
        })) as Empresa;
        setEmpresa(created);
        if (created.webhook_url) onWebhookUrl?.(created.webhook_url);
        setMsg('Empresa cadastrada.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-32 animate-pulse rounded-2xl bg-white/5" />;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="mb-4 text-base font-semibold text-white">Empresa</h2>
      <form onSubmit={salvar} className="space-y-3">
        <FieldRow label="Nome *" value={nome} onChange={setNome} placeholder="Ex: Lavajato do João" />
        <FieldRow label="E-mail" type="email" value={email} onChange={setEmail} placeholder="contato@empresa.com" />
        <FieldRow label="CNPJ" value={cnpj} onChange={setCnpj} placeholder="00.000.000/0001-00" />
        {msg && (
          <p className={`text-sm ${msg.startsWith('Erro') || msg.includes('obrig') ? 'text-red-400' : 'text-emerald-400'}`}>
            {msg}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : empresa ? 'Atualizar empresa' : 'Cadastrar empresa'}
        </button>
      </form>
    </div>
  );
}

function UazapiSection({ webhookUrl }: { webhookUrl: string }) {
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [urls, setUrls] = useState<PublicUrls | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [instanceToken, setInstanceToken] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, u] = await Promise.all([
          adminFetch('/whatsapp-settings') as Promise<WhatsappSettings>,
          adminFetch('/public-urls') as Promise<PublicUrls>,
        ]);
        setSettings(s as WhatsappSettings);
        setUrls(u as PublicUrls);
        setBaseUrl((s as WhatsappSettings).uazapi_base_url || '');
        setPhone((s as WhatsappSettings).uazapi_instance_phone || '');
      } catch {
        /* sem auth ou erro */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const displayWebhookUrl = urls?.uazapi_webhook_url || webhookUrl;

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setMsg('');
    const patch: Record<string, string | null> = {
      uazapi_base_url: baseUrl.trim() || null,
      uazapi_instance_phone: phone.replace(/\D/g, '') || null,
    };
    if (instanceToken) patch.uazapi_instance_token = instanceToken;
    if (adminToken) patch.uazapi_admin_token = adminToken;
    try {
      const updated = (await adminFetch('/whatsapp-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })) as WhatsappSettings;
      setSettings(updated);
      setInstanceToken('');
      setAdminToken('');
      setMsg('Salvo com sucesso.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-48 animate-pulse rounded-2xl bg-white/5" />;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
      <h2 className="mb-1 text-base font-semibold text-white">WhatsApp / UazAPI</h2>
      <p className="mb-4 text-xs text-zinc-500">
        Provedor efetivo: <span className="text-zinc-300">{settings?.effective_provider || '—'}</span>
      </p>

      {displayWebhookUrl && (
        <div className="mb-5 space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <CopyField label="URL do Webhook — registre no painel UazAPI" value={displayWebhookUrl} />
          {urls && !urls.webhook_base_configured && (
            <p className="text-xs text-amber-400">
              WEBHOOK_BASE_URL não configurada no Render — defina para gerar a URL correta.
            </p>
          )}
        </div>
      )}

      <form onSubmit={salvar} className="space-y-3">
        <FieldRow
          label="Base URL"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://free.uazapi.dev ou https://seudominio.uazapi.com"
        />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Instance Token
            {settings?.uazapi_instance_token_set && (
              <span className="ml-2 font-normal normal-case text-zinc-600">
                (salvo: {settings.uazapi_instance_token_masked})
              </span>
            )}
          </label>
          <input
            type="password"
            value={instanceToken}
            onChange={(e) => setInstanceToken(e.target.value)}
            placeholder={settings?.uazapi_instance_token_set ? 'Deixe vazio para manter o atual' : 'Token da instância'}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Admin Token (opcional)
            {settings?.uazapi_admin_token_set && (
              <span className="ml-2 font-normal normal-case text-zinc-600">
                (salvo: {settings.uazapi_admin_token_masked})
              </span>
            )}
          </label>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder={settings?.uazapi_admin_token_set ? 'Deixe vazio para manter o atual' : 'Token de admin (opcional)'}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <FieldRow
          label="Número da instância (só dígitos, ex: 5511999999999)"
          value={phone}
          onChange={setPhone}
          placeholder="5511999999999"
        />
        {msg && (
          <p className={`text-sm ${msg.startsWith('Erro') ? 'text-red-400' : 'text-emerald-400'}`}>{msg}</p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar configuração WhatsApp'}
        </button>
      </form>
    </div>
  );
}

export function AdminConfigSection() {
  const [webhookUrl, setWebhookUrl] = useState('');

  return (
    <AdminLoginGate>
      <div className="space-y-6">
        <EmpresaSection onWebhookUrl={setWebhookUrl} />
        <UazapiSection webhookUrl={webhookUrl} />
      </div>
    </AdminLoginGate>
  );
}
