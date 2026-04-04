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

async function adminFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${ADMIN_BASE}${path}`, {
    credentials: 'include',
    ...opts,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
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

function EmpresaSection() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const lista: Empresa[] = await adminFetch('/empresa');
        if (lista.length > 0) {
          const e = lista[0];
          setEmpresa(e);
          setNome(e.nome);
          setEmail(e.email || '');
          setCnpj(e.cnpj || '');
          setWebhookUrl(e.webhook_url || '');
        }
      } catch {
        /* empresa ainda não cadastrada */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      if (empresa) {
        const updated: Empresa = await adminFetch(`/empresa/${empresa.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nome.trim(), email: email.trim() || null, cnpj: cnpj.replace(/\D/g, '') || null }),
        });
        setEmpresa(updated);
        setWebhookUrl(updated.webhook_url || '');
        setMsg('Salvo com sucesso.');
      } else {
        if (!nome.trim()) { setMsg('Nome obrigatório.'); return; }
        const created: Empresa = await adminFetch('/empresa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: nome.trim(), email: email.trim() || null, cnpj: cnpj.replace(/\D/g, '') || null }),
        });
        setEmpresa(created);
        setWebhookUrl(created.webhook_url || '');
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
      {webhookUrl && (
        <div className="mt-5 space-y-2">
          <CopyField label="URL do Webhook (UazAPI)" value={webhookUrl} />
          <p className="text-xs text-zinc-600">Registre essa URL nas configurações do seu servidor UazAPI.</p>
        </div>
      )}
    </div>
  );
}

function UazapiSection() {
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
        setSettings(s);
        setUrls(u);
        setBaseUrl(s.uazapi_base_url || '');
        setPhone(s.uazapi_instance_phone || '');
      } catch {
        /* sem auth ou erro */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      const updated: WhatsappSettings = await adminFetch('/whatsapp-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
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
            placeholder={settings?.uazapi_admin_token_set ? 'Deixe vazio para manter o atual' : 'Token de admin'}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <FieldRow
          label="Número da instância (E.164, só dígitos)"
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
      {urls?.uazapi_webhook_url && (
        <div className="mt-5 space-y-2">
          <CopyField label="URL do Webhook" value={urls.uazapi_webhook_url} />
          {!urls.webhook_base_configured && (
            <p className="text-xs text-amber-400">
              WEBHOOK_BASE_URL não configurada — defina no painel Render para gerar a URL correta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminConfigSection() {
  return (
    <div className="space-y-6">
      <EmpresaSection />
      <UazapiSection />
    </div>
  );
}
