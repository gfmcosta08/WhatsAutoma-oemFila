# Continuidade do projeto (handoff)

Última atualização: **2026-04-04**.

## Contexto do problema atual

- Sintoma reportado: **bot não responde no WhatsApp**.
- O usuário confirmou envio de várias mensagens, recadastro da UazAPI e testes repetidos.
- No fim da sessão, os logs compartilhados eram apenas de **build/deploy** do Render (sem eventos de webhook em runtime no recorte enviado).

## O que foi implementado nesta rodada (ordem cronológica)

### 1) Configuração do painel / deploy

- `0ae71a6` — `AdminConfigSection` com login inline e URL única de webhook.
- `96d68e4`, `326c983`, `d8a1749` — correções de build Render/Next (`build:render`, alias `@`, devDeps do `web` para Tailwind).
- `render.yaml` ajustado para variáveis do fluxo WhatsApp e deploy consistente.

### 2) Banco e estado de configuração

- `dd50ea6` — migração 002 mais tolerante.
- `83e46fb` — seed/garantia de `agendamento_config` (`empresa_id=1`) e banner do painel alinhado com estado de credenciais.
- `008_agendamento_config_seed.sql` criado.

### 3) Webhook / parser de entrada UazAPI

- `0082d40` — suporte inicial para formato Evolution (`data.key.remoteJid`, `message.conversation`) e filtro `fromMe`.
- `dbfcb9b` — suporte a `data[]`, `data.messages[]`, resiliência de Redis (erro de cache não impede resposta), logs melhores de erro de envio.
- `9b3c7b2` — suporte a `remoteJidAlt` / `senderPn`, ignorando `@lid` como telefone final.
- `6710406` — heurística por score para escolher melhor candidato de telefone (inclui `participantPn`), com `sample_jids` mascarado em log para diagnóstico.

### 4) Envio UazAPI (saída)

- `2a92359` — retry automático com prefixo `55` quando a UazAPI responde **"not on WhatsApp"** para número 10–11 dígitos.
- `d0cb348` — documentação em `.env.example` sobre o retry e `WHATSAPP_DEFAULT_CC`.

## Evidências coletadas durante debug

- Em momento anterior, o runtime mostrou:
  - `[webhook-entrada] payload recebido`
  - `[webhook-entrada] processando mensagem`
  - `[whatsapp] erro envio UazAPI ... not on WhatsApp`
  - `[webhook] mensagem processada`
- Isso comprovou que o fluxo interno executava, mas a UazAPI recusava o destino (JID/número).
- Após novos ajustes, o usuário reportou não ver diferenças no log, mas os recortes enviados ficaram em **Build Logs**, sem eventos de runtime para fechar diagnóstico final.

## Estado atual (aberto)

- O código está com parser e envio mais robustos.
- O bloqueio atual é operacional/observabilidade:
  - não há, no recorte final compartilhado, linhas de runtime com `webhook-entrada` para confirmar entrega do webhook;
  - sem essas linhas, não dá para afirmar se o problema está em:
    1) UazAPI não disparando webhook,
    2) endpoint/token inválido no webhook,
    3) envio recusado pela UazAPI por JID/telefone.

## Próximos passos objetivos (quando retomar)

1. Abrir **Runtime Logs** no Render (não Build Logs), filtrar por `webhook-entrada`.
2. Enviar mensagem de teste e coletar:
   - `[webhook-entrada] payload recebido` (com `sample_jids`)
   - `[webhook-entrada] processando mensagem`
   - qualquer `[whatsapp] erro envio UazAPI...`
3. No painel UazAPI, validar:
   - webhook exato: `https://whatsautoma-oemfila.onrender.com/webhook/entrada/<token>`
   - eventos de mensagem habilitados (`messages.upsert`/equivalente)
   - instância em `connected`
4. Se houver nova rejeição de número, usar `sample_jids` para ajustar prioridade dos campos do payload de forma definitiva.

## Deploy/infra (referência)

- Repositório: [gfmcosta08/WhatsAutoma-oemFila](https://github.com/gfmcosta08/WhatsAutoma-oemFila)
- URL principal: `https://whatsautoma-oemfila.onrender.com`
- `render.yaml` atualizado com opção:
  - `WHATSAPP_DEFAULT_CC` (opcional; recomendado `55` para contexto BR)

---

*Atualize este arquivo ao fechar cada etapa de debug para evitar perda de contexto.*
