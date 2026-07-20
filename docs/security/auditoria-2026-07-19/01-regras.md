# Auditoria de Segurança — Firestore Rules / Storage Rules

**Data:** 2026-07-19  
**Escopo:** `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `tests/firestore.rules.test.ts`, `tests/storage.rules.test.ts`  
**Método:** Comparação manual de cada payload do cliente vs regra correspondente, mais execucao de `npm run test:rules`

---

## Resumo executivo

**55 testes passam** sem falhas. Nenhum IDOR, nenhum vazamento pessoal→casal, nenhuma escalacao de privilegio foi encontrada. A sincronia dos 14 valores de `InvoiceLedgerEntryType` nos tres pontos (TypeScript, rules, Cloud Function) foi confirmada.

Os achados sao de baixa severidade ou informativos: a estrutura geral esta solida.

---

## Resultado dos testes

```
Test Files  2 passed (2)
Tests      55 passed (55)
```

O comando `npm run test:rules` executou com sucesso via `scripts/with-java.mjs`. Todos os testes de regra passam, incluindo os cenarios de borda: fundacao atomica, convite expirado, terceiro membro bloqueado em workspace casal, criacao de receivable com campos contrabandeados, e o regression test de `installment_anticipation_credit`.

---

## Checklist sistematico

### 1. IDOR / Isolamento multi-tenant

**Status: OK**

Toda colecao aninhada em `/workspaces/{workspaceId}` usa `isActiveMember(workspaceId)` para leitura e escrita. A funcao verifica:

```javascript
function isActiveMember(workspaceId) {
    return signedIn()
        && exists(currentMemberDoc(workspaceId))
        && get(currentMemberDoc(workspaceId)).data.status == 'active';
}
```

Cada workspace e isolado por `workspaceId`. Um usuario ativo no workspace A nao tem acesso ao workspace B porque nao possui um doc `members/{seu-uid}` com `status == 'active'` dentro de B.

Os testes confirmam:

- `blocks a user from reading another user workspace` — Alice nao le workspace do Bob (linha 710-715)
- `blocks cross-workspace transaction reads` — linha 1118-1133
- `keeps personal financial data private between couple members` — Bob (partner) nao le contas/cartoes pessoais da Alice (linha 1628-1665)

Workspaces pessoais (`personal_{uid}`) so sao acessiveis pelo dono. O workspace compartilhado (`couple_*`) e acessivel pelos dois membros ativos, mas subcolecoes dentro dele (sharedExpenseClaims, settlements, etc.) usam a mesma guarda `isActiveMember`.

**Veredito:** Nao ha IDOR. O isolamento multi-tenant esta correto.

---

### 2. Sincronia enum/campo — payload cliente vs rules

#### 2.1 InvoiceLedgerEntryType (14 valores)

Os tres pontos estao em sincronia:

| # | Valor | TypeScript enum | Rules `validInvoiceLedgerEntryType` | Cloud Function `invoiceTotalsDeltaForEntry` |
|---|---|---|---|---|
| 1 | `purchase` | Sim | Sim | `purchasesTotalCents` |
| 2 | `payment` | Sim | Sim | `paymentsTotalCents` |
| 3 | `advance_payment` | Sim | Sim | `paymentsTotalCents` |
| 4 | `refund_credit` | Sim | Sim | `creditsTotalCents` |
| 5 | `chargeback_credit` | Sim | Sim | `creditsTotalCents` |
| 6 | `manual_credit` | Sim | Sim | `creditsTotalCents` |
| 7 | `manual_debit` | Sim | Sim | `purchasesTotalCents` |
| 8 | `interest` | Sim | Sim | `feesTotalCents` |
| 9 | `fine` | Sim | Sim | `feesTotalCents` |
| 10 | `iof` | Sim | Sim | `feesTotalCents` |
| 11 | `fee` | Sim | Sim | `feesTotalCents` |
| 12 | `installment_anticipation` | Sim | Sim | `purchasesTotalCents` |
| 13 | `installment_anticipation_credit` | Sim | Sim | `creditsTotalCents` |
| 14 | `purchase_reversal` | Sim | Sim | `creditsTotalCents` |

Teste `invoiceTotalsDeltaForEntry` (functions) cobre todos os 14 tipos.

A auditoria do CLAUDE.md (2026-07-19) esta correta: os tres pontos estao em sincronia.

#### 2.2 validTransactionCreate — campos

Payload real do cliente (`createTransaction` em `financeService.ts`):

```
id, workspaceId, createdBy, updatedBy, type, amountCents, description,
merchant, categoryId, accountId, destinationAccountId, date, competenceMonth,
cashMonth, tags, notes, isRecurring, clientMutationId, syncStatus, version,
createdAt, updatedAt
```

Campos adicionais em `createCardPurchase` (`cardService.ts`):

```
cardId, invoiceId, installmentGroupId
```

Campos adicionais em `recordRecurringPayment` (`financeService.ts`):

```
recurringId
```

Rules `hasOnly` inclui todos estes, mais o campo `source` (ver item 4.1 abaixo).

Cada tipo de transacao (`expense`, `transfer`, `card_purchase`, `card_payment`) tem suas validacoes especificas em `validTransactionAccounts`, que exige/exclui os campos certos (ex.: `card_purchase` nao permite `accountId`/`destinationAccountId`, mas exige `cardId`/`invoiceId`).

**Veredito:** Sincronia ok.

#### 2.3 validAccountCreate — campos

Payload real do cliente (`createAccount` em `financeService.ts`):

```
id, workspaceId, name, type, openingBalanceCents, currentBalanceCents,
isActive, createdBy, createdAt, updatedAt
```

Rules `hasOnly` inclui estes mais `isPrimary`. O cliente nunca envia `isPrimary` no create, mas `hasOnly` permite (e o campo e opcional). `setPrimaryAccount` usa `updateDoc` separado para alterar `isPrimary`.

**Veredito:** Sincronia ok.

#### 2.4 validCategoryCreate — campos

Payload real do cliente (`createCategory` em `financeService.ts`):

```
id, workspaceId, name, icon, color, type, isDefault, isActive, createdBy,
createdAt, updatedAt
```

Rules `hasOnly` inclui `parentCategoryId` que o cliente nao envia (opcional). Categorias default (`ensureDefaultCategories`) nao incluem `createdBy`, e a regra valida `isDefault == true` sem `createdBy`.

**Veredito:** Sincronia ok. O regression test na linha 1001-1025 do test file cobre os tres casos (default sem createdBy, custom sem createdBy = falha, default com createdBy = falha).

#### 2.5 validBillCreate / validReceivableCreate — campos

Payload real do cliente (`createBill`):

```
id, workspaceId, description, amountCents, dueDate, status, categoryId,
accountId, createdBy, createdAt, updatedAt
```

Payload real do cliente (`createReceivable`):

```
id, workspaceId, description, amountCents, fromWho, dueDate, status,
accountId, createdBy, createdAt, updatedAt
```

Rules `hasOnly` para ambos incluem exatamente esses campos. O campo `recurringId` esta no `hasOnly` de `validBillUpdate` (pode mudar numa edicao) mas nao no `validBillCreate`.

**Veredito:** Sincronia ok.

#### 2.6 Demais colecoes (recurring, goals, budgets, cards, invoices, ledger, sharedExpenseClaims, settlements, auditLogs)

Cada payload do cliente foi verificado contra o `hasOnly` correspondente. Nenhuma discrepancia foi encontrada. Os campos opcionais (`installmentNumber`, `installmentTotal` no ledger, `anchorDay` no recurring, `displayName` no member, `coupleMode` no workspace) estao todos corretamente tratados com `!keys().hasAny([...]) || valid...`.

---

### 3. Vazamento pessoal <-> casal

**Status: OK**

O isolamento e garantido por design de colecao: dados pessoais ficam em `workspaces/personal_{uid}/...` e dados do casal em `workspaces/couple_*/...`. A regra `isActiveMember(workspaceId)` impede que um membro do casal leia o workspace pessoal do outro.

Teste na linha 1628-1665 confirma: Bob (partner no `couple_a`) nao consegue ler `workspaceA/accounts/accountPrivate` nem `workspaceA/cards/cardPrivate`.

Alem disso:

- `sharedExpenseClaims` exige `sourceVisibility == 'summary_only'`, bloqueando `sourcePersonalTransactionId` (testado na linha 1667-1699)
- `receivables` e uma colecao SEPARADA de `bills`, entao um "a receber" nunca infla o Comprometido do workspace pessoal
- `coupleGoalDeposit`/`coupleGoalWithdraw` escrevem transacoes no workspace pessoal (`personalWorkspaceId`) com `isActiveMember(personalWorkspaceId)`, que so o dono atende

**Veredito:** Nao ha rota de vazamento.

---

### 4. Escaladas / `hasOnly` / `hasAny`

**Status: OK**

#### 4.1 Campo `source` em validTransactionCreate — nunca enviado pelo cliente

```
ID: REGRAS-1
Titulo: Campo 'source' listado em validTransactionCreate.hasOnly nunca e enviado pelo cliente
Severidade: Informativa
Local: firestore.rules:507
Descricao: O campo 'source' esta na lista hasOnly de validTransactionCreate, mas nenhuma
  funcao do cliente (financeService.ts, cardService.ts) o envia no payload de criacao de
  transacao. Nao ha `source` na interface Transaction em contracts.ts. O campo parece ser
  planejado para uso futuro ou foi adicionado preventivamente.
