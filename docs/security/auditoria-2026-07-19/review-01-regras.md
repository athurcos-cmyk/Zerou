# Revisao da Auditoria — Firestore Rules (Camada 2)

**Revisor:** Camada 2  
**Data:** 2026-07-19  
**Arquivo auditado:** `docs/security/auditoria-2026-07-19/01-regras.md`  
**Fontes verificadas:** `firestore.rules`, `tests/firestore.rules.test.ts`, `tests/storage.rules.test.ts`, `src/finance/financeService.ts`, `src/cards/cardService.ts`, `src/shared/sharedService.ts`, `src/types/contracts.ts`, `firestore.indexes.json`

---

## Resumo

A auditoria da Camada 1 e consistente, bem fundamentada e cobre todos os topicos principais. Nenhum falso-positivo foi encontrado. Porem, o auditor deixou passar **uma lacuna de consistencia de dados de severidade Media** (tipo de transacao mutavel em update) e **uma lacuna de cobertura de testes de severidade Media** (diversos validadores sem teste dedicado). Os dois achados originais (REGRAS-1, REGRAS-2) estao corretos.

---

## Revisao dos achados

### REGRAS-1: Campo `source` em `validTransactionCreate.hasOnly` nunca enviado pelo cliente

**Classificacao: CONFIRMADO**

O campo `source` aparece na lista `hasOnly` da funcao `validTransactionCreate` (firestore.rules:507). Nenhuma funcao do cliente o envia:

- `createTransaction` (financeService.ts:195-218): nao envia `source`.
- `createCardPurchase` (cardService.ts:251-273): nao envia `source`.
- `recordInvoicePayment` (cardService.ts:476-497): nao envia `source`.
- `recordRecurringPayment` (financeService.ts:1081-1088): nao envia `source`.
- `payBill` (financeService.ts:995-1002): nao envia `source`.
- `markReceivableReceived` (financeService.ts:927-934): nao envia `source`.
- `coupleGoalDeposit` / `coupleGoalWithdraw` (financeService.ts:332-352, 394-414): nao enviam `source`.

A interface `Transaction` em `src/types/contracts.ts:212-237` tambem nao possui o campo `source`.

Nao ha risco de seguranca — `hasOnly` e permissivo e a ausencia do campo no payload nao afeta a validacao.

**Veredito do revisor:** Severidade Informativa, confianca 10. Condizente.

---

### REGRAS-2: Campo `reconciledAt` em `validTransactionUpdate.hasOnly` nunca enviado pelo cliente

**Classificacao: CONFIRMADO**

O campo `reconciledAt` aparece na lista `hasOnly` da funcao `validTransactionUpdate` (firestore.rules:565). A interface `Transaction` em `contracts.ts` nao o possui. Nenhuma funcao de update no cliente o envia:

- `updateTransaction` (financeService.ts:530-551): usa `omitUndefined` com campos explicitos — `reconciledAt` nao esta entre eles.
- `softDeleteTransaction` (financeService.ts:508-513): so envia `updatedBy`, `deletedAt`, `updatedAt`, `version`.
- `recordInvoicePayment`, `createCardPurchase`, `payBill`, etc.: sao creates, nao updates.

O teste na linha 1364-1378 do test file confirma que `reconciledAt` e rejeitado em criacao. A regra de update valida opcionalmente que, se presente, seja timestamp (linha 569: `(!request.resource.data.keys().hasAny(['reconciledAt']) || request.resource.data.reconciledAt is timestamp)`).

**Veredito do revisor:** Severidade Informativa, confianca 10. Condizente.

---

## Revisao das secoes do relatorio original

### Secao 1 — IDOR / Isolamento multi-tenant

**Classificacao: CONFIRMADO**

Toda colecao aninhada em `/workspaces/{workspaceId}` usa `isActiveMember(workspaceId)` para leitura e escrita. A funcao verifica:

```javascript
function isActiveMember(workspaceId) {
    return signedIn()
        && exists(currentMemberDoc(workspaceId))
        && get(currentMemberDoc(workspaceId)).data.status == 'active';
}
```

O isolamento e garantido por `workspaceId` no path. Um usuario ativo no workspace A nao tem acesso ao workspace B. Testes confirmam: linha 710-715 (`blocks a user from reading another user workspace`), linha 1118-1133 (`blocks cross-workspace transaction reads`), linha 1628-1665 (`keeps personal financial data private`).

