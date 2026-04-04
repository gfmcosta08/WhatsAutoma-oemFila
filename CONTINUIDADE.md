# Continuidade do projeto (handoff)

Última atualização: **2026-04-04**.

---

## Problema Principal

**Bot não responde a mensagens no WhatsApp.**

O usuário envia mensagens de outro número para o número automatizado (instância UazAPI `farollbr.uazapi.com`), mas o bot não retorna resposta.

### Fluxo Esperado

```
Usuário → WhatsApp → UazAPI (farollbr.uazapi.com) → Webhook POST → Render API → Processamento → Resposta via UazAPI → Usuário
```

### O Que Foi Confirmado

- **Webhook chegou uma vez** — logs de runtime mostraram:
  ```
  [webhook-entrada] === WEBHOOK RECEBIDO ===
  [webhook-entrada] payload recebido
  [webhook-entrada] processando mensagem
  [webhook-entrada] handleIncoming chamado
  [notify] ENVIANDO MENSAGEM WHATSAPP
  [whatsapp] sendText.provider: uazapi
  [whatsapp] UazAPI creds check { hasBaseUrl: true, hasInstanceToken: true, baseUrl: 'https://farollbr.uazapi.com' }
  [whatsapp] erro envio UazAPI 500 { error: 'the number 8118965629@s.whatsapp.net is not on WhatsApp' }
  [whatsapp] erro envio UazAPI após retry 55 500 { error: 'the number 558118965629@s.whatsapp.net is not on WhatsApp' }
  ```
- **Credenciais UazAPI estão corretas** — `UAZAPI_BASE_URL`, `UAZAPI_INSTANCE_TOKEN`, `UAZAPI_INSTANCE_PHONE` configuradas nas env vars da Render.
- **URL do webhook**: `https://whatsautoma-oemfila.onrender.com/webhook/entrada/a28c55ed3415125f47db62015a063ab480e856a2d1bb1487aea8a518b057064b`
- **Instância UazAPI**: `https://farollbr.uazapi.com`

### O Que Está Acontecendo Agora

Após múltiplos deploys, **nenhum webhook chega ao servidor**. Os logs da Render mostram apenas build/deploy, sem nenhuma linha de runtime com `webhook-entrada` ou `[WEBHOOK DEBUG]`.

**Duas hipóteses:**
1. **A UazAPI parou de enviar webhooks** — a instância pode ter sido reiniciada/reconectada e as configurações de webhook foram resetadas. O usuário confirma que o webhook está configurado no painel, mas os logs não mostram chegada.
2. **O webhook chega mas os logs não estão sendo capturados** — o usuário pode estar enviando apenas Build Logs em vez de Runtime Logs no painel da Render.

---

## O Que Foi Feito Nesta Sessão (ordem cronológica)

### 1. Correção de números brasileiros sem dígito 9 (`fixBrazilianMobile`)
- **Arquivo**: `src/webhook/receiver.js`
- **Problema**: A UazAPI enviava números como `8118965629` (10 dígitos) ao invés de `558198965629` (13 dígitos). Faltava o `9` dos celulares BR.
- **Solução**: Função `fixBrazilianMobile()` adicionada para detectar e corrigir automaticamente.

### 2. Aceitação de JIDs `@lid` (Linked Device)
- **Arquivo**: `src/webhook/receiver.js`
- **Problema**: A função `digitsFromAddressingJid()` descartava completamente números em formato `@lid`, que a UazAPI pode enviar.
- **Solução**: Removida a verificação `if (lower.endsWith('@lid')) return '';`. Agora extrai os dígitos mesmo de `@lid`.

### 3. Proteção contra duplicação do dígito 9
- **Arquivo**: `src/webhook/receiver.js`
- **Problema**: `fixBrazilianMobile` poderia adicionar `9` duplicado em números já corretos.
- **Solução**: Adicionada verificação `if (n.startsWith('55') && n.length === 13 && n[4] === '9') return n;`.

### 4. Timeout no fetch (15 segundos)
- **Arquivo**: `src/whatsapp/client.js`
- **Problema**: Requisições HTTP para a UazAPI podiam ficar penduradas indefinidamente.
- **Solução**: Função `fetchWithTimeout()` com `AbortController` e 15s de timeout.

### 5. Proteção contra baseUrl malformado
- **Arquivo**: `src/whatsapp/client.js`
- **Problema**: `new URL(url)` lançava exceção não tratada se `baseUrl` fosse inválido, crashando o webhook handler.
- **Solução**: Validação `if (!base || !base.startsWith('http'))` + try/catch no `new URL()`.

### 6. Try/catch em todas as requisições HTTP
- **Arquivo**: `src/whatsapp/client.js`
- **Problema**: Erros de rede e timeout não eram tratados.
- **Solução**: Blocos try/catch em `postDigits()` e `sendTextMeta()`.

