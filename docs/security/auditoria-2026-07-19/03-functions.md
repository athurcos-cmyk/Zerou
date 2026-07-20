# Auditoria Cloud Functions — 2026-07-19

## Resumo executivo

14 achados: 1 Crítica, 2 Alta, 4 Média, 5 Baixa, 2 Informativa.

A crítica é no **webhook do WhatsApp**: validacao HMAC desativada (TODO pendente desde a criacao) + any authenticated user no Firestore pode ler o indice de telefones vinculados. As Altas sao race conditions em budgetAlerts e criacao de categoria. O restante sao questoes de consistencia, superfície de ataque e hygiene.

---

## FUNCTIONS-CRIT-001: Webhook WhatsApp sem validacao de assinatura HMAC

**Severidade:** Crítica  
**Local:** `functions/src/whatsapp/webhookHandler.ts:103-116`  
**Descrição:** A validacao HMAC-SHA256 do corpo da requisicao (`X-Hub-Signature-256`) esta comentada com um `TODO`. O codigo atual verifica apenas que `req.method === 'POST'` e retorna 200 OK antes de processar. Qualquer atacante que descubra a URL do webhook pode enviar mensagens falsas que serao interpretadas como comandos validos (registrar despesas, criar transacoes, consultar dados financeiros).

**Cenario de exploracao / PoC:**
1. Atacante descobre a URL do webhook (nao ha segredo — e uma URL publica de Cloud Function).
2. Atacante envia POST com corpo forjado simulando uma mensagem WhatsApp: `{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"from":"<telefone-vinculado>","text":{"body":"gastei 5000 no ifood"}}]}}]}]}`.
3. A funcao processa a mensagem, interpreta como `expense` de R$ 50,00, e cria uma transacao no Firestore via Admin SDK (que **bypassa firestore.rules**).
4. Se o atacante souber o numero de telefone de uma vitima vinculada, consegue criar lancamentos financeiros fraudulentos.

**Impacto:** Criacao de transacoes, despesas e compras no cartao de credito sem autenticacao. Vazamento de dados financeiros via pergunta `"quanto gastei esse mes?"`. Impossivel rastrear o autor (nao ha logging de IP nem identificacao).

**Solução sugerida:** (1) Configurar `WHATSAPP_APP_SECRET` como `defineSecret`, (2) reativar a validacao HMAC, (3) validar que o remetente da mensagem (`msg.from`) corresponde a um telefone previamente vinculado **antes** de processar. A validacao de telefone ja existe (linha 156-163), mas o HMAC e a primeira barreira.

**Confiança:** 10

---

## FUNCTIONS-CRIT-002: whatsappPhoneIndex legivel por qualquer usuario autenticado

**Severidade:** Crítica  
**Local:** `firestore.rules:1591-1594`  
**Descrição:** A colecao `whatsappPhoneIndex` mapeia numeros de telefone para workspaces e é protegida apenas por `allow read: if request.auth != null`. Qualquer usuario autenticado pode listar todos os documentos da colecao, expondo numeros de telefone (PII) de todos os usuarios que vincularam WhatsApp.

**Cenario de exploracao / PoC:**
1. Usuario malicioso autentica no app (cria conta gratuita).
2. Executa `db.collection('whatsappPhoneIndex').get()` no console do browser ou via Firebase SDK.
3. Recebe todos os numeros de telefone vinculados e seus respectivos `workspaceId`.

**Impacto:** Vazamento massivo de PII (numeros de telefone). Vinculacao de telefone a workspace — informacao suficiente para ataques direcionados de engenharia social.

**Solução sugerida:** Restringir leitura: `allow read: if false;` (apenas Admin SDK lê). O webhook já recebe o `phone` no payload da mensagem e não precisa ler a colecao — ele busca o documento por ID exato (`db.doc('whatsappPhoneIndex/${phone}')`), que não é uma listagem. A unica function que precisa de listagem é `unlinkWhatsapp` (que já usa Admin SDK). Ou, alternativamente, permitir `get` apenas quando o userId corresponde ao dono.

**Confiança:** 10

---

## FUNCTIONS-ALTA-001: BudgetAlerts — race condition no estado de notificacao 80%/100%