Nao ha IDOR. O catch-all (`match /{document=**}`) no workspace bloqueia qualquer subcolecao futura nao mapeada com `allow write: if false`.

**Observacao adicional:** O unico ponto onde `isActiveMember` NAO e usado para leitura e a colecao raiz `privacyRequests` (linha 1764-1768), que usa `canReadPrivacyRequest` (proprio uid). Isso e intencional — `privacyRequests` nao esta dentro de workspace. Nao ha risco de vazamento.

---

### Secao 2 — Sincronia enum/campo

**Classificacao: CONFIRMADO**

#### 2.1 InvoiceLedgerEntryType (14 valores)

Os tres pontos de sincronia estao em sincronia:

1. **Enum TypeScript** (`src/types/contracts.ts`): `InvoiceLedgerEntryType` com 14 valores.
2. **Regra Firestore** (`validInvoiceLedgerEntryType`, firestore.rules:311-328): lista com 14 valores identicos.
3. **Cloud Function** (`invoiceTotalsDeltaForEntry` em `functions/src/cards/invoiceTotals.ts`): 14 casos no switch, cada um bucketizando no total correto.

Auditoria manual confirmada. A sincronia foi auditada em 2026-07-19 conforme documentado no CLAUDE.md.

#### 2.2 validTransactionCreate — campos

Payload real do `createTransaction` vs `hasOnly` da regra: todos os campos enviados pelo cliente estao listados. O campo `source` em `hasOnly` nunca enviado (REGRAS-1, ja coberto).

#### 2.3 validAccountCreate — campos

A funcao `createAccount` (financeService.ts:119-130) envia:
```
id, workspaceId, name, type, openingBalanceCents, currentBalanceCents, isActive, createdBy, createdAt, updatedAt
```

O `hasOnly` da regra tambem lista `isPrimary`, que o cliente nunca envia no create (e opcional, definido via `setPrimaryAccount`/`updateDoc` separado). Correto.

#### 2.4 validCategoryCreate — campos

A funcao `createCategory` (financeService.ts:232-244) envia:
```
id, workspaceId, name, icon, color, type, isDefault, isActive, createdBy, createdAt, updatedAt
```

O `hasOnly` tambem lista `parentCategoryId`, que e opcional e nunca enviado pelo cliente. Correto.

#### 2.5 validBillCreate / validReceivableCreate — campos

`createBill` (financeService.ts:565-577) envia:
```
id, workspaceId, description, amountCents, dueDate, status, categoryId, accountId, createdBy, createdAt, updatedAt
```

O `hasOnly` de `validBillCreate` tambem lista `recurringId` — este e opcional e enviado em outros fluxos (recorrencias), nao no `createBill` inicial. Correto.

`createReceivable` (financeService.ts:871-883) envia:
```
id, workspaceId, description, amountCents, fromWho, dueDate, status, accountId, createdBy, createdAt, updatedAt
```

O `hasOnly` de `validReceivableCreate` corresponde exatamente. Correto.

#### 2.6 Demais colecoes

Verificado nos sources: `createRecurringRule`, `createGoal`, `createBudget`, `createCard`, `createInvoice`, `createLedgerEntry`, `createSharedExpenseClaim`, `createSettlement`. Todos os payloads reais do cliente estao dentro dos respectivos `hasOnly`. Nenhuma discrepancia.

---

### Secao 3 — Vazamento pessoal <-> casal

**Classificacao: CONFIRMADO**

O isolamento e garantido por design de colecao:
- Dados pessoais: `workspaces/personal_{uid}/...` — so o dono acessa via `isActiveMember`.
- Dados do casal: `workspaces/couple_*/...` — os dois membros ativos acessam.

`coupleGoalDeposit` / `coupleGoalWithdraw` criam transacoes no workspace pessoal (`personalWorkspaceId`) com `isActiveMember(personalWorkspaceId)`, acesso exclusivo do dono.

Teste na linha 1628-1665 confirma que Bob (partner no `couple_a`) nao le `workspaceA/accounts/accountPrivate`.

`sharedExpenseClaims` exige `sourceVisibility == 'summary_only'`, bloqueando `sourcePersonalTransactionId`. Testado na linha 1667-1699.

**Veredito:** Correto.

---

### Secao 4 — Escaladas / hasOnly / hasAny

**Classificacao: CONFIRMADO**