### 7. Logs de diagnóstico adicionados
- **Arquivos**: `src/webhook/receiver.js`, `src/whatsapp/notify.js`, `src/whatsapp/client.js`
- Logs em:
  - Entrada do webhook (`[WEBHOOK DEBUG]`, `=== WEBHOOK RECEBIDO ===`)
  - Extração de telefone (`telefone_raw`, `telefone_corrigido`)
  - Envio de mensagem (`ENVIANDO MENSAGEM WHATSAPP`, `RESULTADO ENVIO`)
  - Credenciais UazAPI (`UazAPI creds check`)

### 8. UAZAPI_BASE_URL fixado no render.yaml
- **Arquivo**: `render.yaml`
- Definido `UAZAPI_BASE_URL: https://farollbr.uazapi.com` diretamente no blueprint.

---

## Commits desta Sessão

| Commit | Descrição |
|--------|-----------|
| `a2397ee` | add debug logs for webhook troubleshooting |
| `8b9ea2c` | render: set UAZAPI_BASE_URL to farollbr.uazapi.com |
| `3010ad0` | fix: correct Brazilian mobile numbers missing digit 9 |
| `f79247c` | enhance: add more diagnostic info to webhook inbound log |
| `25ee9f9` | debug: add console.log at webhook entry |
| `9976c6c` | fix: critical webhook fixes - @lid JID support, mobile number fix, fetch timeout, error handling |

---

## Estado Atual do Código

### Arquivos Modificados
- `src/webhook/receiver.js` — parser de entrada UazAPI com correção de números BR, @lid support, logs de diagnóstico
- `src/whatsapp/client.js` — timeout no fetch, proteção contra baseUrl inválido, try/catch
- `src/whatsapp/notify.js` — logs de envio
- `render.yaml` — UAZAPI_BASE_URL fixado

### Arquivo de Entrada
- O servidor roda via `node src/replit-serve.js` (API Express + Next.js na mesma porta)

### Endpoints Relevantes
- `POST /webhook/entrada/:token` — webhook UazAPI (principal)
- `GET/POST /webhook/whatsapp` — webhook Meta (legado, não usado)
- `GET /health` — health check

---

## O Que a Próxima IA Precisa Fazer

### Passo 1 — Confirmar se o webhook está chegando
- O usuário precisa enviar **Runtime Logs** (não Build Logs) da Render após enviar uma mensagem de teste.
- Procurar por `WEBHOOK DEBUG` ou `webhook-entrada` nos logs.
- Se **NÃO aparecer**: o problema é na UazAPI — ela não está enviando webhooks para o servidor.
- Se **APARECER**: o problema está no processamento ou envio.

### Passo 2 — Se o webhook NÃO está chegando
- Verificar no painel da UazAPI (`farollbr.uazapi.com`):
  - A instância está conectada?
  - O webhook está ATIVO (toggles ligados)?
  - A URL está correta?
  - Eventos de mensagem estão habilitados?
- Tentar desativar e reativar o webhook no painel.
- Testar com um webhook tester (webhook.site) para confirmar que a UazAPI está enviando.

### Passo 3 — Se o webhook ESTÁ chegando
- Verificar os logs de `telefone_raw` e `telefone_corrigido` para confirmar extração correta.
- Verificar `UazAPI creds check` para confirmar credenciais.
- Verificar `RESULTADO ENVIO` para ver se o envio funcionou ou falhou.
- Se falhar com `not on WhatsApp`, o número pode estar em formato errado ou a instância UazAPI pode não ter permissão para enviar para aquele número.

### Passo 4 — Possível problema de authMode
- O log mostrou `authMode: 'query'` mas o domínio é `farollbr.uazapi.com` (produção, não `.uazapi.dev`).
- A função `resolveUazapiAuthMode` em `whatsappRuntime.js:100-113` retorna `query` para domínios que não são `*.uazapi.dev`.
- Se a UazAPI v2 espera auth por **header** mas está usando **query**, o envio falha com 401/403.
- **Solução potencial**: forçar `UAZAPI_AUTH_MODE=header` nas env vars da Render.

---

## Infraestrutura

- **Repositório**: [gfmcosta08/WhatsAutoma-oemFila](https://github.com/gfmcosta08/WhatsAutoma-oemFila)
- **URL principal**: `https://whatsautoma-oemfila.onrender.com`
- **UazAPI**: `https://farollbr.uazapi.com`
- **Webhook URL**: `https://whatsautoma-oemfila.onrender.com/webhook/entrada/a28c55ed3415125f47db62015a063ab480e856a2d1bb1487aea8a518b057064b`
- **Runtime**: Node.js 25.9.0, Express + Next.js 14.2.35
- **Banco**: PostgreSQL (Render managed)
- **Cache**: Redis (Render managed)

---

*Atualize este arquivo ao fechar cada etapa de debug para evitar perda de contexto.*
