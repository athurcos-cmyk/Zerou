# Plano: Assistente de IA + Lançamento via WhatsApp

Status: rascunho para revisão do dono. Nada implementado ainda.

## Overview

Duas features finais antes do lançamento:

1. **Assistente de IA financeiro** dentro do app — analisa gastos do usuário, responde perguntas, dá dicas.
2. **Lançamento via WhatsApp** — usuário manda "gastei 5 reais com uma bala" no WhatsApp e a transação é criada automaticamente no workspace dele.

Ambas exigem uma chamada de LLM com chave de API secreta e, no caso do WhatsApp, um endpoint HTTP público recebendo webhooks da Meta. Isso **não pode rodar no client** (SPA estática) — precisa de backend.

## Decisão de arquitetura: usar Firebase Cloud Functions (não Vercel Functions)

O projeto já tem `functions/` ativo e deployado (`southamerica-east1`, `firebase-admin`, usado hoje para `closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendDailyLogReminder`). Recomendo estender essa mesma codebase em vez de criar rotas `/api` na Vercel:

- **A favor de Firebase Functions**: infraestrutura, deploy (`firebase deploy --only functions`), gestão de secrets (`firebase functions:secrets:set`) e SDK admin já existem e já têm padrão estabelecido no repo. `firebase-admin` já é usado, então ler/escrever no Firestore com privilégio de servidor (bypassando Security Rules) é trivial. Menos superfície nova pra manter.
- **Contra**: cold start um pouco maior que Vercel Edge/Fluid Compute; região `southamerica-east1` é boa para o Brasil de qualquer forma.
- **Vercel Functions** seria razoável se o time quisesse consolidar tudo num único deploy, mas hoje isso significaria criar uma segunda infraestrutura de backend do zero (nova pasta `api/`, novo gerenciamento de env vars via `vercel env`, novo padrão de auth verificando o ID token do Firebase manualmente) só pra duplicar o que `functions/` já resolve.

**Recomendação: Firebase Cloud Functions.** Isso não ativa billing novo — o projeto já está no plano Blaze e `functions/` já está deployado; só estamos adicionando novas functions ao mesmo codebase existente.

**Confirmado pelo Arthur em 2026-07-13**: pode estender `functions/` com as novas Cloud Functions deste plano, e o provedor de IA é DeepSeek. Essas duas decisões não precisam ser reconfirmadas — ver `docs/planning/EXECUCAO_IA_E_WHATSAPP.md` (Gates A e B) para a versão executável.

## Requirements

- IA financeira: chat dentro do app, respostas baseadas nos dados reais do workspace do usuário (transações, categorias, orçamento), sem vazar dado de um workspace pro outro.
- WhatsApp: usuário vincula o número de WhatsApp à conta Zerou; mensagens de gasto em linguagem natural viram transações reais, com confirmação de volta pelo WhatsApp.
- Custo de IA o mais baixo possível — usar **DeepSeek** (API compatível com formato OpenAI, preço muito abaixo de GPT/Claude, ~US$0,27/milhão tokens de entrada em `deepseek-chat`) como provedor. Ver seção de custo mais abaixo para comparação.
- Nenhuma chave de API exposta no client (CSP do `vercel.json` já restringe `connect-src` a domínios Google/Firebase — chamadas de IA não devem vir do client de jeito nenhum, só de dentro das Cloud Functions).
- Mensagens do WhatsApp só devem criar transação se o número estiver vinculado e verificado a um workspace.
- Manter os mesmos campos/derivações que `createTransaction` já usa no client (`competenceMonth`, `cashMonth`, `clientMutationId`, `syncStatus`, `version`) para não quebrar a UI existente nem o padrão offline-first quando o usuário reabrir o app.

## Architecture Changes