Campos protegidos (`createdBy`, `createdAt`, `workspaceId`, `version`) sao imutaveis em todas as colecoes. A analise do auditor cobre todas as funcoes validadoras de update.

**Observacao adicional:** Em `validCategoryUpdate`, diferentemente de `validAccountUpdate` e outros, nao ha `request.resource.data.createdBy == resource.data.createdBy` explicito. Mas `createdBy` nao esta na lista `affectedKeys().hasOnly([...])`, entao qualquer tentativa de altera-lo via updateDoc e rejeitada. O risco teorico seria um `setDoc` completo reenviando `createdBy` com o mesmo valor — a funcao `updateCategory` nao faz isso (usa `updateDoc` parcial). Risco minimo, documentado na secao de Lacunas abaixo.

---

### Secao 5 — Catch-all

**Classificacao: CONFIRMADO**

`match /workspaces/{workspaceId}/{document=**}` (linha 1722-1725):
- `allow read: if isActiveMember(workspaceId)` — seguro.
- `allow write: if false` — seguro.

Nao ha catch-all no nivel raiz do banco (`/databases/{database}/documents`). Colecoes raiz nao mapeadas sao negadas por padrao.

---

### Secao 6 — Storage Rules

**Classificacao: CONFIRMADO**

Tudo negado (`allow read, write: if false`). Teste em `tests/storage.rules.test.ts` confirma.

---

### Secao 7 — Receivables

**Classificacao: CONFIRMADO**

Colecao `/workspaces/{workspaceId}/receivables/{receivableId}` implementada em `firestore.rules` (linha 1645-1650) com validadores `validReceivableCreate` / `validReceivableUpdate`. Campos corretos (usa `fromWho` em vez de `categoryId`). Testes na linha 1405-1431 cobrem criacao, update, campos contrabandeados e status invalido.

---

### Secao 8 — WhatsApp

**Classificacao: CONFIRMADO**

Tres colecoes de WhatsApp verificadas:
- `/users/{uid}/whatsappLinkCodes/{code}`: `read` so o dono, `write` bloqueado (Admin SDK).
- `/whatsappPhoneIndex/{phone}`: `read` qualquer autenticado, `write` bloqueado.
- `/whatsappPendingActions/{phone}`: `read, write` bloqueados.

Correto. Nao ha risco de um cliente escrever dados falsos no indice telefonico ou plantar codigos de link falsos.

---

### Secao 9 — Auditoria adicional

**Classificacao: CONFIRMADO**

#### 9.1 Deletabilidade — OK.
#### 9.2 Criacao atomica de workspace de casal — OK.
#### 9.3 Cloud Function de totais de fatura — OK (Admin SDK, fora do escopo das rules).
#### 9.4 Billing — OK.

---

## Lacunas — o que o auditor DEVERIA ter encontrado e nao encontrou

### LACUNA-1: `transaction.type` mutavel em updates (consistencia de dados)

**Severidade: MEDIA**  
**Local:** `firestore.rules:543-567` (`validTransactionUpdate`)

**Descricao:** A funcao `validTransactionUpdate` nao verifica que `request.resource.data.type == resource.data.type`. A lista `affectedKeys().hasOnly([...])` (linha 543-567) inclui `type` como campo alteravel, e nao ha nenhuma clausula adicional que impeça a mudanca.

Um usuario (ou bug no cliente) pode:
- Criar uma transacao `card_purchase` e depois altera-la para `expense` (adicionando `accountId` via update).
- Criar uma transacao `expense` e depois altera-la para `card_purchase` (adicionando `cardId`/`invoiceId` e removendo `accountId`).
- Criar uma transacao `expense` e depois altera-la para `transfer` (adicionando `destinationAccountId`).

**Impacto:** A consistencia dos ledger entries de fatura de cartao nao e quebrada — os ledger entries sao imutaveis (linha 1695: `allow update: if false`) e guardam o `sourceTransactionId`. Porem, a exibicao na UI pode ficar inconsistente: uma transacao que era `card_purchase` e virou `expense` aparece no extrato como uma despesa comum, mas o ledger da fatura ainda referencia aquela transacao como `purchase`. O cliente `useCardsData.ts` pode ou nao limpar essa referencia orfa.

