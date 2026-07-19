# Plano — Contas a Receber (espelho do Contas a Pagar)

> Status: **planejamento** (revisão de engenharia 2026-07-19). Feature nova pedida pelo dono:
> anotar dinheiro a receber (gente que deve, freela pendente, reembolso). Decisões travadas com o
> dono abaixo. Regra nº1 do projeto se aplica: campo/coleção nova em payload → atualizar
> `firestore.rules` **no mesmo commit** + `npm run test:rules`.

## Decisões do dono (travadas)

- **Individual** (não compartilha com o casal — o casal já tem o acerto de contas dele).
- **Avulso E recorrente** (ver "Faseamento": recomendo avulso primeiro).
- **No Dashboard, bem no final**, e **só se faltar ≤ 5 dias pra receber** — pra não dar ilusão de
  dinheiro.

## Princípio inegociável (valor do dono)

**Dinheiro a receber NUNCA entra no Saldo/Disponível/Comprometido.** É só lembrete/registro. Só
quando o dono marca **"recebido"** vira uma **receita de verdade** numa conta escolhida — igualzinho
o Contas a Pagar (uma conta não sai do saldo até marcar "paga"). Isso é o mesmo motivo pelo qual a
Projeção de Fluxo de Caixa foi apagada: não iludir com dinheiro que não se tem.

## Decisão de arquitetura nº1 — coleção SEPARADA `receivables` (não um campo em `bills`)

Havia dois caminhos:
- **(A) `direction: 'payable'|'receivable'` no `bills`** — mais DRY, mas o Dashboard lê `bills` em
  `buildUpcomingCommitments`/cálculo do "Comprometido". Um "a receber" nessa coleção **vazaria** pro
  Comprometido/Disponível a menos que eu audite e filtre **todo** consumidor de `bills` — exatamente
  a classe de bug de dinheiro que mais custou caro neste projeto.
- **(B) coleção `receivables` separada** — o cálculo de saldo/comprometido **nunca** lê essa coleção,
  então o vazamento é **impossível por construção**.

**Escolhido: (B).** Segurança do número acima de DRY. Espelha o padrão do `bills`, mas isolado.

```
SALDO / DISPONÍVEL / COMPROMETIDO
   ├── accounts.currentBalanceCents   (saldo)
   ├── bills / recurring / invoices   (comprometido = dinheiro a SAIR)
   └──  ✗  receivables                 NUNCA lido aqui → nunca infla o número

"marcar recebido" ──► cria transação income na conta ──► AÍ SIM entra no saldo
```

## O que já existe (reusar, não reinventar)

| Peça a espelhar | Onde |
|---|---|
| Modelo `Bill` + status | `src/types/contracts.ts` |
| Tela (lista, seções, filtros) | `src/pages/BillsPage.tsx` |
| `payBill` (batch: status 'paid' + cria transação expense + ajusta saldo) | `financeService.ts:886` |
| `markOverdueBills` (client, marca vencida) | `financeService.ts:589` |
| `createRecurringRule` + `generateRecurrences` (Cloud Function) | `financeService.ts:597`, `functions/src/automation.ts` |
| Idempotência de ocorrência recorrente | `recurringOccurrenceTransactionId` (`financeService.ts:932`) |
| Regras: `validBillCreate/Update`, `validRecurringCreate/Update` | `firestore.rules:590-702` |
| "Próximos compromissos" no Dashboard | `buildUpcomingCommitments` (`financeCalculations.ts`) |

## Modelo `Receivable` (espelho do `Bill`, semântica de entrada)

```ts
interface Receivable {
  id: string;
  workspaceId: string;
  description: string;
  amountCents: MoneyCents;
  fromWho?: string;        // "de quem" — o toque de receivable ("Fulano me deve")
  dueDate: Timestamp;
  status: 'pending' | 'received' | 'overdue' | 'cancelled';  // 'received' no lugar de 'paid'; 'overdue' = atrasado
  accountId?: string;      // conta onde cai quando recebido (default; escolhível no ato)
  recurringId?: string;    // Fase 2
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```

## Fluxo "marcar como recebido" (espelho exato do `payBill`)

```
markReceivableReceived(ws, user, receivable, { accountId, amountCents?, description? })
  └─ batch:
       ├─ update receivables/{id}  → status: 'received'
       ├─ set   transactions/{id}  → type: 'income', amountCents, accountId, tags: ['a-receber']
       └─ applyAccountEffectsToBatch → increment(+amount) na conta  (credita de verdade)
     fireWrite(batch.commit())   // fire-and-forget, offline-first
```

## Recorrente (Fase 2) — a bifurcação

Uma "a receber recorrente" ("recebo aluguel todo dia 5"). Dois caminhos:
- **(a) Reusar `RecurringRule` + `generateRecurrences` com `direction: 'payable'|'receivable'`**:
  DRY, server-side (consistente com bills, materializa mesmo com app fechado + push). Custo: campo
  novo no `RecurringRule` (→ regra `validRecurring*` + `test:rules`) e mexer na Cloud Function
  (deploy manual — lembrar que `git push` NÃO reimplanta functions, ver `RUNBOOK.md`).
