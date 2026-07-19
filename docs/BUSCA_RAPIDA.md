# Busca rápida — Zerou

Use este arquivo como mapa antes de abrir documentos grandes. Regra: leia o menor arquivo que responde a pergunta e use `rg`/Grep antes de abrir histórico mensal.

## Entrada rápida

| Quero saber | Abrir primeiro | Observação |
|---|---|---|
| Estado atual do app | `SESSAO.md` | Brief curto para início de sessão |
| Últimas mudanças | `CHANGELOG.md` | Resumo recente |
| Histórico por data | `docs/history/YYYY-MM.md` | Abrir só o mês necessário |
| Onde fica cada doc | `docs/README.md` | Mapa das pastas |
| Pendências/roadmap | `docs/planning/TODOS.md` | Itens abertos |
| Design/UI (Sol) | `docs/design/DESIGN.md` | Tokens, fontes, componentes-base |
| Testes e QA | `docs/qa/TESTES.md` | Estratégia, comandos, cenários |
| Arquitetura | `docs/ARCHITECTURE.md` | Visão técnica |
| Segurança / privacidade | `docs/SECURITY.md`, `docs/PRIVACY.md` | Regras, LGPD |
| Operação / deploy | `docs/RUNBOOK.md`, `docs/PRODUCTION_CHECKLIST.md` | Rotina e checklist |
| Custos Firebase (leituras/gravações, limites grátis, break-even) | `docs/COSTS.md` | Quantos usuários no grátis, quanto cobrar |
| Billing futuro (inativo) | `docs/BILLING.md`, `docs/BOOTSTRAP_FIREBASE_STRIPE.md` | Não ativar sem pedido |
| Setup de infra manual | `docs/MANUAL_SETUP_REQUIRED.md` | Passos fora do código |
| Instruções pra agentes | `CLAUDE.md` | Regra de docs e restrições |
| Contas de teste (login p/ navegador) | `TEST_ACCOUNTS.local.md` (raiz, local, fora do git) | Só existe se criado na máquina |
| Assistente de IA (Grazi) | `docs/ai/GRAZI.md` | Documento canonico — tudo sobre a feature |
| WhatsApp (bot de lancamentos) | `docs/whatsapp/WHATSAPP.md` | Documento canonico — URLs, IDs, fluxo, config |

## Onde está cada coisa no código