**Por que o auditor perdeu:** O auditor focou em sincronia de payload vs rules (campos, enums, imutabilidade de `createdBy`/`createdAt`/`workspaceId`), mas nao verificou se tipos de transacao deveriam ser imutaveis apos criacao. Assume-se que o `TransactionType` seria imutavel, mas as regras nao impoem isso.

**Solucao sugerida:** Adicionar `request.resource.data.type == resource.data.type` em `validTransactionUpdate`. Se a mudanca de tipo for necessaria para alguma feature futura, criar um fluxo separado (ex.: excluir a original e criar uma nova).

---

### LACUNA-2: Ausencia de testes automatizados para varios validadores

**Severidade: MEDIA**  
**Local:** `tests/firestore.rules.test.ts`

**Descricao:** Diversas funcoes validadoras das regras nao tem testes dedicados que exerçam especificamente seus caminhos. Testes indiretos (via batch que toca multiplas colecoes) existem para alguns, mas nao cobrem todas as permutacoes:

| Validador | Teste dedicado? | Cobertura |
|---|---|---|
| `validRecurringCreate` | NAO | Nenhum |
| `validRecurringUpdate` | NAO | Nenhum |
| `validAuditLogCreate` | NAO | Nenhum (nem a regex `DUO-`) |
| `validSharedExpenseClaimUpdate` | NAO | Nenhum (so create) |
| `validSettlementUpdate` | NAO | Parcial (teste de progressao, linha 1702) |
| `validInvoiceCreate` | NAO | Indireto (via batch de compra) |
| `validCardCreate` | NAO | Indireto (via setDoc) |
| `validTransactionAccounts` (transfer) | NAO | Nenhum |
| `validBillUpdate` (alem de status) | NAO | So status |
| `validCoupleMemberUpdate` | NAO | Nenhum |
| `validCoupleWorkspaceRefCreate/Update` | NAO | Nenhum |
| Delete operations (alem de account) | NAO | So account |

**Impacto:** Embora a auditoria manual tenha confirmado que os payloads atuais sao compativeis com as regras, a falta de testes automatizados significa que uma mudanca futura — seja no cliente (novo campo no payload) ou na regra (restricao mais forte) — pode quebrar silenciosamente. Os dois incidentes historicos do projeto (`createdBy`, `installment_anticipation_credit`) demonstram que esse padrao de erro tem alto custo.

O CLAUDE.md ja exige sincronia de enum em tres pontos + `npm run test:rules`, mas o teste so pega o que esta explicitamente testado. Validadores sem teste sao pontos cegos.

**Por que o auditor perdeu:** O auditor executou `npm run test:rules` (55 passam) e fez a comparacao manual de cada payload vs regra, mas nao avaliou a cobertura dos testes em si — ou seja, se cada validador tem um teste que o exercita.

**Solucao sugerida:** Adicionar testes para os validadores listados acima. Prioridade: `validAuditLogCreate` (canal de auditoria, regex `DUO-`), `validRecurringCreate/Update` (recorrencias mexem com dinheiro), e `transfer` (logica de duas contas).

---

### LACUNA-3: `validCategoryUpdate` sem verificacao explicita de `createdBy`

**Severidade: INFORMATIVA**  
**Local:** `firestore.rules:419-440` (`validCategoryUpdate`)

**Descricao:** Diferente de `validAccountUpdate` (linha 374: `request.resource.data.createdBy == resource.data.createdBy`), a funcao `validCategoryUpdate` nao possui essa verificacao. O campo `createdBy` nao esta em `affectedKeys().hasOnly([...])`, entao nao pode ser alterado via `updateDoc`. Porem, um `setDoc` completo (nao usado por `updateCategory`, mas possivel tecnicamente) que reenviasse `createdBy` com o mesmo valor do documento existente nao seria rejeitado — `affectedKeys()` nao incluiria `createdBy` (pois o valor nao mudou), e a ausencia da clausula `== resource.data.createdBy` permitiria a operacao.

**Impacto:** Nenhum no momento. A funcao `updateCategory` usa `updateDoc` parcial (linha 253-258) que nao reenvia `createdBy`. Se no futuro alguem criar um "createOrUpdateCategory" com `setDoc`, o `createdBy` poderia ser "reescrito" sem ser alterado — o que e inofensivo, mas inconsistente com o padrao de seguranca do restante do codigo.

**Por que o auditor perdeu:** O auditor verificou que `createdBy` nao pode ser alterado via update (por `hasOnly`), mas nao notou a ausencia da clausula de igualdade explicita que outros validadores tem.

