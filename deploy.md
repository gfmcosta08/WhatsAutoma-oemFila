# Deploy no Render

Repositório no GitHub: **[gfmcosta08/automa-owhatsapp](https://github.com/gfmcosta08/automa-owhatsapp)**

1. No [Render Dashboard](https://dashboard.render.com): **New** → **Blueprint** → conecte o repositório acima e aplique o [`render.yaml`](render.yaml).
2. No serviço web, em **Environment**, configure no mínimo:
   - `WEBHOOK_BASE_URL` — URL pública do serviço (ex.: `https://<seu-serviço>.onrender.com`) para o admin exibir os links de webhook.
   - `SETTINGS_ENCRYPTION_KEY` — 64 caracteres hex (32 bytes) ou base64 de 32 bytes, para cifrar token/app secret salvos pelo painel.
   - `ADMIN_PASSWORD` — senha do painel `/admin` (recomendado em produção).
   - `INTERNAL_NOTIFY_SECRET` — já gerado no blueprint; serve também como `ADMIN_SESSION_SECRET` se não definido.
3. **WhatsApp / UazAPI:** configure no painel `/admin` (recomendado) **ou** variáveis de ambiente:
   - `UAZAPI_BASE_URL` (ex.: `https://seu-subdominio.uazapi.com` ou `https://free.uazapi.dev` para testes), `UAZAPI_INSTANCE_TOKEN`, opcional `UAZAPI_ADMIN_TOKEN`, `UAZAPI_INSTANCE_PHONE` (mesmo número do bot para atalhos de gerente)
   - `UAZAPI_AUTH_MODE` = `auto` (padrão: header em `*.uazapi.dev`, query em `.uazapi.com`), `query` ou `header` — ver [docs.uazapi.com](https://docs.uazapi.com)
   - `WHATSAPP_PROVIDER` = `auto` (padrão), `uazapi` ou `meta`
   - Legado Meta: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
4. URL do webhook na UazAPI: `https://<seu-serviço>.onrender.com/webhook/entrada/<token>` (token exibido no admin). Meta (legado): `.../webhook/whatsapp`
5. Painel admin: `https://<seu-serviço>.onrender.com/admin/`

O serviço escuta em `0.0.0.0:$PORT` conforme [Port binding](https://render.com/docs/web-services#port-binding). Rode `npm run migrate` no build para aplicar migrações em `src/database/migrations/`.

Para modelo single-tenant e variáveis extras (`WEBHOOK_BASE_URL`, `CORS_ORIGIN`, etc.), veja o [README](README.md).