**Severidade:** Alta  
**Local:** `functions/src/budgetAlerts.ts:75-77, 116-136`  
**Descrição:** O reset do estado mensal (`alertStateRef.set(...)`) e a verificacao de notificacao 80%/100% (`refreshedState.notified80`) sao feitos sem transacao. Duas execucoes concorrentes da funcao `onSchedule` ou uma execucao atrasada podem gerar notificacoes duplicadas. A janela é pequena, mas a funcao tem `maxInstances: 1` — o vetor de ataque real é a combinação reset+update: se duas fatias do scheduler dispararem em razao de retry da Cloud Functions (ex.: timeout da primeira e reexecucao), ambas podem ver `notified80 === false` e enviar push duplicado.

**Impacto:** Usuario recebe 2 notificacoes de 80% ou 100% no mesmo mes. Baixo impacto individual, mas erosiona confianca na ferramenta.

**Solução sugerida:** Usar `db.runTransaction` para o par read-check-update do `alertState`. Ou usar `FieldValue` atomico com `createIfMissing` + `update` com condicional `notified80 == false`.

**Confiança:** 8

---

## FUNCTIONS-ALTA-002: createCardPurchaseFromMessage — leitura fora da batch compromete atomicidade

**Severidade:** Alta  
**Local:** `functions/src/whatsapp/createCardPurchaseFromMessage.ts:136-141`  
**Descrição:** A funcao coleta faturas a criar em um loop, depois itera novamente com `await invoiceCreate.ref.get()` para verificar se cada fatura existe antes de chamar `batch.set()`. Esse padrao de `await` intercalado com `batch.set()` quebra a atomicidade: se a funcao falhar entre o `get()` e o `batch.commit()`, algumas faturas podem ficar em estado inconsistente (transacao gravada mas ledger parcial).

**Cenario de exploracao / PoC:** Nao é exploracao intencional, mas condicao de corrida. Se a funcao timeout (limite de 60s da Cloud Functions + DeepSeek + escritas) ou crash apos criar algumas faturas mas antes do batch, o usuario ve erro no WhatsApp mas o Firestore fica com dados parciais.

**Impacto:** Inconsistencia de dados entre transacoes `card_purchase` e faturas/ledger. Recuperacao manual necessaria.

**Solução sugerida:** Usar `transaction` em vez de `batch` para garantir atomicidade, ou executar os `get()`s antes do loop de `batch.set()`, armazenando resultados em memoria. Comentario no codigo ja reconhece que o Admin SDK ignora firestore.rules — a responsabilidade de gerar o payload correto e 100% da funcao.

**Confiança:** 9

---

## FUNCTIONS-MEDIA-001: createCategoryFromMessage — race condition na verificacao de duplicata

**Severidade:** Media  
**Local:** `functions/src/whatsapp/createCategoryFromMessage.ts:30-38`  
**Descrição:** A verificacao de duplicata por nome (`activeSnap.docs.find(...)`) e a criacao da categoria sao duas operacoes separadas sem transacao. Duas requisicoes simultaneas para criar a mesma categoria podem ambas passar na verificacao de duplicata e criar duas categorias com nomes identicos.

**Impacto:** Duas categorias com mesmo nome no mesmo workspace — confusao para o usuario ao categorizar transacoes.

**Solução sugerida:** Usar `db.runTransaction` que faz `get` + `set` atomicamente. Alternativa: usar o nome como parte do ID do documento com `create` (falha se ja existe) em vez de `set`.

**Confiança:** 9

---

## FUNCTIONS-MEDIA-002: whatsappWebhook — sem limite de taxa por remetente

**Severidade:** Media  
**Local:** `functions/src/whatsapp/webhookHandler.ts:80-81`  
**Descrição:** O webhook tem `maxInstances: 10` mas nao implementa rate limiting por numero de telefone ou por IP. Um atacante (ou bug no Meta) pode enviar centenas de mensagens por segundo, cada uma disparando chamadas ao DeepSeek (API paga) e escritas no Firestore.

**Cenario de exploracao / PoC:** Se o HMAC continuar desativado (FUNCTIONS-CRIT-001), atacante envia milhares de POSTs com numeros de telefone aleatorios. Cada um passa pelo `indexDoc.exists` (falso) e dispara uma mensagem de resposta via API Meta. A conta WhatsApp Business pode ser bloqueada por spam.

