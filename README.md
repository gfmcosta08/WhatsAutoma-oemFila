# WhatsApp Bot — oficina (single-tenant)

Backend Node.js (Express) com PostgreSQL, Redis, webhook **UazAPI** (recomendado), lembretes por cron, fluxo do **gerente** no WhatsApp (1/2/3 em pendentes) e **painel superadmin** em `/admin`.

## Modelo de deploy (single-tenant)

Cada **deploy** deste repositório atende **um único cliente** (ex.: uma oficina). O módulo de agendamento usa `empresa_id = 1` fixo ([`src/database/reposAgendamento.js`](src/database/reposAgendamento.js)).

- Webhook **UazAPI** (por token na URL): `POST /webhook/entrada/:token` — URL completa no admin após `WEBHOOK_BASE_URL`
- Webhook **Meta** (legado): `GET/POST /webhook/whatsapp` — só se usar `WHATSAPP_PROVIDER=meta`
- App **usuário** (Next.js) em `web/` — `/agendamento` (horários, serviços, sem tokens de API)

## Integração UazAPI

- Credenciais: **Base URL** (`https://{subdomínio}.uazapi.com` em produção; homologação comum: `https://free.uazapi.dev`), **instance token** e opcional **admin token**. Documentação: [docs.uazapi.com](https://docs.uazapi.com).
- Envio: `POST {base}/send/text` com corpo `{ "number", "text" }`. Em `*.uazapi.dev` o modo padrão (`UAZAPI_AUTH_MODE=auto`) usa **headers** `token` e `admintoken` (uazapiGO v2); em `.uazapi.com` mantém **query** `?token=&admintoken=` (legado, alinhado ao n8n). Ajuste com `UAZAPI_AUTH_MODE=query` ou `header` se necessário.
- **Telefone da instância** (E.164, só dígitos): usado para reconhecer o **mesmo número do bot** ao usar atalhos 1/2/3 como gerente.
- **JID do gerente** em `agendamento_config`: número pessoal que também pode confirmar/cancelar/reagendar pendentes.

## Painel superadmin (`/admin`)

- **UazAPI:** base URL, tokens, telefone da instância.
- **Webhook:** copiar URL `.../webhook/entrada/{token}` para o painel UazAPI.
- **Meta:** seção colapsável (legado).
- **Atendimento:** boas-vindas e JID do gerente; **horários** editados no app `/agendamento`.
- **`ADMIN_PASSWORD`:** se definido, o painel exige login.

## Deploy no Render

Passo a passo: [`deploy.md`](deploy.md).

## Replit

- Arquivo [`.replit`](.replit): Run / Deploy com **`npm run start:replit`** (API + Next na **mesma `PORT`**).
- Build de deploy: **`npm run build:replit`** (migrações + `next build` com `NEXT_PUBLIC_SAME_ORIGIN_API=1`).
- Detalhes: [`replit.md`](replit.md). **Render / VPS** continuam com `npm start` (só API, sem Next embutido).

## Local

Copie `.env.example` para `.env`, suba PostgreSQL e Redis, depois:

```bash
npm install
npm run migrate
npm start
```

Testes (webhook UazAPI + envio Meta/UazAPI com `fetch` mockado, sem rede): `npm test`.

## Scripts

- `npm start` — servidor HTTP + crons (lembretes a cada minuto, retry a cada 5 minutos)
- `npm run migrate` — aplica todos os `.sql` em `src/database/migrations/` em ordem