| Assunto | Caminho |
|---|---|
| Telas autenticadas | `src/pages/` |
| Shell + nav inferior/FAB | `src/layout/AppShell.tsx` |
| Onboarding (questionário) | `src/onboarding/OnboardingPage.tsx`, opções compartilhadas em `src/onboarding/onboardingOptions.tsx`. Objetivo/desafio editável depois em `/app/settings/onboarding` (`src/settings/OnboardingAnswersSettingsPage.tsx`) — alimenta a Grazi via `functions/src/ai/onboardingLabels.ts` |
| Componentes-base de UX | `src/components/` (`BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState`) |
| Ícones + cores de categoria | `src/components/categoryIcons.tsx`, `src/theme/palette.ts` |
| Serviço financeiro | `src/finance/financeService.ts` |
| Saldo de conta (mantido incrementalmente) | `Account.currentBalanceCents`, `applyAccountEffectsToBatch` (`financeService.ts`), sinal por tipo de transação em `transactionAccountEffects` (`src/finance/financeCalculations.ts`, porta Admin SDK em `functions/src/shared/accountEffects.ts`) |
| Dashboard (resumo, Disponível/Comprometido) | `src/pages/DashboardPage.tsx`, `src/finance/financeCalculations.ts`. Cache de exibição do boot (números + listas + legendas, pinta antes do Firestore, evita "piscar") em `src/finance/dashboardViewCache.ts` |
| Transações (criar/editar/listar/filtrar) | `src/pages/NewTransactionPage.tsx`, `src/pages/EditTransactionPage.tsx`, `src/pages/TransactionsPage.tsx`, `src/components/TagInput.tsx`. Lista mostra 300 ao vivo + botão "Carregar mais" (paginação por cursor, `loadMoreTransactions` em `financeService.ts`) |
| Contas a Pagar (recorrentes + compromissos avulsos, seções separadas) | `src/pages/BillsPage.tsx` — seção "Recorrentes" (editar via `updateRecurringRule`) + seção "Compromissos" (filtro "Em aberto"/Vencidas/Pagas/Todas). `createBill`/`payBill`/`updateBillStatus`/`createRecurringRule`/`updateRecurringRule`/`recordRecurringPayment`/`deleteRecurringRule` em `financeService.ts` |
| Orçamento por categoria | `createBudget`/`updateBudgetLimit`/`deleteBudget`/`subscribeBudgets` (`financeService.ts`), UI em `src/pages/SearchPage.tsx` (sheet "Orçamentos") |
| Exclusão de conta (self-service) | `src/settings/LoginMethodsPage.tsx` (UI, digitar EXCLUIR) + `src/settings/accountDeletionService.ts` (`runAccountDeletion`/`deleteAccountData`, inclui desvínculo de WhatsApp) + `src/settings/accountDeletion.store.ts` (flag que impede o guard de rota mandar pro onboarding no meio da exclusão, ver `src/auth/routeGuards.tsx`) |
| Exclusão de conta (admin) | `functions-admin/src/index.ts` (`adminDeleteUser`, codebase separado `admin` — deploy: `npx firebase deploy --only functions:admin:adminDeleteUser`), botão em `src/pages/AdminPage.tsx` |
| WhatsApp preso/órfão (admin) | Painel Admin > aba "WhatsApp" (`AdminPage.tsx`, `WhatsappTab`) lista `whatsappPhoneIndex`, marca "Órfão" e desvincula via `adminUnlinkWhatsappNumber` (`functions-admin/src/index.ts`, deploy: `npx firebase deploy --only functions:admin:adminUnlinkWhatsappNumber`) — funciona mesmo com workspace já excluído |
| Exportar CSV | `src/finance/csvExport.ts` |
| Cartões / faturas | `src/cards/`. Totais da fatura mantidos incrementalmente por Cloud Function (`functions/src/cards/invoiceLedgerEntryTrigger.ts`, reversão de compra excluída em `reverseCardPurchaseOnDelete.ts`) — nunca mais recalculados do zero. Ledger detalhado carregado sob demanda via `src/cards/useInvoiceLedger.ts` (não mais no boot global, `useCardsData.ts` só usa os totais já persistidos). Fechamento de fatura tem dois autores: `closeInvoicesDue` (Cloud Scheduler diário, `functions/src/automation.ts`) e `markClosedInvoices` (client-side self-heal a cada snapshot, 2026-07-18, `cardService.ts` — mesmo padrão de `markOverdueBills`). Antecipação de parcela (`src/cards/anticipation.ts`) só aceita compra com `installmentTotal > 1` ou múltipla ocorrência no ledger — compra à vista nunca entra |
| Scripts de backfill (uso único) | `scripts/backfillAccountBalances.mjs`, `scripts/backfillInvoiceTotals.mjs`, `scripts/backfillBillTag.mjs` — precisam de `serviceAccountKey.json` na raiz (gerar em Firebase Console > Contas de serviço, apagar depois de usar) |
| Espaço do casal + cofrinho | `src/pages/SharedSpacePage.tsx` (orquestrador), `src/pages/shared/` (convite/modo/cofrinho/despesas), `src/shared/` (serviço/hooks) |
| Análise / gráficos / busca | `src/pages/SearchPage.tsx` (UI); `src/finance/spendingAnalysis.ts` (gasto por mês/categoria em regime de caixa — cartão pela parcela da fatura, não pela transação). Lê os meses completos **sob demanda** via `src/finance/useMonthlyTransactions.ts`, não a janela de 300 do boot |
| Histórico além das 300 transações (ler por mês, Carregar mais, custo) | Plano canônico: `docs/planning/HISTORICO_TRANSACOES.md`. `src/finance/useMonthlyTransactions.ts` (`useMonthlyTransactions` = meses sob demanda; `useCompleteCurrentMonth` = mês atual completo só se a janela transbordou); `subscribeTransactionsForMonths`/`loadMoreTransactions`/`dedupeById` em `financeService.ts`. Resolve o subcontar da Análise (F1) + "Carregar mais" em Transações (F2) + Dashboard/banner do mês atual (F3). Custo em `docs/COSTS.md` seção 6 |
| Metas (pessoais) — histórico, retirada, exclusão com devolução (2026-07-18) | `src/pages/GoalsPage.tsx` (lista), `src/pages/GoalDetailPage.tsx` (`/app/goals/:goalId`, histórico), `src/finance/GoalContributeSheet.tsx` (guardar/retirar), `src/finance/GoalDeleteSheet.tsx` (excluir com/sem devolução), `src/finance/useGoalContributions.ts`, `src/finance/useGoalsData.ts` |
| Patrimônio Líquido (desativado 2026-07-16, código intacto — ver `docs/planning/TODOS.md` pra religar) | `src/pages/NetWorthPage.tsx`, `src/finance/netWorthCalculations.ts` |
| Resumo Anual | `src/components/AnnualSummarySheet.tsx`, `src/finance/annualSummaryCalculations.ts` |
| Alertas de Orçamento | `src/components/BudgetAlertBanner.tsx`, `src/finance/budgetAlertCache.ts` (banner cliente); `functions/src/budgetAlerts.ts` (Cloud Function push) |
| Tokens de cor / temas | `src/styles/themes.css` |
| CSS global | `src/styles/global.css` |
| Pull-to-refresh bloqueado (mobile, PWA incluso) | `src/pwa/preventPullToRefresh.ts` (JS cirúrgico via `touchmove`, chamado no `main.tsx`). **NÃO** usar `overscroll-behavior` pra isso — travou todo o scroll (ver `docs/design/DESIGN.md` e histórico 2026-07) |
| Landing pública | `src/landing/` (`LandingCss`, `LandingSections`, `LandingShell`, `AppMockup`, `landing.css`) |
| Regras Firestore | `firestore.rules` |

## Histórico mensal

| Mês | Arquivo | Use para |
|---|---|---|
| Julho 2026 | `docs/history/2026-07.md` | Auditoria pré-lançamento, testes de lógica financeira, `anchorDay` de recorrência |
| Junho 2026 | `docs/history/2026-06.md` | Redesign Sol, mobile shell, cofrinho do casal, metas, landing nova |

## Buscas principais

```powershell
# Última coisa sobre cofrinho/casal
rg -n "cofrinho|goalContribution|SharedSpace" CHANGELOG.md docs/history

# Onde um token de cor é definido
rg -n "EE5524|--action-primary|--gradient" src/styles/themes.css

# Onde uma coleção Firestore é usada
rg -n "goalContributions|collectionRef" src/finance
```