- **(b) Geração client-side** (materializa a próxima ocorrência quando o app abre, como
  `markOverdueBills`): evita a Cloud Function, mas é padrão diferente e só materializa ao abrir.

**Recomendação: (a)** se fizer a Fase 2 — consistência com o resto, e o dono já espera server-side.

## Dashboard — "Próximos a receber"

Seção **no fim** da tela (depois de tudo), separada de "Próximos compromissos". Mostra só
`receivables` com `status in (pending, overdue)` e `dueDate <= hoje + 5 dias`. Nova
`buildUpcomingReceivables` (espelho de `buildUpcomingCommitments`, sem entrar em nenhum total de
saldo). Se vazia, não renderiza nada (nem título) — pra não poluir.

## Faseamento (recomendação da revisão)

O feature toca > 8 arquivos (tela, serviço, regras, contrato, dashboard, schemas, testes; Fase 2 +
Cloud Function). Recomendo **fasear**:

- **Fase 1 (essencial): avulso. ✅ IMPLEMENTADA em 2026-07-19.** Coleção `receivables`,
  `ReceivablesPage` (`/app/receivables`), criar/cancelar, "marcar recebido" → income na conta,
  `markOverdueReceivables`, seção no Dashboard (≤5 dias, no fim), nav (sidebar + mobile). Sem Cloud
  Function. `firestore.rules` (`validReceivable*` + match) + teste no emulador (55/55). **Depende de
  deploy das regras** pra funcionar em produção (autorização do dono).
- **Fase 2: recorrente.** `direction` no `RecurringRule` + `generateRecurrences` roteando pra
  `receivables` + regra atualizada + deploy da function.

**Decisão do dono (2026-07-19): fazer só a Fase 1 (avulso) agora.** A Fase 2 (recorrente) fica como
feature futura — registrada em `docs/planning/TODOS.md`.

## Arquivos afetados (Fase 1)

- `src/types/contracts.ts` — `Receivable`.
- `src/finance/receivableService.ts` (novo, ou em `financeService.ts`) — `subscribeReceivables`,
  `createReceivable`, `markReceivableReceived`, `updateReceivableStatus`, `markOverdueReceivables`.
- `src/finance/financeSchemas.ts` — `createReceivableSchema`.
- `src/finance/useFinanceData.ts` (ou hook novo `useReceivablesData`) — assinar `receivables`.
- `src/pages/ReceivablesPage.tsx` (novo) + sheet de criar/receber (molde de `BillsPage`).
- `src/layout/AppShell.tsx` — entrada de nav (ao lado de Contas a Pagar).
- `src/App.tsx` — rota `/app/receivables`.
- `src/pages/DashboardPage.tsx` + `src/finance/financeCalculations.ts` — `buildUpcomingReceivables`.
- `firestore.rules` — `validReceivableCreate/Update` + `match /receivables/{id}` (+ teste em
  `tests/firestore.rules.test.ts` com payload real). **Deploy de regras só com autorização do dono.**
- Provável **nenhum** índice novo (ordena por `dueDate`, como bills).

## Estratégia de teste

- **Regras** (`tests/firestore.rules.test.ts`): payload real de `receivable` (create válido, campo
  contrabandeado, tipo errado, status inválido, outro workspace). **Mesmo cuidado dos 3 incidentes
  do CLAUDE.md** — o payload de teste tem que refletir o cliente de verdade.
- **`markReceivableReceived`**: cria income com o valor/conta certos e credita o saldo (`increment`).
- **`markOverdueReceivables`**: marca vencida só o que passou e está pending.
- **`buildUpcomingReceivables`**: filtra ≤5 dias, ignora received/cancelled, não entra em saldo.
- Render de `ReceivablesPage` (molde de `DashboardPage.test.tsx`): lista, marcar recebido.
- Gates: `typecheck` · `test` · `test:rules` · `build`.

## Modos de falha

| Codepath | Falha | Mitigação |
|---|---|---|
| Receivable vaza pro Comprometido | dinheiro fantasma no Disponível | **Impossível** — coleção separada, saldo nunca lê `receivables` |
| Campo novo sem atualizar regra | create rejeitado silenciosamente (offline-first engole) | Regra + `test:rules` no mesmo commit (regra nº1) |
| "Marcar recebido" 2x | receita em dobro | Botão fecha o sheet + status vira 'received' (não reofertável); id de transação determinístico se recorrente |
| Marcar recebido offline | trava? | Fire-and-forget (`fireWrite`), igual `payBill` — nunca `await` bloqueante |

## Fora de escopo (deferido)

- Compartilhar a receber com o casal (individual por decisão do dono).
- Juros/multa por atraso no recebimento (não é dívida formal).
- Cobrança/notificação pra quem deve (é registro pessoal, não ferramenta de cobrança).
- Fase 2 (recorrente) se o dono optar por só avulso agora.

## Sequência

Fase 1 (avulso, completa e testada) → verificar ao vivo → Fase 2 (recorrente, com deploy da function).
