# Plano TRAVADO — Histórico além das 300 transações (Análise correta + offline-first)

> Status: **TRAVADO** (revisão de engenharia 2026-07-19). Abordagem final: **ler por mês, sob
> demanda**. Contexto de custo em `docs/COSTS.md` (seção 6). Regra inegociável: offline-first.

## TL;DR — o que fica decidido

- A Análise lê **só os meses que você olha** (não o histórico todo). O "teto de 5000" **não existe** mais.
- A query por mês **não tem limite** → **um mês com >300 transações é lido inteiro** (a dúvida do dono).
- Transações ganha **"Carregar mais"** (páginas de 50 antigas) — mecanismo **separado** da Análise.
- Offline: mês já visto online → funciona offline; nunca visto + offline → mensagem "conecte-se".
- **Zero** mudança em `firestore.rules` (leitura já é por membro) e **zero** índice novo (campos string simples são auto-indexados). Confirmado no código.

## O que é seguro (NÃO mexer) vs o que quebra

| Item | Depende da janela de 300? | Por quê |
|---|---|---|
| Saldo total / Disponível / Comprometido | ❌ Seguro | `currentBalanceCents` incremental; Comprometido vem de bills/recurring/invoices + receita futura (sempre na janela) |
| **Análise: categorias %/valor, gráfico mês/ano** | ✅ **Quebra** | `monthlyTotals`/`spendingByCategoryForMonth` peneiram as 300 |
| Dashboard "Resumo de gastos" (mês atual) + banner de orçamento | ✅ Quebra (borda) | idem, só no mês corrente |
| Lista de Transações | ✅ Quebra | sem paginação |

## Arquitetura — de onde a Análise tira os números

A Análise de um mês soma DUAS fontes. Só a primeira está quebrada:

```
ANÁLISE (mês M)
  ├── transações diretas do mês M ────── HOJE: peneira as 300 ❌  (subconta)
  │                                       FIX:  query por mês (cashMonth|competenceMonth == M)
  └── parcelas de cartão na fatura M ──── já sob demanda via useInvoiceLedger ✓
                                          (janela própria de 24 faturas/cartão — ver "Fora de escopo")
```

O fix é só a **fonte das transações diretas** (as 300 → por mês). O lado de cartão já é sob demanda
e completo até ~2 anos por cartão (as 24 faturas).

## Decisão 1 — Query por mês (TRAVADA)

Uma transação conta no mês M se `cashMonth == M` **OU** `competenceMonth == M` (strings 'YYYY-MM',
podem divergir de `date` — por isso NÃO dá pra usar intervalo de `date`).

```
meses = {mês selecionado} ∪ {últimos 6} ∪ {mesmo mês ano passado, só se comparar}   (≤ ~8)
   │                                                     'in' do Firestore aceita 30 → folga enorme
   ├─ Q1: where('cashMonth', 'in', meses)        ┐
   ├─ Q2: where('competenceMonth', 'in', meses)  ├─ merge + dedupe(id) = transações COMPLETAS dos meses
   └─ (SEM .limit())                             ┘
```

- Sem `.limit()` → mês de 400 vem inteiro.
- `cashMonth`/`competenceMonth` são campos string simples → **índice single-field automático**, sem
  `firestore.indexes.json`. `allow read: isActiveMember` (rules 1578) já cobre qualquer WHERE → sem
  `firestore.rules`. **Verificado no código.**
- Guard: se algum dia `meses` passar de 30 (navegação maluca), quebrar em blocos de 30. Inalcançável
  no uso normal (só carregamos o que a tela mostra).

## Decisão 2 — >300 num único mês (TRAVADA — a dúvida do dono)

**A Análise pega TODAS.** A query por mês não tem limite, então lê o mês inteiro (400, 500, o que
for). O limite de 300 era só do **boot global**; a query por mês não herda ele. Na **lista** de
Transações, um mês de 400 mostra as 300 recentes ao vivo + "Carregar mais" traz o resto.

## Decisão 3 — "Carregar mais" em Transações (TRAVADA — mecanismo SEPARADO da Análise)

