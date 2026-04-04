# Lavajato — Replit

## Run (workspace)

- **Run** usa `npm run start:replit`: um processo na `PORT` do Replit com **API Express + Next.js** (`web/`).
- O build de deploy define `NEXT_PUBLIC_SAME_ORIGIN_API=1` (URLs relativas à API). Não defina `NEXT_PUBLIC_API_URL` nos Secrets a menos que a API esteja em outro domínio.

## Deploy (Replit Deployment)

- **Build:** `npm run build:replit` (instala raiz + `web/`, migra banco, `next build`).
- **Start:** `npm run start:replit` com `NODE_ENV=production`.

## Banco e segredos

1. Ative **PostgreSQL** no Replit e use a `DATABASE_URL` que o Replit fornece.
2. Em **Secrets**, configure no mínimo: `DATABASE_URL`, `SETTINGS_ENCRYPTION_KEY`, `WEBHOOK_BASE_URL` (URL pública do Repl), `ADMIN_PASSWORD` (opcional), credenciais UazAPI se usar WhatsApp.

## Outros

- Painel superadmin: `/admin/`
- Webhook UazAPI: `https://<seu-repl>/webhook/entrada/<token>` (token no admin).
- API só (Render etc.): continue com `npm start` → `src/index.js` (sem Next embutido).