- `functions/src/ai/` (novo) — cliente DeepSeek (`fetch` HTTP direto, sem SDK pesado — API é REST simples compatível com OpenAI), função de extração estruturada de gasto a partir de texto livre, função de chat do assistente.
- `functions/src/ai/financialAssistant.ts` — Cloud Function `onCall` `financialAssistantChat(workspaceId, message, history)`.
- `functions/src/whatsapp/webhookHandler.ts` — Cloud Function `onRequest` pública, endpoint de verificação (GET, `hub.challenge`) + recebimento de mensagens (POST), validação de assinatura `X-Hub-Signature-256`.
- `functions/src/whatsapp/linkAccount.ts` — Cloud Function `onCall` `generateWhatsappLinkCode(workspaceId)` (gera código de 6 dígitos, expira em 10 min) chamada pelo client quando o usuário clica "Vincular WhatsApp" nas Configurações.
- `functions/src/whatsapp/createTransactionFromMessage.ts` — versão server-side (admin SDK) da lógica de `financeService.createTransaction`, reaproveitando `financeSchemas.ts`/`financeCalculations.ts` se esses módulos não dependerem do SDK client do Firebase (checar antes: se dependem, extrair as partes puras — schema Zod e cálculo de `monthKeyFromDate` — para um lugar compartilhável entre `src/` e `functions/src/`, ou duplicar só a lógica pura, que é pequena).
- Novas coleções Firestore: `workspaces/{id}/whatsappLinks/{phoneNumberE164}` (guarda `workspaceId`, `linkedAt`, `verified`) e `users/{uid}/whatsappLinkCodes/{code}` (temporário, TTL).
- `src/pages/AssistantPage.tsx` (novo) — UI de chat, chama `financialAssistantChat` via `httpsCallable`.
- `src/settings/` — nova seção "Vincular WhatsApp" com botão que chama `generateWhatsappLinkCode` e mostra o código + deep link `wa.me/<numero-do-bot>?text=vincular%20<codigo>`.
- `firestore.rules` — regras para `whatsappLinks` (leitura só do próprio usuário; escrita só via Admin SDK, `allow write: if false` no client) e `whatsappLinkCodes` (mesma coisa). Rodar `npm run test:rules` antes de considerar pronto, conforme regra do `CLAUDE.md`.
- `vercel.json` — **nenhuma mudança de CSP necessária** se toda chamada de IA ficar dentro das Cloud Functions (o client só fala com `*.cloudfunctions.net`, que já está na allowlist).
- `.env`/secrets — `DEEPSEEK_API_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` via `firebase functions:secrets:set` (nunca em `.env` client nem commitado).

## Custo estimado (DeepSeek vs. alternativas)

| Provedor | Input | Output | Observação |
|---|---|---|---|
| **DeepSeek `deepseek-chat`** | ~US$0,27/1M tokens | ~US$1,10/1M tokens | Mais barato, API compatível OpenAI, suporta JSON mode/function calling — dá pra extrair `{amountCents, description, categoryHint}` de forma confiável |
| DeepSeek `deepseek-chat` (cache hit, mensagens repetidas de contexto) | ~US$0,07/1M tokens | — | Cache automático de prompt, bom pro assistente (contexto financeiro se repete entre mensagens da mesma conversa) |
| GPT-4o-mini | ~US$0,15/1M | ~US$0,60/1M | Um pouco mais barato que DeepSeek em input, mas Anthropic/OpenAI cobram mais no total pra uso conversacional |
| Claude Haiku | ~US$0,25/1M (aprox.) | ~US$1,25/1M | Ótima extração estruturada, preço parecido com DeepSeek |

Pra volume de um app pessoal/família (não milhares de usuários simultâneos), o custo real é irrelevante em qualquer um desses — provavelmente poucos dólares por mês mesmo em uso ativo. DeepSeek atende ao pedido de "o mais barato possível" e tem JSON mode, então fica confirmado como escolha, mas nenhuma opção aqui é "de graça" de verdade — modelos hospedados sempre cobram por token. Se quiser custo zero literal, a alternativa seria rodar um modelo local (ex. Llama pequeno via Ollama num servidor próprio), mas isso é infraestrutura extra, mais lenta e pior em português — não recomendo pro lançamento.

## Implementation Steps

### Phase 1: Assistente de IA (mais simples, sem dependência externa de aprovação)

1. **Extrair contexto financeiro resumido** (File: `functions/src/ai/buildFinancialContext.ts`)
   - Action: Função que recebe `workspaceId` e `uid`, lê via Admin SDK as transações dos últimos ~90 dias, orçamentos e metas, e retorna um resumo agregado (gasto por categoria/mês, comparação com mês anterior, contas a pagar próximas) — **não manda a lista crua de transações pro modelo**, manda só agregados, pra reduzir custo e melhorar a qualidade da resposta.
   - Why: Contexto pequeno e relevante é mais barato e mais preciso que despejar dados brutos no prompt.
   - Dependencies: None
   - Risk: Medium — precisa verificar que `uid` realmente pertence ao `workspaceId` antes de ler qualquer dado (checar membership igual às regras do Firestore fariam, já que Admin SDK ignora as rules).

2. **Cliente DeepSeek** (File: `functions/src/ai/deepseekClient.ts`)
   - Action: Wrapper fino sobre `fetch` para `https://api.deepseek.com/chat/completions`, JSON mode, timeout e tratamento de erro.
   - Why: Isolar o provedor de IA facilita trocar depois se necessário.
   - Dependencies: None
   - Risk: Low

