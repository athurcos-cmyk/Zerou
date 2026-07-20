# Revisao Camada 2: Auditoria Cloud Functions — 2026-07-19

## Sumario

15 achados revisados. 11 CONFIRMADOS, 1 SUBESTIMADO, 1 FALSO-POSITIVO PARCIAL, 1 SUBESTIMADO+PARCIALMENTE INCORRETO, 1 observacao complementar INCORRETA. 5 lacunas encontradas que o auditor nao reportou como achados.

---

## 1. Validacao dos achados

### FUNCTIONS-CRIT-001: Webhook WhatsApp sem validacao de assinatura HMAC

**Classificacao: CONFIRMADO**

O codigo em `functions/src/whatsapp/webhookHandler.ts:103-116` realmente mostra a validacao HMAC comentada. O comentario diz explicitamente "TODO: add WHATSAPP_APP_SECRET secret, then uncomment validation below."

**Validacao de PoC:**
1. A URL do webhook e publica — `onRequest` sem autenticacao.
2. O codigo comentado usa `whatsappAccessToken.value()` como segredo HMAC, que e o **token errado** (deveria ser `WHATSAPP_APP_SECRET`, nao o access token da API). Mesmo que o desenvolvedor descomente, usara o secret errado e a validacao quebrara.
3. Nao ha `defineSecret('WHATSAPP_APP_SECRET')` em lugar nenhum do codebase — o secret sequer existe.
4. O processamento usa Admin SDK, bypassando firestore.rules.

**Agravante nao notado pelo auditor:** o codigo comentado usa o secret errado (`whatsappAccessToken` em vez de `WHATSAPP_APP_SECRET`). Se for descomentado sem correcao, a assinatura HMAC sempre falhara, e o Meta parara de entregar webhooks legítimos, derrubando a integracao inteira. O risco nao e so de continuar desativado — e de ser "ativado" de forma quebrada.

---

### FUNCTIONS-CRIT-002: whatsappPhoneIndex legivel por qualquer usuario autenticado

**Classificacao: CONFIRMADO**