**Solucao sugerida:** Adicionar `request.resource.data.createdBy == resource.data.createdBy` em `validCategoryUpdate` para consistencia com `validAccountUpdate`, `validBillUpdate`, `validGoalUpdate`, etc.

---

### LACUNA-4: `privacyRequests` — canal com texto livre sem vinculacao a workspace

**Severidade: INFORMATIVA**  
**Local:** `firestore.rules:1764-1768`

**Descricao:** A colecao raiz `privacyRequests` permite que qualquer usuario autenticado crie uma solicitacao com campo `notes` de ate 1000 chars (texto livre). O campo `type` aceita `'correction' | 'export' | 'deletion' | 'marketing_revocation' | 'cache_help'`. O email informado nao e verificado contra o Auth (`request.auth.token.email`). A regra `validPrivacyRequestCreate` (linha 1087-1112) valida a estrutura, mas nao ha restricao de rate-limit ou conteudo.

**Impacto:** Nenhum no momento. E um canal legitimo de suporte. Porem, sem rate-limit ou validacao de email, um usuario malicioso poderia:
- Criar milhares de solicitacoes de privacidade (ataque de spam no banco).
- Fornecer um email que nao e o dele, gerando confusao no atendimento.
- Incluir conteudo ofensivo no `notes`.

Isso nao fere o sigilo financeiro de outros usuarios (cada um so ve as proprias solicitacoes), mas e um ponto de abuso operacional.

**Por que o auditor perdeu:** O auditor listou `privacyRequests` como verificado, mas nao avaliou o risco operacional de ser um canal de texto livre aberto.

**Solucao sugerida:** Validar `email == request.auth.token.email` e/ou adicionar rate-limit (ex.: no maximo 3 solicitacoes por dia por usuario). Se houver Cloud Function de notificacao, pode ser necessario tambem.

---

## Quadro geral

| ID | Titulo | Severidade Original | Severidade Revisada | Status |
|---|---|---|---|---|
| REGRAS-1 | Campo `source` em `validTransactionCreate` | Informativa | Informativa | **CONFIRMADO** |
| REGRAS-2 | Campo `reconciledAt` em `validTransactionUpdate` | Informativa | Informativa | **CONFIRMADO** |
| LACUNA-1 | `transaction.type` mutavel em updates | — | Media | **NOVO** |
| LACUNA-2 | Ausencia de testes para varios validadores | — | Media | **NOVO** |
| LACUNA-3 | `validCategoryUpdate` sem `createdBy == resource.data.createdBy` | — | Informativa | **NOVO** |
| LACUNA-4 | `privacyRequests` — texto livre sem rate-limit | — | Informativa | **NOVO** |

---

## Conclusao

A auditoria da Camada 1 e de boa qualidade: cobre todos os topicos principais, as comparacoes de payload vs regra sao precisas, e os dois achados (REGRAS-1, REGRAS-2) estao corretos e bem documentados.

A estrutura de seguranca do Zerou permanece solida, com as seguintes virtudes confirmadas:

1. **Isolamento multi-tenant robusto** — `isActiveMember` em toda colecao aninhada.
2. **Campos sensiveis protegidos** — `createdBy`, `createdAt`, `workspaceId`, `version` sao imutaveis ou controlados.
3. **Ledger entries imutaveis** — `allow update: if false` no ledger, goalContributions e auditLogs.
4. **Sincronia enum nos tres pontos** — 14 valores de `InvoiceLedgerEntryType` em sincronia (TS, rules, Cloud Function).
5. **WhatsApp bloqueado para client** — todas as colecoes de WhatsApp com write bloqueado.
6. **Isolamento pessoal vs casal** — `sharedExpenseClaims` com `sourceVisibility: 'summary_only'` e transacoes do cofrinho no workspace pessoal.

As lacunas encontradas sao de severidade Media (consistencia de dados e cobertura de testes) ou Informativa — nenhuma permite escalada de privilegio, vazamento de dados entre workspaces, ou acesso nao autorizado a informacao financeira.

A recomendacao prioritaria e corrigir a LACUNA-2 (adicionar testes para os validadores sem cobertura) e a LACUNA-1 (tornar `type` imutavel em `validTransactionUpdate`), nesta ordem. A LACUNA-4 (rate-limit em privacyRequests) pode ser enderecada quando o volume de uso justificar.
