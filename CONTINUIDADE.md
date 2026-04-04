# Continuidade do projeto (handoff)

Última atualização conceitual: **2026-04-02** — alinhar com o repositório local ao retomar o trabalho.

## Decisão de produto / arquitetura

- **Um deploy = um cliente** (oficina). Não há multi-tenant com várias empresas no mesmo banco em produção para este produto.
- **Imobiliária (ou outro vertical)** = **outro repositório ou fork** personalizado (processor, textos, telas, schema onde divergir).
- Não priorizar `empresa_id` em todo o fluxo só para multi-tenant no mesmo projeto; `reposAgendamento` usa **`EMPRESA_ID = 1`** com comentário explicando o modelo.

## O que já está no código

| Área | Situação |
|------|----------|
| README | Seção “Modelo de deploy (single-tenant)” + instruções Render |
| `src/database/reposAgendamento.js` | Comentário single-tenant + `EMPRESA_ID = 1` |
| `GET /empresa/status` | `{ has_empresa }` — público, sem listar dados sensíveis |
| Admin (`src/admin/public/index.html`) | Formulário de nova empresa em `#empresa-form-wrap` oculto quando já existe ≥1 empresa |
| Next `/cadastro` | SWR em `/empresa/status`: se já tem empresa, mensagem + link para `/admin`; senão formulário de “primeira empresa” |
| Next `/agendamento` | Sem link para cadastrar outra empresa; orienta admin para webhook oazap |
| `render.yaml` | Blueprint: Postgres, Redis, web Node; build `npm install && npm run migrate` |
| Plano “modelo um deploy” | To-dos opcionais (doc + UX) tratados como concluídos na sessão que implementou |

## Deploy (Render)

Repo: [gfmcosta08/automa-owhatsapp](https://github.com/gfmcosta08/automa-owhatsapp) — detalhes em [`deploy.md`](deploy.md).

1. Repo no GitHub → Render **New → Blueprint** → `render.yaml`.
2. Preencher manualmente: `WHATSAPP_*` (e `WHATSAPP_APP_SECRET` opcional).
3. Webhook Meta: `https://<serviço>.onrender.com/webhook/whatsapp`
4. Admin: `https://<serviço>.onrender.com/admin/`

**Local:** `env.example` → `.env` com `DATABASE_URL`, `REDIS_URL`, etc.; `npm install`, `npm run migrate`, `npm start`.

## Pendências / próximos passos sugeridos

- **Produção:** conferir se `WEBHOOK_BASE_URL` e, se a UI Next for outro host, `CORS_ORIGIN` estão definidos no Render (não estão todos no `render.yaml`; podem ser só no painel).
- **Segurança:** revisar `npm audit` (foi reportada 1 vulnerabilidade alta em dependência transitiva).
- **Web:** garantir `npm install` + `npm run build` em `web/` no ambiente de CI/prod se o front for deploy separado; neste blueprint o serviço principal é a API + admin estático.
- **Imobiliária:** novo projeto a partir deste template, não evolução multi-tenant aqui.

## Onde paramos na última rodada de “deploy / continuidade”

- Leitura de README + `render.yaml`.
- Execução local possível: **`npm install`** na raiz (ok). **`npm run migrate` / `npm run build`** exigem `DATABASE_URL` definido.
- MCP Render: exige workspace selecionado no Cursor para listar serviços/deploys.

---

*Atualize este arquivo ao fechar sprints ou antes de trocar de máquina/assistente.*