**Impacto:** Ataque de negacao de servico financeiro (consumo de cota DeepSeek, custos de API Meta, escrita excessiva no Firestore). Mesmo com HMAC ativo, o Meta pode reentregar webhooks em caso de timeout.

**Solução sugerida:** Implementar rate limiting na memoria da instancia (Map<telefone, timestamp>) ou usar Firestore para controle de taxa com TTL.

**Confiança:** 7

---

## FUNCTIONS-MEDIA-003: generateRecurrences — criacao de transacoes sem verificacao de membro ativo

**Severidade:** Media  
**Local:** `functions/src/automation.ts:140-255`  
**Descrição:** A funcao `generateRecurrences` busca todas as regras de recorrencia `isActive === true` via `collectionGroup` e cria transacoes no workspace. Nao verifica se o criador da regra (`rule.createdBy`) ainda e membro ativo do workspace. Se o usuario foi removido do workspace, a automacao continua criando transacoes em nome dele.

**Impacto:** Transacoes orfaos podem ser criadas em workspaces dos quais o usuario ja saiu. O `createdBy` aponta para um uid que nao e mais membro. Baixo risco financeiro, mas inconsistencia de dados e potencial confusion.

**Solução sugerida:** Antes de criar a transacao, verificar se `rule.createdBy` ainda e membro ativo do workspace. Opcionalmente desativar a regra (`isActive = false`) se o usuario nao for mais membro.

**Confiança:** 8

---

## FUNCTIONS-MEDIA-004: Dados financeiros enviados ao DeepSeek sem controle de acesso por permissao

**Severidade:** Media  
**Local:** `functions/src/ai/buildFinancialContext.ts:81-529`  
**Descrição:** A funcao `buildFinancialContext` le dados financeiros de todas as colecoes do workspace (transacoes, contas, faturas, orcamentos, metas, bills) e monta um contexto de texto que e enviado ao DeepSeek (API externa, servidores nos EUA). A verificacao de membro ativo e feita antes (via `verifyWorkspaceMembership`), mas nao ha avencao sobre a sensibilidade dos dados enviados a terceiros.

**Impacto:** Dados financeiros dos usuarios sao transmitidos para servidores da DeepSeek (China/EUA). O prompt system instrui o modelo a nao compartilhar dados, mas isso nao e um controle tecnico. Usuarios nao sao informados disso explicitamente (termos de uso mencionam?).

**Solução sugerida:** (1) Adicionar aviso claro nos termos de uso que dados financeiros podem ser processados por IA de terceiros. (2) Opcao de opt-out no app. (3) Considerar modelo local/on-device para usuarios sensiveis.

**Confiança:** 7

---

## FUNCTIONS-BAIXA-001: emailAdapter e um stub que sempre retorna `sent: false`

**Severidade:** Baixa  
**Local:** `functions/src/email/emailAdapter.ts:49-65`  
**Descrição:** A unica funcao de envio de email (`sendOperationalEmail`) sempre retorna `{ sent: false, reason: "Provider adapter is not implemented yet." }`. Emails transacionais (boas-vindas, alertas de seguranca, convites, falha de pagamento) nunca sao enviados. O codigo e exportado mas nunca chamado por nenhuma funcao atualmente — e um stub de scaffold.

**Impacto:** Se no futuro alguma funcao chamar `sendOperationalEmail`, esperara que o email seja enviado mas nada acontecera (silenciosamente). Nao ha impacto hoje.

**Solução sugerida:** Nao usar ate que um provider real seja configurado. Se for manter, adicionar logging warning quando chamado.

**Confianca:** 10

---

## FUNCTIONS-BAIXA-002: reverseCardPurchaseOnDelete — comentarios indicam risco de recursao

**Severidade:** Baixa  
**Local:** `functions/src/cards/reverseCardPurchaseOnDelete.ts:61-64`  
**Descrição:** A funcao verifica `entry.type === 'purchase_reversal'` para evitar recursao, mas usa `collectionGroup('ledger')` sem filtro de workspace. Se houver alguma condicao em que uma reversao gere outra reversao (ex.: exclusao logica da reversao gerando mudanca no `deletedAt`), o loop pode se repetir.