3. **Cloud Function `financialAssistantChat`** (File: `functions/src/ai/financialAssistant.ts`)
   - Action: `onCall` que valida `context.auth`, monta prompt de sistema em português com o contexto do passo 1 + histórico da conversa (limitado, ex. últimas 10 mensagens), chama DeepSeek, retorna resposta.
   - Why: Ponto único de entrada, chave de API nunca sai do servidor.
   - Dependencies: Steps 1, 2
   - Risk: Medium — rate limiting por usuário (ex. Firestore doc com contador diário) pra evitar abuso/custo inesperado.

4. **UI do assistente** (File: `src/pages/AssistantPage.tsx`, rota nova em `src/app/`)
   - Action: Tela de chat simples (lista de mensagens + input), chama `httpsCallable(functions, 'financialAssistantChat')`, estado local de loading/erro com `getUserFacingErrorMessage`.
   - Why: Interface do usuário para a feature.
   - Dependencies: Step 3
   - Risk: Low

5. **Sugestões proativas (opcional, fase 2 dentro da Phase 1)** (File: `functions/src/automation.ts` — nova função agendada)
   - Action: Job semanal (reaproveitando padrão de `onSchedule` já existente) que gera um resumo/dica e salva como notificação in-app.
   - Why: IA "prestativa" sem o usuário precisar abrir o chat.
   - Dependencies: Steps 1-3
   - Risk: Low — pode ficar pra depois do lançamento, não é bloqueante.

### Phase 2: Lançamento via WhatsApp