```
TRANSAÇÕES (lista)   ── NADA a ver com a Análise: outra tela, outro mecanismo ──
   [300 mais recentes] ← onSnapshot (tempo real: lançou, apareceu)
        │  toca "Carregar mais"
        ▼
   getDocs(orderBy('date','desc'), startAfter(<doc mais antigo já na tela>), limit(50))   → +50 antigas
        │  anexa ao fim; dedupe por id na fronteira
        ▼  toca de novo → +50 → +50 …
   offline e página não cacheada → botão desabilitado ("Conecte-se para ver mais antigas")
```

- Cursor: usa o **DocumentSnapshot** do último doc como `startAfter` (Firestore resolve empates por
  `__name__` sozinho — sem pular/duplicar). Dedupe por `id` como cinto de segurança.
- Páginas antigas são **foto** (getDocs, não tempo real) — histórico velho quase não muda; escutar
  tudo ao vivo custaria à toa. As 300 recentes seguem ao vivo.
- Custo: ~50 leituras por toque, só quando o usuário pede.

## Decisão 4 — Busca textual (TRAVADA)

Firestore **não tem busca full-text**. A busca cobre os **meses carregados** (recentes + os que você
navegou). Achar uma transação muito antiga = navegar até o mês dela (que carrega e vira buscável).
"Busca global" de verdade exigiria um índice de busca (Algolia/Typesense) — **fora deste plano** (é um
gasto de "token de inovação" que não se justifica agora). Registrado como TODO.

## Decisão 5 — Custo do gráfico de 6 meses (TRAVADA)

Abrir a Análise num aparelho de **cache vazio** lê ~6 meses de transações (limitado pelos 6 meses, NÃO
pelo total — tanto faz 500 ou 50.000 no histórico). Cacheado depois → aberturas seguintes leem só o
delta. Aceitável. **Otimização futura** (se o custo do gráfico incomodar em escala): docs de agregado
mensal (income/expense por mês já somados) → o gráfico lê 6 docs minúsculos em vez de 6 meses. NÃO
agora — é complexidade a mais (write-path novo pra manter em sincronia) por um problema que ainda não
existe.

## Offline (TRAVADO)

`onSnapshot` por mês: online → servidor (e **cacheia**); offline → **cache** (meses já vistos). Mês
nunca sincronizado + offline → **mensagem sutil** "Conecte-se para ver essa análise", e carrega
sozinha quando a rede voltar. **Sem aquecedor proativo** (não gastar leitura de quem nunca abre a
Análise). Todo listener novo usa `subscribeWithTransientRetry` + `markLoaded()` (proteção anti-piscar
já endurecida em 2026-07-18). Nenhuma leitura crítica com `await` bloqueante.

## Fases (TRAVADAS, cada uma mergeável sozinha)

- **Fase 1 (essencial) — ✅ IMPLEMENTADA em 2026-07-19:** `subscribeTransactionsForMonths` + hook
  `useMonthlyTransactions` (sob demanda, onSnapshot com a proteção anti-piscar) + `SearchPage`
  (Análise) **e `AnnualSummarySheet` (resumo anual — 12 meses do ano, sob demanda)** agregam sobre
  a UNIÃO das 300 do boot + os meses completos (helper `dedupeById`, DRY). Nota de offline. **Sem
  regressão pra quem tem ≤300** (união = as 300). 9 testes novos.
- **Fase 2 — ✅ IMPLEMENTADA em 2026-07-19:** `loadMoreTransactions` (getDocs com cursor por
  DocumentSnapshot via `getDoc` da âncora — robusto contra empate de data) + botão "Carregar mais"
  em `TransactionsPage` (300 ao vivo ∪ páginas de 50 antigas, dedupe por id, aviso de offline). 2
  testes novos.
- **Fase 3 (deferível):** Dashboard "Resumo de gastos" + banner do mês atual usam o **mesmo** hook
  por mês (DRY) pro mês corrente. **Recomendo DEFERIR:** só quebra com >300 no mês corrente (extremo),
  a Análise já dá o número certo, e o alerta de orçamento **server-side** (`sendBudgetAlerts`) já é
  completo. Documentar a borda em vez de gastar leitura por boot de todo mundo.