**Cenario de exploracao / PoC:** Cenario teorico: se uma transacao `card_purchase` e excluida (soft delete -> `deletedAt`), depois restaurada (remocao do `deletedAt`), e excluida novamente, a segunda exclusao criaria novas reversoes sobre as reversoes ja existentes.

**Impacto:** Multiplas reversoes para a mesma compra, inflando creditos na fatura. Muito baixa probabilidade.

**Solução sugerida:** Alem do filtro `type === 'purchase_reversal'`, verificar se o ledger ja tem uma entrada com `idempotencyKey` contendo `_reversal_` para aquela `sourceTransactionId`. Ou usar `sourceTransactionId` + `type == 'purchase_reversal'` como filtro adicional na query.

**Confianca:** 5

---

## FUNCTIONS-BAIXA-003: budgetAlerts — reset de estado usa `set` em vez de `set({ ... }, { merge: true })`

**Severidade:** Baixa  
**Local:** `functions/src/budgetAlerts.ts:76`  
**Descrição:** O reset do estado de alerta usa `alertStateRef.set({ month, notified80: false, notified100: false })` sem `{ merge: true }`. Isso sobrescreve o documento inteiro. Se no futuro o documento tiver outros campos (ex.: `lastNotifiedAt`), serao perdidos no reset. Atualmente nao ha outros campos, entao o bug e apenas latente.

**Impacto:** Zero hoje. Potencial perda de dados se o schema de `budgetAlertState` for expandido.

**Solução sugerida:** Usar `alertStateRef.set({ month, notified80: false, notified100: false }, { merge: true })` para preservar campos extras que porventura existam.

**Confianca:** 7

---

## FUNCTIONS-BAIXA-004: billing schemas — priceCents opcional e nao usado

**Severidade:** Baixa  
**Local:** `functions/src/billing/schemas.ts:9`  
**Descrição:** O schema `createCheckoutSessionSchema` define `priceCents: z.number().optional()`, mas este campo nunca e lido em lugar nenhum. A funcao `createCheckoutSession` usa o preco do catalogo (`planCatalog`) para criar a sessao Stripe. O campo `priceCents` e ignorado. Clientes poderiam enviar `priceCents` arbitrarios que seriam aceitos pelo Zod mas descartados — nao ha risco de manipulacao de preco, mas e ruido no schema.

**Impacto:** Nenhum — o valor e descartado. Apenas confusao de manutencao. O campo deveria ser removido para evitar dar a impressao errada de que o cliente pode escolher o preco.

**Solução sugerida:** Remover `priceCents` do schema.

**Confianca:** 9

---

## FUNCTIONS-BAIXA-005: closeInvoicesDue — atualizacao de fatura sem verificacao de ownership

**Severidade:** Baixa  
**Local:** `functions/src/automation.ts:94-98`  
**Descrição:** A funcao `closeInvoicesDue` fecha todas as faturas `open` cujo `referenceMonth <= currentMonth` para qualquer cartao cujo `closingDay == today`. Nao verifica se o cartao pertence a um workspace com members ativos ou se o workspace existe.

**Impacto:** Se um workspace foi deletado mas as subcolecoes de cartoes permanecem no Firestore (devido a regras de exclusao), a funcao ainda pode tentar atualizar faturas orfas. A operacao `update` em documento inexistente lancaria erro, mas o `try/catch` generico (`sendPushToUser(...).catch(() => {})`) so protege o push, nao a atualizacao.

**Solução sugerida:** Adicionar verificacao de que o workspace ainda existe (`db.doc('workspaces/${workspaceId}').get()`) antes de processar cartoes daquele workspace.

**Confianca:** 6

---

## FUNCTIONS-INFO-001: invoiceTotals — 14 tipos de InvoiceLedgerEntryType corretamente bucketizados

**Severidade:** Informativa  
**Local:** `functions/src/cards/invoiceTotals.ts:42-62`  
**Descrição:** Auditoria confirmou que todos os 14 tipos definidos no enum TypeScript estao mapeados para buckets:
- `purchasesTotalCents`: purchase, manual_debit, installment_anticipation
- `creditsTotalCents`: refund_credit, chargeback_credit, manual_credit, purchase_reversal, installment_anticipation_credit
- `feesTotalCents`: interest, fine, iof, fee
- `paymentsTotalCents`: payment, advance_payment