Cenario de exploracao: Nao ha — o campo esta em hasOnly (permissivo) e nunca aparece nos
  payloads. Nenhum risco de seguranca.
Impacto: Nenhum. Apenas ruido na leitura das regras.
Solucao sugerida: Remover o campo de hasOnly se nao for ser usado, ou documentar qual
  componente (Cloud Function? Admin SDK?) o envia.
Confianca: 10
```

#### 4.2 Campo `reconciledAt` em validTransactionUpdate — nunca enviado pelo cliente

```
ID: REGRAS-2
Titulo: Campo 'reconciledAt' em validTransactionUpdate.hasOnly nunca e enviado pelo cliente
Severidade: Informativa
Local: firestore.rules:565
Descricao: O campo 'reconciledAt' esta na lista hasOnly de validTransactionUpdate, mas
  nenhuma funcao do cliente o envia. O test na linha 1364-1379 verifica que reconciledAt
  nao pode ser enviado em criacao. O campo parece ser planejado para conciliacao bancaria.
Cenario de exploracao: Nao ha.
Impacto: Nenhum.
Solucao sugerida: Manter como preparacao para a feature de conciliacao, ou remover ate
  que seja implementada.
Confianca: 10
```

#### 4.3 Imutabilidade de campos protegidos

Todos os validadores de update protegem campos sensiveis:

- `createdBy` — imutavel via `request.resource.data.createdBy == resource.data.createdBy` + nao listado em `hasOnly`
- `createdAt` — imutavel via `request.resource.data.createdAt == resource.data.createdAt` + nao listado em `hasOnly`
- `workspaceId` — imutavel via `request.resource.data.workspaceId == resource.data.workspaceId` + nao listado em `hasOnly`
- `clientMutationId` — imutavel em transacoes
- `version` — so incrementa (`resource.data.version + 1` em transactions, claims, settlements)
- `role` — imutavel em memberships (so `status`/`removedAt` podem mudar)
- `sourceVisibility` — imutavel em sharedExpenseClaims

Ledger entries sao imutaveis apos criacao (`allow update: if false`). GoalContributions tambem (`allow update: if false`). AuditLogs tambem.

**Veredito:** Nao ha escalada de privilegio possivel via manipulacao de campos.

---

### 5. Catch-all

**Status: OK**

`match /workspaces/{workspaceId}/{document=**}` (linha 1722-1725):
```javascript
allow read: if isActiveMember(workspaceId);
allow write: if false;
```

Read autorizado para membros ativos (consistente com o resto da estrutura). Write negado (seguro para qualquer subcolecao futura nao mapeada).

Nao ha catch-all no nivel raiz (`/databases/{database}/documents`), o que significa que qualquer colecao raiz nao explicitamente mapeada (`match /users/...`, `match /workspaces/...`, `match /coupleInvites/...`, etc.) e negada por padrao.

**Veredito:** Correto.

---

### 6. Storage Rules

**Status: OK**

```
match /{allPaths=**} {
    allow read, write: if false;
}
```

Tudo negado. O unico teste (`storage.rules.test.ts`) confirma que uploads sao rejeitados. Nao ha bucket de storage em uso atualmente; as regras impedem acesso acidental.

---

### 7. Regra de receivables (Contas a Receber, 2026-07-19)

**Status: OK**

A colecao `/workspaces/{workspaceId}/receivables/{receivableId}` existe e tem:

- `allow read: if isActiveMember(workspaceId)` — linha 1646
- `allow create: if validReceivableCreate(workspaceId, receivableId)` — linha 1647
- `allow update: if validReceivableUpdate(workspaceId)` — linha 1648
- `allow delete: if canDeleteWorkspaceTree(workspaceId)` — linha 1649

`validReceivableCreate` e `validReceivableUpdate` espelham a estrutura de `validBillCreate`/`validBillUpdate`, com os campos corretos:

- `fromWho` (string opcional ate 120) em vez de `categoryId`
- Status enum: `pending`, `received`, `overdue`, `cancelled`
- Sem `recurringId`, sem `categoryId`

Os testes na linha 1405-1431 cobrem: criacao valida, update de status, campos contrabandeados (`categoryId` rejeitado), status inexistente (`paid` rejeitado), e workspace errado.

**Veredito:** Regra correta e testada.

---

### 8. Regras do WhatsApp

**Status: OK**

Tres colecoes de WhatsApp foram verificadas:

| Colecao | Read | Write | Local |
|---|---|---|---|
| `/users/{uid}/whatsappLinkCodes/{code}` | `isSelf(uid)` | `if false` (Admin SDK) | firestore.rules:1584-1587 |
| `/whatsappPhoneIndex/{phone}` | `request.auth != null` | `if false` (Admin SDK) | firestore.rules:1591-1594 |
| `/whatsappPendingActions/{phone}` | `if false` | `if false` | firestore.rules:1598-1600 |

- `whatsappLinkCodes`: so o proprio usuario le seus codigos. Escrita bloqueada para client.
- `whatsappPhoneIndex`: qualquer usuario autenticado pode consultar (necessario para o bot do WhatsApp olhar qual workspace pertence um numero). Escrita bloqueada para client.
- `whatsappPendingActions`: completamente bloqueado (so o webhook do WhatsApp via Admin SDK).

Nao ha risco de um cliente escrever dados falsos no indice telefonico ou plantar codigos de link falsos.

---

### 9. Auditoria adicional — pontos nao solicitados mas relevantes

#### 9.1 Deletabilidade de dados pessoais

O `accountDeletionService.ts` usa `writeBatch` do lado do cliente para excluir todos os dados. As regras permitem:

- `canDeleteUserAccountData(uid)` — `isSelf(uid)` — para dados do usuario (profile, workspaceRefs, fcmTokens)
- `canDeleteWorkspaceTree(workspaceId)` — para dados do workspace (donos excluem seus workspaces pessoais e workspaces de casal onde sao owner)
- Combinacao para membros de workspace de casal: `leavePartnerWorkspace` atualiza status para `removed` e depois o doc e excluido via `canDeleteUserAccountData`

Fluxo testado na linha 676-689: exclusao atomica da fundacao pessoal.

#### 9.2 Criacao atomica de workspace de casal

O batch em `createCoupleWorkspace` (sharedService.ts) cria workspace + member + workspaceRef + auditLog. As regras `validCoupleWorkspaceCreate` valida o workspace e checa `getAfter` para member e workspaceRef.

O fluxo de convite (`acceptCoupleInvite`) e atomicamente validado: workspace update + invite update + member create + workspaceRef create + auditLog. Cada `getAfter` no batch verifica as condicoes de estado.

#### 9.3 Cloud Function de totais de fatura

`onInvoiceLedgerEntryCreated` em `invoiceLedgerEntryTrigger.ts` processa entradas de ledger e atualiza `processedLedgerEntryIds`. A Cloud Function usa Admin SDK (ignora security rules) e se protege contra reentrega via `processedLedgerEntryIds` + transacao.

#### 9.4 Billing

`billingAccounts/{billingAccountId}`:
- `allow get` apenas para o proprio usuario (`billingAccountId == billingAccountIdFor(request.auth.uid)`)
- `list, create, update: if false` — so Admin SDK
- Subcolecoes `subscriptions`: get/list para o proprio usuario, create/update bloqueados
- `billingEvents`: completamente bloqueado

`planCatalog/{planId}`: leitura publica (`allow read: if true`), escrita bloqueada.

**Veredito:** O modelo de billing esta seguro.

---

## Quadro de achados

| ID | Titulo | Severidade | Local | Confianca |
|---|---|---|---|---|
| REGRAS-1 | Campo `source` em validTransactionCreate nunca enviado | Informativa | firestore.rules:507 | 10 |
| REGRAS-2 | Campo `reconciledAt` em validTransactionUpdate nunca enviado | Informativa | firestore.rules:565 | 10 |

Nenhum achado de severidade Critica, Alta ou Media.

---

## Conclusao

O sistema de Firestore Security Rules do Zerou esta maduro e bem estruturado. Os principais pontos fortes:

1. **Isolamento multi-tenant consistente** — toda colecao usa `isActiveMember`
2. **Campos imutaveis protegidos** — `createdBy`, `createdAt`, `workspaceId`, `role` nao podem ser alterados
3. **Ledger entries imutaveis** — `allow update: if false` no ledger, goalContributions, auditLogs
4. **Sincronia enum nos tres pontos** — os 14 tipos de `InvoiceLedgerEntryType` estao em sincronia (TypeScript, rules, Cloud Function)
5. **WhatsApp bloqueado para client** — todas as tres colecoes de WhatsApp tem write bloqueado
6. **Testes abrangentes** — 55 testes passam, incluindo regression tests para bugs passados
7. **Receivables implementado corretamente** — colecao separada com validadores proprios

Os dois unicos achados sao campos listados como permitidos que nenhum cliente envia (`source`, `reconciledAt`) — ambos planejados para uso futuro, sem impacto de seguranca.