## Arquivos afetados

- `src/finance/financeService.ts` — `getTransactionsForMonths(workspaceId, monthKeys)` (2 queries `in`
  + merge/dedupe), `loadMoreTransactions(workspaceId, afterDoc, 50)` (startAfter).
- `src/finance/useMonthlyTransactions.ts` — **novo** hook sob demanda.
- `src/pages/SearchPage.tsx` — usar o hook em vez de `finance.transactions`.
- `src/pages/TransactionsPage.tsx` — "Carregar mais".
- (Fase 3) `src/pages/DashboardPage.tsx`, `src/components/BudgetAlertBanner.tsx`.
- **SEM** `firestore.rules`, **SEM** `firestore.indexes.json` (confirmado).

## Cobertura de teste (a produzir junto do código)

```
[+] financeService.getTransactionsForMonths
    ├── [GAP] merge cashMonth+competenceMonth, dedupe por id (transação com os dois campos diferentes)
    ├── [GAP] mês com >300 → retorna todas (sem limit)
    └── [GAP] meses vazios → []
[+] financeService.loadMoreTransactions
    ├── [GAP] startAfter traz a próxima página, ordem por data desc
    └── [GAP] fronteira sem duplicar (dedupe por id)
[+] useMonthlyTransactions (padrão useCardsData.test.tsx)
    ├── [GAP] boot, retry transitório, markLoaded, timeout offline
    └── [GAP] muda monteKeys (navegação) → re-consulta
[+] spendingAnalysis (JÁ tem testes) — funções puras, inalteradas
    └── [GAP-REGRESSÃO] monthlyTotals/spendingByCategoryForMonth com 350 tx em vários meses = correto
[+] SearchPage (render, molde DashboardPage.test.tsx)
    └── [GAP] mês antigo com dados mostra total certo (não subconta) via hook mockado
```

Gates: `npm run typecheck` · `npm test` · `npm run build`. Testes que **falham sem a correção**.
Offline: verificação manual no celular (não automatizável no preview).

## Modos de falha (produção)

| Codepath | Falha realista | Tem teste? | Tem tratamento? | Usuário vê? |
|---|---|---|---|---|
| Query por mês offline, mês não cacheado | retorna vazio | sim (hook) | sim: mensagem "conecte-se" | mensagem clara ✓ |
| Merge cashMonth+competence | duplicar transação | sim (dedupe) | sim: dedupe por id | não (corrigido) |
| "Carregar mais" empate de data | pular/duplicar linha | sim | sim: cursor por DocumentSnapshot | não |
| `in` com >30 meses | erro do Firestore | — | guard: chunk de 30 | não (inalcançável) |

Nenhum modo de falha silencioso + sem teste + sem tratamento → **zero gaps críticos**.

## Fora de escopo (deferido de propósito)

- **Janela de 24 faturas/cartão** (`subscribeInvoices`): limitação **separada** do lado de cartão da
  Análise — além de ~2 anos por cartão, parcelas antigas somem. Já em `TODOS.md`. Este plano só trata
  transações diretas.
- **Busca textual global** (índice de busca externo) — não justifica agora.
- **Docs de agregado mensal** (otimizar leitura do gráfico) — só se virar problema.
- **Fase 3** (Dashboard/banner mês atual) — deferível, borda extrema.

## O que já existe (reusar, não reinventar)

- `useInvoiceLedger` — a SearchPage **já** carrega ledgers sob demanda ao abrir. O hook por mês segue
  exatamente esse padrão. **Precedente confirmado** (`SearchPage.tsx:174`).
- `subscribeWithTransientRetry` + `markLoaded()` — proteção anti-piscar/erro-transitório.
- `spendingAnalysis` (`monthlyTotals`/`spendingByCategoryForMonth`) — puras, **inalteradas** (só muda
  a fonte). O bug nunca foi a conta, foi a entrada.
- Saldos incrementais — não tocar.

## Sequência

Fase 1 → verificar ao vivo → Fase 2 → (Fase 3 se/quando quiser). Recomendo Fase 1 sozinha primeiro.