`firestore.rules:1591-1594`:
```
match /whatsappPhoneIndex/{phone} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

Qualquer usuario autenticado pode listar (`list`) toda a colecao e ler (`get`) qualquer documento. Nao ha restricao por workspace nem por userId.

**Validacao de PoC:** A regra `read` inclui tanto `get` quanto `list`. Um atacante pode:
```js
db.collection('whatsappPhoneIndex').get() // lista todos
db.doc('whatsappPhoneIndex/5511999999999').get() // le um especifico
```

**Agravante:** o `processLinkCode` em `linkAccount.ts:105` tambem le `whatsappPhoneIndex/${phoneNumber}` para verificar se o numero ja esta vinculado — esta leitura nao requer listagem, entao `allow read: if false` nao quebraria o fluxo. A funcao `unlinkWhatsapp` usa Admin SDK, entao tambem nao depende da regra.

---

### FUNCTIONS-ALTA-001: BudgetAlerts — race condition no estado de notificacao 80%/100%

**Classificacao: CONFIRMADO**

Em `functions/src/budgetAlerts.ts`:
- Linha 75-76: reset do estado do mes (`set` sem transacao)
- Linha 116: segunda leitura do estado (`refreshedState`)
- Linhas 118-136: verificacao e update de `notified80`/`notified100`

**Validacao de PoC:** O padrao e read-check-update sem transacao. A funcao tem `maxInstances: 1` no `onSchedule`, mas retries por timeout (Cloud Functions reexecuta se a instancia morre antes de responder) podem gerar sobreposicao. Cenario:
1. Run A le `alertState` (notified80=false), faz reset do mes, calcula gastos = 85%, le `refreshedState` (notified80=false).
2. Run B (retry de A que time-out) faz o mesmo, tambem ve notified80=false.
3. Ambas enviam push e fazem `update({notified80: true})` — push duplicado.

**Nuance:** o update usa `ref.update({notified80: true})` em vez de `ref.set({...}, {merge: true})`, entao se as duas execucoes forem simultaneas, a segunda sobrescreve a primeira — sem perda de dados, apenas confirmacao duplicada. Impacto limitado a 1 notificacao extra por mes por categoria.

---

### FUNCTIONS-ALTA-002: createCardPurchaseFromMessage — leitura fora da batch compromete atomicidade

**Classificacao: CONFIRMADO**

Em `functions/src/whatsapp/createCardPurchaseFromMessage.ts:136-141`:
```typescript
for (const invoiceCreate of invoicesToCreate.values()) {
  const snapshot = await invoiceCreate.ref.get();
  if (!snapshot.exists) {
    batch.set(invoiceCreate.ref, invoiceCreate.payload);
  }
}
```

O `get()` dentro do loop entre `batch.set()`s (linhas 91-104 e 111-134) quebra a atomicidade da batch. Se a funcao falhar entre um `get()` que retorna `!exists` e o `batch.commit()`, a fatura nao sera criada e o ledger ficara orfao (entradas de ledger sem documento de invoice).

**Observacao:** a funcao tem `maxInstances: 10` (herdado do webhook que a chama). O timeout do webhook e de 60s (padrao) + processamento DeepSeek. Se o DeepSeek demorar, o `batch.commit()` pode ser cortado.

---

### FUNCTIONS-MEDIA-001: createCategoryFromMessage — race condition na verificacao de duplicata

**Classificacao: CONFIRMADO**

Em `functions/src/whatsapp/createCategoryFromMessage.ts:30-42`:
```typescript
const existing = activeSnap.docs.find(
  (d) => (d.data().name as string)?.trim().toLowerCase() === name.toLowerCase(),
);
if (existing) { return { ... created: false }; }
// ... cria a categoria
```

A verificacao de duplicata e a criacao sao duas operacoes separadas sem transacao.

**Validacao de PoC:** Duas requisicoes simultaneas via WhatsApp podem ambas executar o `find`, ambas nao encontrar a categoria, e ambas criar categorias com nomes identicos (diferentes IDs). Comportamento demonstravel: enviar duas mensagens "cria categoria Transporte" simultaneas.

---

### FUNCTIONS-MEDIA-002: whatsappWebhook — sem limite de taxa por remetente

**Classificacao: SUBESTIMADO**

O auditor classificou como Média (confianca 7). O risco e maior do que o apresentado por tres razoes:

1. **A funcao nao tem `secrets: [whatsappAccessToken]` na configuracao.** Olhando `webhookHandler.ts:81`:
   ```typescript
   secrets: [deepseekApiKey],
   ```
   Apenas `deepseekApiKey` esta listado. O `whatsappAccessToken` e `whatsappPhoneNumberId` sao `defineString` (lidos na inicializacao, resolvidos via environment variables), nao `defineSecret`. Se o deploy nao injetar essas variaveis, a funcao pode falhar silenciosamente.

2. **O custo do ataque nao se limita a DeepSeek.** Cada mensagem tambem pode:
   - Disparar `collectionGroup` queries (Firestore leituras)
   - Chamar API Meta (`sendWhatsAppMessage`)
   - Criar transacoes no Firestore (escritas)
   O custo acumulado pode estourar o orcamento do Firebase (Blaze) em minutos.

3. **O webhook responde 200 antes de processar** (linha 119) — padrao correto para Meta, mas significa que o Meta nao retentará mensagens que falham pos-200. O Meta pode, no entanto, reentregar mensagens que timeout antes do 200. Sem rate limiting, reentregas amplificam o problema.

---

### FUNCTIONS-MEDIA-003: generateRecurrences — criacao de transacoes sem verificacao de membro ativo

**Classificacao: CONFIRMADO**

Em `functions/src/automation.ts:140-255`, a funcao busca regras `isActive === true` via `collectionGroup('recurring')` e cria transacoes usando `rule.createdBy` como `createdBy`. Nao verifica se o usuario ainda e membro ativo do workspace.

**Achado similar nao reportado:** o mesmo problema existe em `sendDueReminders` (`automation.ts:264-307`). A funcao busca `collectionGroup('bills')` e envia push para `bill.createdBy` sem verificar se o usuario ainda e membro do workspace. Isso pode gerar notificacoes para usuarios que ja sairam do espaco. Considerar estender o achado.

---

### FUNCTIONS-MEDIA-004: Dados financeiros enviados ao DeepSeek sem controle de acesso por permissao

**Classificacao: CONFIRMADO**

A funcao `buildFinancialContext` (`functions/src/ai/buildFinancialContext.ts`) monta um contexto financeiro completo (transacoes, contas, faturas, orcamentos, metas, boletos) e envia para a API DeepSeek (servidores externos). O usuario e membro ativo do workspace, conforme verificado por `verifyWorkspaceMembership`, mas nao ha aviso ao usuario sobre o processamento de dados por terceiros.

**O auditor nao mencionou que o mesmo contexto tambem e enviado pelo WhatsApp** (`answerFinancialQuestion.ts:44`), que compartilha a mesma funcao `buildFinancialContext`. O risco se aplica igualmente ao canal WhatsApp.

---

### FUNCTIONS-BAIXA-001: emailAdapter e um stub que sempre retorna `sent: false`

**Classificacao: CONFIRMADO**

`functions/src/email/emailAdapter.ts:49-65` retorna `{ sent: false, reason: "Provider adapter is not implemented yet." }`. Confirmado que `sendOperationalEmail` nao e chamado por nenhuma funcao em producao — apenas por seu proprio teste (`emailAdapter.test.ts`).

---

### FUNCTIONS-BAIXA-002: reverseCardPurchaseOnDelete — comentarios indicam risco de recursao

**Classificacao: FALSO-POSITIVO PARCIAL**

O auditor afirmou: "usa `collectionGroup('ledger')` **sem filtro de workspace**". Isso e **INCORRETO**. O codigo em `reverseCardPurchaseOnDelete.ts:42-44`:
```typescript
const ledgerSnap = await db
  .collectionGroup('ledger')
  .where('workspaceId', '==', workspaceId)    // <-- FILTRO PRESENTE
  .where('sourceTransactionId', '==', transactionId)
  .get();