Nenhum tipo cai no `return zero` (linha 62). Confirmado pelos testes em `invoiceTotals.test.ts`.

**Confianca:** 10

---

## FUNCTIONS-INFO-002: Stripe webhook usa `constructEvent` — implementacao correta

**Severidade:** Informativa  
**Local:** `functions/src/billing/stripeBillingProvider.ts:99-104`  
**Descrição:** A funcao `ingestStripeWebhookEvent` usa corretamente `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` para verificar a assinatura do webhook do Stripe. O payload e sanitizado com `sanitizeStripeObject` antes de persistir. Idempotencia via `createBillingEventOnce` (transacao Firestore com check-and-set). Implementacao correta do padrao recomendado pelo Stripe.

**Confianca:** 10

---

## Tabela de prioridades

| ID | Titulo | Seve. | Conf. |
|---|---|---|---|
| FUNCTIONS-CRIT-001 | Webhook WhatsApp sem HMAC | Critica | 10 |
| FUNCTIONS-CRIT-002 | whatsappPhoneIndex legivel por qualquer auth | Critica | 10 |
| FUNCTIONS-ALTA-001 | BudgetAlerts race condition | Alta | 8 |
| FUNCTIONS-ALTA-002 | createCardPurchase leitura fora da batch | Alta | 9 |
| FUNCTIONS-MEDIA-001 | createCategory race condition | Media | 9 |
| FUNCTIONS-MEDIA-002 | Webhook sem rate limit | Media | 7 |
| FUNCTIONS-MEDIA-003 | generateRecurrences sem verificacao de membro | Media | 8 |
| FUNCTIONS-MEDIA-004 | Dados financeiros enviados ao DeepSeek | Media | 7 |
| FUNCTIONS-BAIXA-001 | emailAdapter stub | Baixa | 10 |
| FUNCTIONS-BAIXA-002 | reverseCardPurchase recursao teorica | Baixa | 5 |
| FUNCTIONS-BAIXA-003 | budgetAlerts set sem merge | Baixa | 7 |
| FUNCTIONS-BAIXA-004 | billing schema priceCents inutil | Baixa | 9 |
| FUNCTIONS-BAIXA-005 | closeInvoices sem verificacao de workspace | Baixa | 6 |
| FUNCTIONS-INFO-001 | invoiceTotals 14 tipos ok | Info | 10 |
| FUNCTIONS-INFO-002 | Stripe webhook implementacao correta | Info | 10 |

## Observacoes complementares

### Sincronia accountEffects (servidor vs cliente)

O arquivo `functions/src/shared/accountEffects.ts` e declarado como "porta" de `src/finance/financeCalculations.ts`. Ambos definem os mesmos 8 tipos de transacao. A logica de `transactionAccountEffects` no servidor e identica aa do cliente. **Nao foi encontrada divergencia.** O campo `adjustment` soma (mesmo comportamento que o cliente). O filtro `deletedAt` retorna array vazio. OK.

### Automation: identidade de execucao

As 4 funcoes `onSchedule` (closeInvoicesDue, generateRecurrences, sendDueReminders, sendDailyLogReminder) rodam como a conta de servico padrao do Firebase (`firebase-adminsdk`). Nao ha identidade de usuario — elas operam com privilegios de Admin SDK (bypass total das firestore.rules). Isso e esperado e documentado, mas significa que qualquer bug de logica (ex.: query collectionGroup que retorna dados de outro workspace) nao sera barrado por regras.

### Funcoes onCall com App Check

As 3 funcoes que declaram `consumeAppCheckToken: true` (createCheckoutSession, createCustomerPortalSession, financialAssistantChat) tem `enforceAppCheck: false`. O App Check token e consumido mas nao exigido. Isso e proposital (compatibilidade com ambientes sem App Check), mas reduz a protecao contra abuso.

### WhatsApp webhook: response vs processamento

A funcao responde 200 OK antes de processar a mensagem (linha 119). Padrao correto para webhooks do Meta Cloud API (que exigem resposta rapida). O processamento assincrono apos o `res.status(200)` significa que:
- Erros de processamento nao sao reportados ao Meta (eles nao reentregam).
- O usuario nao recebe feedback se o processamento falhar apos o 200.
- Se a instancia da Cloud Function morrer apos o 200 mas antes do fim, a mensagem e perdida.