6. **Provisionar Meta WhatsApp Business API** (fora do código — conta Meta Business, número de teste/produção, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`)
   - Action: Dono cria o app no Meta for Developers, configura produto WhatsApp, obtém número de teste primeiro (grátis, até 5 destinatários) antes de partir pra verificação de negócio.
   - Why: Sem isso nada funciona; é o item de maior prazo (aprovação da Meta pode levar dias).
   - Dependencies: None — pode começar em paralelo com a Phase 1
   - Risk: High (não técnico) — prazo de aprovação da Meta é fora do nosso controle. Recomendo iniciar esse cadastro **imediatamente**, mesmo antes de codar, para não travar o lançamento no final.

7. **Extrair lógica de criação de transação para versão server-side** (File: `functions/src/whatsapp/createTransactionFromMessage.ts`, reaproveitando `src/finance/financeSchemas.ts` se possível)
   - Action: Checar se `financeSchemas.ts` e as funções puras de `financeCalculations.ts`/`money.ts` importam algo do SDK client do Firebase. Se não importarem, importar direto de `functions/` (monorepo com paths relativos ou pacote compartilhado). Se importarem, duplicar só a parte pura necessária (schema Zod + `monthKeyFromDate`) dentro de `functions/src/`.
   - Why: Evitar decisão de enum não gerar o mesmo objeto que o client produziria (mesma armadilha da REGRA PRINCIPAL do `CLAUDE.md` sobre campos novos — aqui o risco é o inverso, o servidor escrever um formato que o client não reconhece).
   - Dependencies: None
   - Risk: Medium

8. **Vínculo de conta WhatsApp ↔ workspace** (Files: `functions/src/whatsapp/linkAccount.ts`, `src/settings/WhatsappLinkSection.tsx`, `firestore.rules`)
   - Action: Client chama `generateWhatsappLinkCode(workspaceId)`, exibe código + link `wa.me`. Usuário manda "vincular 123456" pro número do bot. Webhook recebe, valida código não expirado, grava `whatsappLinks/{phoneE164} -> {workspaceId, uid}`, apaga o código.
   - Why: Sem isso, o webhook não sabe de qual usuário/workspace é a mensagem recebida.
   - Dependencies: Step 6 (precisa do número de teste pra testar o fluxo)
   - Risk: Medium — validar que o número não está vinculado a outro workspace (evitar sequestro de conta por reenvio de código antigo).

9. **Webhook de recebimento + extração de gasto** (File: `functions/src/whatsapp/webhookHandler.ts`)
   - Action: `onRequest` público. GET responde challenge de verificação da Meta. POST: valida assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`, identifica o `workspaceId` pelo número remetente (via `whatsappLinks`), chama DeepSeek com prompt de extração estruturada (JSON mode: `{amountCents, description, categoryGuess, confidence}`), chama `createTransactionFromMessage` (Step 7), envia mensagem de confirmação de volta via Meta Send API ("✅ Registrado: R$ 5,00 em Bala — categoria Alimentação").
   - Why: Núcleo da feature.
   - Dependencies: Steps 2, 7, 8
   - Risk: High — é um endpoint público na internet; precisa validar assinatura sempre, responder rápido (Meta espera 200 em poucos segundos, então processar de forma assíncrona se a chamada de IA demorar) e tratar mensagem ambígua ("gastei um dinheiro" sem valor) devolvendo uma pergunta de esclarecimento em vez de criar transação errada.

10. **Casos de erro / baixa confiança** (File: mesmo `webhookHandler.ts`)
    - Action: Se a extração vier com `confidence` baixa ou sem `amountCents`, responder pedindo pra reformular, sem criar transação. Se `categoryGuess` não bater com nenhuma categoria existente do workspace, criar sem categoria (deixa "sem categoria") em vez de inventar uma nova.
    - Why: Evitar lançamento errado silencioso — pior experiência possível pra um app financeiro.
    - Dependencies: Step 9
    - Risk: Medium

## Testing Strategy

- Unit tests: extração de valor/descrição a partir de mensagens de exemplo (mock do cliente DeepSeek), cálculo de contexto financeiro agregado, validação de assinatura do webhook.
- Integration tests (`tests/firestore.rules.test.ts`): garantir que `whatsappLinks`/`whatsappLinkCodes` não são graváveis pelo client, só pelo Admin SDK.
- Manual/E2E: enviar mensagens reais pro número de teste da Meta durante desenvolvimento (`wa.me` sandbox), conferir que a transação aparece certa no app depois de recarregar (garante que os campos derivados batem com o que o client espera).
- `npm run typecheck && npm test && npm run build` antes de considerar pronto, como sempre.

## Risks & Mitigations

- **Risco**: aprovação de negócio da Meta atrasa o lançamento.
  - Mitigação: iniciar o cadastro no Meta for Developers já, em paralelo à Phase 1; lançar a IA financeira sozinha primeiro se o WhatsApp não estiver pronto a tempo.
- **Risco**: custo de IA sair do controle com uso intenso ou mensagens repetidas/spam no WhatsApp.
  - Mitigação: rate limit por usuário/dia nas duas Cloud Functions, timeout curto, DeepSeek já é o provedor mais barato disponível.
  - **Risco**: transação criada errada a partir de mensagem ambígua (dinheiro perdido/mal categorizado sem o usuário perceber, pelo padrão fire-and-forget do app).
  - Mitigação: sempre confirmar por mensagem de volta no WhatsApp o que foi lançado, e não criar nada quando a confiança da extração for baixa.
- **Risco**: dado do servidor (Admin SDK, sem passar pelas Security Rules) sair de formato diferente do que o client grava, quebrando a UI ao sincronizar — o mesmo padrão dos dois incidentes reais já documentados no `CLAUDE.md`.
  - Mitigação: Step 7 existe exatamente pra isso — reaproveitar ou espelhar fielmente o schema/cálculo do client.
- **Risco**: vazamento de dado financeiro de um workspace pro assistente de IA de outro usuário (bug de authorization check no `onCall`).
  - Mitigação: sempre validar membership via Admin SDK antes de ler qualquer dado, nunca confiar em `workspaceId` vindo do client sem checar.

## Success Criteria

- [ ] Usuário abre o assistente, pergunta "onde gastei mais esse mês?" e recebe resposta correta baseada nos dados reais dele.
- [ ] Usuário vincula o WhatsApp pelas Configurações e recebe confirmação de vínculo.
- [ ] Mensagem "gastei 5 reais com uma bala" no WhatsApp cria uma transação de R$ 5,00 categorizada como Alimentação (ou categoria mais próxima existente) e o usuário recebe confirmação.
- [ ] Mensagem ambígua não cria transação errada, só pede esclarecimento.
- [ ] Nenhuma chave de API aparece no bundle do client (checar `dist/` depois do build).
- [ ] `npm run test:rules` passa com as novas regras de `whatsappLinks`.
- [ ] Custo de IA mensal estimado documentado no `docs/BILLING.md` ou similar, mesmo o produto sendo gratuito hoje.

## Próximo passo

Este plano ainda não foi implementado. Arquitetura e provedor de IA já confirmados (ver acima). Falta apenas:

1. Arthur criar a conta DeepSeek (platform.deepseek.com) e gerar a `DEEPSEEK_API_KEY` — necessário pra começar a Fase 1.
2. Arthur criar o app no Meta for Developers / WhatsApp Business — necessário só pra Fase 2, pode rodar em paralelo à Fase 1.

O documento executável, com passo a passo detalhado por arquivo, está em `docs/planning/EXECUCAO_IA_E_WHATSAPP.md`.
