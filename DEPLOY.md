# Deploy — WhatsAutoma-oemFila

Repositório oficial no GitHub: **[gfmcosta08/WhatsAutoma-oemFila](https://github.com/gfmcosta08/WhatsAutoma-oemFila)**

Registro atualizado em **2026-04-04**. Branch recomendada: **`main`**.

> Em sistemas de ficheiros **case-insensitive** (Windows), este ficheiro pode aparecer como `deploy.md`; no Git o nome canónico é **`DEPLOY.md`**.

---

## 1. Enviar o código para o GitHub

```bash
git remote add origin https://github.com/gfmcosta08/WhatsAutoma-oemFila.git
# ou: git remote set-url origin https://github.com/gfmcosta08/WhatsAutoma-oemFila.git
git branch -M main
git push -u origin main
```

- **HTTPS:** use um [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) com escopo **`repo`**. Ficheiros em `.github/workflows` exigem também **`workflow`** no token.
- **SSH:** `git@github.com:gfmcosta08/WhatsAutoma-oemFila.git`

---

## 2. Deploy no Render

1. [Render Dashboard](https://dashboard.render.com): **New** → **Blueprint** → **`gfmcosta08/WhatsAutoma-oemFila`** → [`render.yaml`](render.yaml).
2. **Environment:** `WEBHOOK_BASE_URL`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `INTERNAL_NOTIFY_SECRET` (mínimo).
3. **WhatsApp / UazAPI:** [`README.md`](README.md), [`.env.example`](.env.example), [docs.uazapi.com](https://docs.uazapi.com).
4. **Webhook UazAPI:** `https://<serviço>.onrender.com/webhook/entrada/<token>`.
5. **Admin:** `https://<serviço>.onrender.com/admin/`

Build executa `npm run migrate`. Ver [Port binding](https://render.com/docs/web-services#port-binding).

**Nota:** `npm start` no Render = **só API**. Front Next em `web/` → outro serviço ou **Replit** (`npm run start:replit`).

---

## 3. Replit

[`.replit`](.replit), [`replit.md`](replit.md). Run: `npm run start:replit`. Build: `npm run build:replit`.

---

## 4. Variáveis (checklist)

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Opcional |
| `WEBHOOK_BASE_URL` | URL pública |
| `CORS_ORIGIN` | Front em outro host |
| `PUBLIC_WEB_BASE_URL` | Links no WhatsApp |
| `ENABLE_AGENDAMENTO` | `true` |

---

## 5. Referências

- [README.md](README.md)
- Testes: `npm test`
