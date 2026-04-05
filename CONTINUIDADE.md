# Continuidade do projeto (handoff)

Última atualização: **2026-04-04**.

---

## Infraestrutura

| Item | Valor |
|------|-------|
| Repositório | [gfmcosta08/WhatsAutoma-oemFila](https://github.com/gfmcosta08/WhatsAutoma-oemFila) |
| URL Render | `https://whatsautoma-oemfila.onrender.com` |
| UazAPI | `https://farollbr.uazapi.com` |
| Webhook URL | `https://whatsautoma-oemfila.onrender.com/webhook/entrada/a28c55ed3415125f47db62015a063ab480e856a2d1bb1487aea8a518b057064b` |
| Token webhook | `a28c55ed3415125f47db62015a063ab480e856a2d1bb1487aea8a518b057064b` |
| Instance token prefix | `9658d310-db20-4da7-9542-87b5b094ed90` |
| Bot phone | `556392495775` |
| Runtime | Node.js 25.9.0, Express + Next.js 14.2.35 |
| Banco | PostgreSQL (Render managed) |
| Cache | Redis (Render managed) |

### Endpoints principais
- `POST /webhook/entrada/:token` — webhook UazAPI (principal)
- `GET /health` — health check
- `GET/POST /webhook/whatsapp` — webhook Meta (legado)

---

## Estado Atual do Bot

### Fluxo implementado e funcionando

```
Cliente envia "oi"
  → bot envia mensagem_boas_vindas (configurável no painel)
  → estado: MENU_SEM_AGENDAMENTO

Cliente envia "1"
  → bot mostra lista de serviços cadastrados (do banco)
  → estado: SELECIONANDO_SERVICO

Cliente escolhe serviço por número
  → bot mostra horários disponíveis (formato: "Sexta, 06/04: 08:00, 09:00, 14:00")
  → estado: SELECIONANDO_HORARIO

Cliente escolhe horário (número, "sexta 08:00", "seg 8h", etc.)
  → se dia ambíguo (múltiplos horários): pede qual horário
  → se horário não disponível: avisa "⚠️ Horário não disponível"
  → confirma: "Serviço: X | Horário: Y — 1) Confirmar 2) Cancelar"
  → estado: CONFIRMANDO_AGENDAMENTO

Cliente confirma
  → agendamento salvo, lembrete criado, gerente notificado
  → estado: POS_ACAO → MENU_COM_AGENDAMENTO
```

### Funcionalidades do bot
- `oi`, `olá`, `bom dia`, `menu` → reinicia e mostra menu
- `cancelar`, `sair`, `parar`, `0` → cancela fluxo em andamento
- Inatividade > 5 min → sessão expira automaticamente
- NLP para horários: "segunda 8h", "ter 14:00", "sexta às 9", etc.
- Horários já agendados → não aparecem na lista
- Horários passados → não aparecem na lista
- `mensagem_boas_vindas` do banco usada diretamente como menu (sem texto hardcoded)

### Tabela de estados
| Estado | Significado |
|--------|-------------|
| `AGUARDANDO_NOME` | Primeiro contato — envia menu |
| `MENU_SEM_AGENDAMENTO` | Cliente sem agendamento ativo |
| `MENU_COM_AGENDAMENTO` | Cliente com agendamento ativo |
| `SELECIONANDO_SERVICO` | Escolhendo serviço da lista |
| `SELECIONANDO_HORARIO` | Escolhendo horário disponível |
| `CONFIRMANDO_AGENDAMENTO` | Confirmando serviço + horário |
| `REAGENDANDO_HORARIO` | Escolhendo novo horário |
| `REAGENDANDO_DESCRICAO` | Confirmando serviço do reagendamento |
| `CANCELANDO_MOTIVO` | Informando motivo do cancelamento |
| `POS_ACAO` | Pós-ação, redireciona para menu |
| `CONVERSA_ENCERRADA` | Conversa encerrada |

---

## Histórico de correções feitas

### Sessão 1 — Infraestrutura e webhook
- `fixBrazilianMobile()` — corrige números BR sem dígito 9
- `@lid` JID support — UazAPI pode enviar JIDs em formato @lid
- Timeout de 15s no fetch HTTP para UazAPI
- Proteção contra baseUrl malformado
- `UAZAPI_BASE_URL` fixado no render.yaml
- Suporte ao formato flat da UazAPI v2 (`message.sender_pn`, `message.text`)
- `UAZAPI_AUTH_MODE=header` e `WHATSAPP_DEFAULT_CC=55` adicionados nas env vars

### Sessão 2 — Fluxo do bot e textos dinâmicos
- `mensagem_boas_vindas` do banco usada como menu (sem "Olá" hardcoded)
- Fluxo de serviços: opção "1" mostra serviços cadastrados antes dos horários
- Estado `SELECIONANDO_SERVICO` adicionado
- Palavras de restart (`oi`, `menu`, etc.) reiniciam o fluxo de qualquer estado
- Palavras de cancel (`cancelar`, `sair`, `0`) cancelam fluxo em andamento
- Timeout de inatividade de 5 minutos

### Sessão 3 — Horários e NLP
- `slotsHorarioText()` reformatado: `*Sexta, 06/04:* 08:00, 09:00, 14:00`
- `getDaySlotsForNlp()` — desambiguação quando usuário digita só o dia
- `slotFromNlp()` corrigido: hora fora da faixa retorna `null` (não mais fallback silencioso)
- Mensagem `⚠️ Horário não disponível` quando cliente pede horário inexistente
- `computeAvailableSlots()` — filtra horários já agendados e passados em tempo real
- `listAgendamentosHorariosOcupados()` — query no banco para slots ocupados

---

## Melhorias necessárias (auditoria completa)

### 🔴 CRÍTICO — Bloqueia lançamento em produção

#### 1. Rotas da API sem autenticação
- **Arquivo**: `src/routes/agendamento.js`
- **Problema**: Qualquer pessoa pode acessar `POST /config`, `DELETE /agendamentos/:id`, `POST /servicos`, etc.
- **Solução**: Adicionar middleware de autenticação (JWT ou session) em todas as rotas sensíveis

#### 2. Race condition em overbooking
- **Arquivo**: `src/database/reposAgendamento.js`
- **Problema**: Se 2 clientes escolhem o mesmo horário simultaneamente, ambos veem disponível e ambos conseguem agendar
- **Solução**: `SELECT ... FOR UPDATE` ao verificar vagas antes de inserir agendamento

#### 3. Sem transações atômicas
- **Arquivos**: `src/database/repos.js`, `src/database/reposAgendamento.js`
- **Problema**: `insertAgendamento` + `insertLembretes` + `updateSessao` são 3 queries separadas. Se o banco cai no meio, dado fica corrompido
- **Solução**: Envolver em `BEGIN / COMMIT / ROLLBACK` explícito

#### 4. Webhook sem validação de assinatura
- **Arquivo**: `src/webhook/receiver.js`
- **Problema**: `verifyMetaSignature` retorna `true` se `secret` é null. Qualquer pessoa pode enviar mensagens falsas
- **Solução**: Tornar validação de assinatura obrigatória; validar também token UazAPI no header

#### 5. Senha do admin em texto puro
- **Arquivo**: `src/admin/routes/dashboard.js`
- **Problema**: `config.adminPassword` comparado sem hash. Se `.env` vazar, admin comprometido
- **Solução**: Hash com bcrypt na criação, `bcrypt.compare()` na validação

#### 6. Sem proteção CSRF
- **Arquivo**: `src/admin/routes/dashboard.js`
- **Problema**: Nenhum endpoint POST/DELETE tem verificação de token CSRF. Admin logado pode ter ações executadas por site externo
- **Solução**: Adicionar `csurf` middleware ou `SameSite=Strict` nos cookies de sessão

#### 7. Horários bloqueados pelo admin não funcionam
- **Arquivo**: `src/processor/horariosHelper.js`
- **Problema**: `isDataBloqueada()` existe mas nunca é chamada em `computeAvailableSlots()`. Admin bloqueia um dia, bot continua oferecendo slots nele
- **Solução**: Passar `cfg.horarios_bloqueados` para `computeAvailableSlots()` e filtrar

#### 8. Sem deduplicação de mensagens
- **Arquivo**: `src/webhook/receiver.js`
- **Problema**: Se UazAPI reenviar o mesmo webhook (retry de rede), o bot processa a mesma mensagem 2x e responde 2x
- **Solução**: Checar `whatsapp_message_id` na tabela `mensagens` antes de processar; ignorar duplicatas

---

### 🟡 IMPORTANTE — Afeta qualidade do produto

#### 9. Sem rate limiting
- **Arquivo**: `src/webhook/receiver.js`, `src/admin/routes/dashboard.js`
- **Problema**: Bot pode ser spamado; brute force no login do admin é possível
- **Solução**: `express-rate-limit` no webhook e no endpoint de login

#### 10. Sem índices de banco de dados
- **Arquivo**: `src/database/migrations/001_initial.sql`
- **Problema**: As colunas `telefone`, `cliente_id`, `horario` são consultadas frequentemente mas sem índice composto. Fica lento com volume
- **Solução**: `CREATE INDEX ON agendamentos(horario, status)`, `CREATE INDEX ON sessoes(cliente_id, updated_at)`

#### 11. Mensagens do bot ainda parcialmente hardcoded
- **Arquivo**: `src/processor/index.js`
- **Problema**: Textos como `"Um atendente irá responder em breve"`, `"Operação cancelada"`, `"Agendamento registrado! Obrigado"`, `"Até logo!"` não são configuráveis pelo admin
- **Solução**: Adicionar campos em `agendamento_config` ou permitir configuração via painel

#### 12. Timezone não é respeitado
- **Arquivo**: `src/processor/horariosHelper.js`
- **Problema**: Horários calculados em UTC. Se servidor roda em UTC+0 e empresa está em UTC-3, slots aparecem com 3h de diferença
- **Solução**: Adicionar campo `timezone` em `agendamento_config` (ex: `"America/Sao_Paulo"`) e usar `toLocaleString()` com timezone

#### 13. Upload de serviços não é idempotente
- **Arquivo**: `src/routes/agendamento.js`
- **Problema**: Upload em CSV/XLSX — se falha na linha 5, as 4 primeiras ficam no banco. Reenviar duplica
- **Solução**: Transação única para o bulk insert; rollback total em caso de erro

#### 14. Sem soft delete
- **Arquivos**: `src/database/repos.js`, `src/database/reposAgendamento.js`
- **Problema**: `DELETE` é permanente. Impossível recuperar dados ou ter audit trail
- **Solução**: Adicionar coluna `deleted_at`; queries filtram `WHERE deleted_at IS NULL`

#### 15. Logs com dados pessoais (LGPD)
- **Arquivo**: `src/webhook/receiver.js`
- **Problema**: Telefone parcial é logado em vários lugares. Potencial violação da LGPD
- **Solução**: Mascarar telefone nos logs: `5563***5775`

#### 16. Estado pode ficar corrompido em falha de banco
- **Arquivo**: `src/processor/index.js`
- **Problema**: Se banco cai durante transição de estado, sessão fica em estado desconhecido
- **Solução**: Verificar estados inválidos no início do `processarMensagem` e resetar para menu

---

### 🟢 MELHORIAS — Pós-lançamento

#### 17. Multi-tenancy real
- `EMPRESA_ID = 1` hardcoded em `reposAgendamento.js`. Impossível servir múltiplos clientes na mesma instância sem refatoração

#### 18. Observabilidade
- Sem trace ID correlacionando webhook → processor → banco. Impossível debugar latência ou erros em produção
- Solução: `AsyncLocalStorage` para trace ID, ou integração com Sentry/Datadog

#### 19. Analytics de funil
- Quantos clientes chegam em cada estado, onde abandonam, taxa de conversão
- Tabela `historico_estados` já existe mas nunca é consultada para relatórios

#### 20. Suporte a mídia
- Cliente não pode enviar foto do carro, bot não pode enviar comprovante em PDF

#### 21. Notificações proativas
- Lembrete automático 24h antes do agendamento via WhatsApp
- Código de lembretes existe (`src/scheduler/lembretes.js`) mas precisa revisão

#### 22. Duração variável de slots
- "Polimento = 2h" deveria bloquear 4 slots de 30min, não apenas 1
- `agendamento_servicos` tem campo `duracao` mas não é usado no cálculo de disponibilidade

#### 23. Timeout e textos configuráveis por empresa
- Timeout de 5 minutos hardcoded em `INATIVIDADE_TIMEOUT_MS`
- Textos do bot hardcoded em `processor/index.js`

#### 24. Testes automatizados
- Banco de dados acoplado diretamente em toda parte
- Sem dependency injection, impossível testar sem DB real

---

## Roadmap sugerido

```
Semana 1  →  Segurança crítica: autenticação nas rotas, hash de senha, CSRF (#1, #5, #6)
Semana 2  →  Integridade de dados: transações, race condition, horários bloqueados (#2, #3, #7)
Semana 3  →  Qualidade: deduplicação, rate limiting, índices (#8, #9, #10)
Semana 4  →  UX e admin: textos configuráveis, timezone, soft delete (#11, #12, #14)
Semana 5+  → Melhorias: multi-tenancy, observabilidade, mídia, analytics (#17-#24)
```

---

## Arquivos críticos do projeto

| Arquivo | Função |
|---------|--------|
| `src/processor/index.js` | Máquina de estados do bot |
| `src/processor/horariosHelper.js` | Cálculo e NLP de horários |
| `src/processor/states.js` | Enum de estados |
| `src/webhook/receiver.js` | Recebimento de webhooks UazAPI |
| `src/whatsapp/client.js` | Envio de mensagens via UazAPI/Meta |
| `src/whatsapp/templates.js` | Templates de mensagem |
| `src/database/repos.js` | Repositório geral (clientes, sessões) |
| `src/database/reposAgendamento.js` | Repositório de agendamentos e config |
| `src/routes/agendamento.js` | API REST do painel |
| `src/admin/routes/dashboard.js` | Painel administrativo |
| `src/database/migrations/` | Migrações do banco |
| `render.yaml` | Configuração de deploy |

---

*Atualize este arquivo ao fechar cada etapa para evitar perda de contexto.*