```

O filtro `workspaceId` esta presente. A query busca apenas entradas de ledger do workspace correto.

**Parte correta do achado:** o cenario teorico de exclusao-restauracao-exclusao gerar creditos duplicados (reversoes em dobro para a mesma compra) e valido. A protecao `entry.type === 'purchase_reversal'` impede reversao de reversao, mas se o fluxo for:
1. Exclui compra → cria reversoes R1, R2 para as parcelas
2. Restaura compra (remove `deletedAt`)
3. Exclui compra de novo → query encontra entradas originais (pula R1, R2) e cria R1', R2'

O resultado: 2 reversoes para cada parcela original, dobrando os creditos. Probabilidade muito baixa (depende de restauracao manual).

**Classificacao revisada:** O risco teorico deve permanecer como BAIXA ou INFO, mas a justificativa "sem filtro de workspace" e incorreta.

---

### FUNCTIONS-BAIXA-003: budgetAlerts — reset de estado usa `set` em vez de `{ merge: true }`

**Classificacao: CONFIRMADO**

Em `functions/src/budgetAlerts.ts:76`:
```typescript
await alertStateRef.set({ month, notified80: false, notified100: false });
```

Sem `{ merge: true }`. Se o schema for expandido, campos extras serao perdidos no reset mensal.

---

### FUNCTIONS-BAIXA-004: billing schemas — priceCents opcional e nao usado

**Classificacao: CONFIRMADO**

`functions/src/billing/schemas.ts:9` define `priceCents: z.number().optional()` mas o campo nunca e lido. A funcao `createCheckoutSession` usa o preco do catalogo interno. Inofensivo mas confuso.

---

### FUNCTIONS-BAIXA-005: closeInvoicesDue — atualizacao de fatura sem verificacao de ownership

**Classificacao: CONFIRMADO**

Em `functions/src/automation.ts:65-118`, a funcao fecha faturas sem verificar se o workspace existe ou se tem membros ativos. Faturas orfas de workspaces deletados (subcolecoes residuais) seriam processadas. A operacao `update` em documento inexistente lancaria erro, mas `invoiceDoc.ref` so existe se o documento existe (veio do `get()`), entao nao ha risco de erro de update-in-existente — o documento existe porque foi retornado pela query. O risco e processar dados de workspaces que deveriam estar inacessiveis.

---

### FUNCTIONS-INFO-001: invoiceTotals — 14 tipos de InvoiceLedgerEntryType corretamente bucketizados

**Classificacao: CONFIRMADO**

Em `functions/src/cards/invoiceTotals.ts:42-62`, os 14 tipos estao mapeados:
- `debitTypes` (Set): `purchase`, `manual_debit` + `installment_anticipation` (linha 42)
- `installment_anticipation_credit`: tratado separadamente (linha 46)
- `feeTypes` (Set): `interest`, `fine`, `iof`, `fee`
- `paymentTypes` (Set): `payment`, `advance_payment`
- `creditTypes` (Set): `refund_credit`, `chargeback_credit`, `manual_credit`, `purchase_reversal`

Nenhum tipo cai no `return zero`. Sincronia confirmada com o enum do TypeScript (`src/types/contracts.ts`).

---

### FUNCTIONS-INFO-002: Stripe webhook usa `constructEvent` — implementacao correta

**Classificacao: CONFIRMADO**

`functions/src/billing/stripeBillingProvider.ts:99-104` usa `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` com idempotencia via `createBillingEventOnce`. Implementacao correta.

---

### Observacao complementar: App Check

**Classificacao: INCORRETA**

O auditor afirmou: "As **3** funcoes que declaram `consumeAppCheckToken: true` (createCheckoutSession, createCustomerPortalSession, **financialAssistantChat**) tem `enforceAppCheck: false`."

**Isso esta ERRADO.** A funcao `financialAssistantChat` (`functions/src/ai/financialAssistant.ts:65-70`) **NAO declara** `consumeAppCheckToken: true` nem `enforceAppCheck: false`. Sua configuracao e:
```typescript
export const financialAssistantChat = onCall(
  {
    region: REGION,
    secrets: [deepseekApiKey],
    maxInstances: 10,
  },
```

Nenhum campo de App Check. Apenas as 2 funcoes de billing tem App Check configurado. A funcao de IA, que e a mais exposta ao usuario final, nao tem protecao alguma de App Check — nem opcional.

---

## 2. Lacunas nao reportadas pelo auditor

### LACUNA-01: financialAssistantChat sem App Check (nem opcional)

**Severidade:** Media  
**Local:** `functions/src/ai/financialAssistant.ts:65-70`

A funcao `financialAssistantChat` e acessivel por qualquer usuario autenticado (`onCall` sem `consumeAppCheckToken`). As funcoes de billing tem protecao App Check (mesmo que opcional, com `enforceAppCheck: false`), mas a funcao de IA nao tem nenhuma. Isso significa que um token de autenticacao Firebase comprometido pode ser usado para chamar a IA sem restricao adicional de dispositivo.

**Nota:** a funcao faz `verifyWorkspaceMembership` e `checkAiUsageNotExceeded`, entao o abuso e limitado por workspace e rate limit diario (60 chamadas/workspace/dia). Mas nao ha verificacao de que a chamada veio do app legitimo.

---

### LACUNA-02: PII (numero de telefone) em logging sem ofuscacao

**Severidade:** Baixa  
**Local:** `functions/src/whatsapp/webhookHandler.ts:143`, `functions/src/whatsapp/metaClient.ts:53,56`, `functions/src/whatsapp/unlinkWhatsapp.ts:49`

Numeros de telefone sao logados em texto plano em 4 locais:
- `webhookHandler.ts:143` — `logger.info('whatsapp_message_received', { phone, ... })` (INFO level)
- `metaClient.ts:53` — `logger.warn('whatsapp_send_failed', { phoneNumber, ... })` (WARN)
- `metaClient.ts:56` — `logger.warn('whatsapp_send_error', { phoneNumber, ... })` (WARN)
- `unlinkWhatsapp.ts:49` — `logger.warn('whatsapp_unlink_confirmation_failed', { phone, ... })` (WARN)

Telefones sao PII (Lei Geral de Protecao de Dados Pessoais - LGPD, artigo 5, inciso I). No Google Cloud Logging, esses logs sao retidos conforme a configuracao do projeto (tipicamente 30 dias no _Default bucket). Idealmente, os telefones deveriam ser ofuscados (ex.: exibir apenas os 4 ultimos digitos) ou removidos dos logs de producao.

---

### LACUNA-03: sendDueReminders sem verificacao de membro ativo

**Severidade:** Baixa  
**Local:** `functions/src/automation.ts:264-307`

Mesma classe do achado MEDIA-003 (generateRecurrences). `sendDueReminders` busca `collectionGroup('bills')` e envia push para `bill.createdBy` sem verificar se o usuario ainda e membro ativo do workspace. Usuarios removidos continuam recebendo notificacoes de contas de workspaces que nao acessam mais.

---

### LACUNA-04: generateRecurrences — TOCTOU na leitura de `alreadyRecorded`

**Severidade:** Informativa  
**Local:** `functions/src/automation.ts:160-162, 198-207`

O padrao de leitura-fora-da-batch aparece em dois lugares:
1. **Bills** (linhas 158-166): `get()` para verificar `alreadyCreatedBill`, depois `set()` separado.
2. **Transacoes** (linhas 194-247): `get()` para verificar `alreadyRecorded`, depois `batch.commit()`.

Em ambos os casos, o ID e deterministico (`recurringOccurrenceTransactionId`), entao uma segunda execucao apenas sobrescreveria o mesmo documento com dados identicos. O `maxInstances: 1` do scheduler reduz ainda mais o risco. O impacto e limitado a push duplicado (`sendPushToUser` no caso de transacao com valor) e contagem `generated` inflada.

---

### LACUNA-05: generateWhatsappLinkCode — sem rate limit na geracao de codigos

**Severidade:** Baixa  
**Local:** `functions/src/whatsapp/linkAccount.ts:17-64`

A funcao `generateWhatsappLinkCode` (`onCall`, autenticada) gera um codigo de 6 digitos a cada chamada sem rate limit. Um usuario autenticado pode chamar a funcao repetidamente (maxInstances: 5, mas sem limitacao por usuario). Cada chamada:
- Gera um documento em `users/{uid}/whatsappLinkCodes/{code}` com TTL de 10 minutos
- Deleta codigos anteriores do mesmo usuario (cleanup pre-generation)

A limpeza previa de codigos antigos mitiga o acumulo, mas se o `cleanupBatch` falhar (timeout, rede), codigos podem se acumular. A geracao massiva tambem aumenta leituras/escritas no Firestore sem beneficio.

---

## 3. Tabela resumo

| ID | Titulo | Seve. | Class. L2 |
|---|---|---|---|
| FUNCTIONS-CRIT-001 | Webhook WhatsApp sem HMAC | Critica | CONFIRMADO (agravante: secret errado no codigo comentado) |
| FUNCTIONS-CRIT-002 | whatsappPhoneIndex legivel | Critica | CONFIRMADO |
| FUNCTIONS-ALTA-001 | BudgetAlerts race condition | Alta | CONFIRMADO |
| FUNCTIONS-ALTA-002 | createCardPurchase atomicidade | Alta | CONFIRMADO |
| FUNCTIONS-MEDIA-001 | createCategory race condition | Media | CONFIRMADO |
| FUNCTIONS-MEDIA-002 | Webhook sem rate limit | Media | **SUBESTIMADO** (impacto maior que o descrito) |
| FUNCTIONS-MEDIA-003 | generateRecurrences sem member check | Media | CONFIRMADO (tambem se aplica a sendDueReminders) |
| FUNCTIONS-MEDIA-004 | Dados enviados ao DeepSeek | Media | CONFIRMADO (tambem via WhatsApp) |
| FUNCTIONS-BAIXA-001 | emailAdapter stub | Baixa | CONFIRMADO |
| FUNCTIONS-BAIXA-002 | reverseCardPurchase recursao | Baixa | **FALSO-POSITIVO PARCIAL** (codigo TEM filtro workspace) |
| FUNCTIONS-BAIXA-003 | budgetAlerts set sem merge | Baixa | CONFIRMADO |
| FUNCTIONS-BAIXA-004 | billing schema priceCents inutil | Baixa | CONFIRMADO |
| FUNCTIONS-BAIXA-005 | closeInvoices sem workspace check | Baixa | CONFIRMADO (risco menor que o descrito) |
| FUNCTIONS-INFO-001 | invoiceTotals 14 tipos ok | Info | CONFIRMADO |
| FUNCTIONS-INFO-002 | Stripe webhook correto | Info | CONFIRMADO |

| Lacuna | Titulo | Seve. |
|---|---|---|
| LACUNA-01 | financialAssistantChat sem App Check | Media |
| LACUNA-02 | PII em logging sem ofuscacao | Baixa |
| LACUNA-03 | sendDueReminders sem member check | Baixa |
| LACUNA-04 | generateRecurrences TOCTOU | Info |
| LACUNA-05 | generateWhatsappLinkCode sem rate limit | Baixa |

| Observacao | Class. L2 |
|---|---|
| "3 funcoes com consumeAppCheckToken" | **INCORRETA** (sao 2, financialAssistantChat nao tem) |
| "reverseCardPurchase sem filtro workspace" | **INCORRETA** (o filtro existe) |

## 4. Metodologia

Revisao feita por leitura de codigo-fonte de todos os arquivos mencionados no relatorio da Camada 1, mais verificacao cruzada com:
- `functions/src/index.ts` (exports, secrets, configuracoes)
- `firebase.json` (runtime, codebases)
- `functions/src/shared/accountEffects.ts` (sincronia cliente/servidor)
- `functions/src/whatsapp/metaClient.ts` (secrets do WhatsApp)
- `functions/src/ai/deepseekClient.ts` (secrets do DeepSeek)
- `functions/src/whatsapp/pendingAction.ts` (TTL, seguranca)
- `functions/src/whatsapp/linkAccount.ts` (fluxo de vinculacao)
- `functions/src/ai/aiRateLimit.ts` (rate limiting)
- `firestore.rules` (regras de acesso whatsappPhoneIndex)
