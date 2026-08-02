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
| Achados visuais (passada front-end) | `docs/design/DESIGN_VISUAL_ACHADOS.md` | Mapa de correções e pendências [DONO] |
| Testes e QA | `docs/qa/TESTES.md` | Estratégia, comandos, cenários |
| Arquitetura | `docs/ARCHITECTURE.md` | Visão técnica |
| Segurança / privacidade | `docs/SECURITY.md`, `docs/PRIVACY.md` | Regras, LGPD |
| Operação / deploy | `docs/RUNBOOK.md`, `docs/PRODUCTION_CHECKLIST.md` | Rotina e checklist |
| Custos Firebase (leituras/gravações, limites grátis, break-even) | `docs/COSTS.md` | Quantos usuários no grátis, quanto cobrar |
| Billing futuro (inativo) | `docs/BILLING.md`, `docs/BOOTSTRAP_FIREBASE_STRIPE.md` | Não ativar sem pedido |
| Setup de infra manual | `docs/MANUAL_SETUP_REQUIRED.md` | Passos fora do código |
| Instruções pra agentes | `CLAUDE.md` | Regra de docs e restrições |
| Contas de teste (login p/ navegador) | `TEST_ACCOUNTS.local.md` (raiz, local, fora do git) | Só existe se criado na máquina |
| Assistente de IA (Vic) | `docs/ai/VIC.md` | Documento canonico — tudo sobre a feature |
| WhatsApp (bot de lancamentos) | `docs/whatsapp/WHATSAPP.md` | Documento canonico — URLs, IDs, fluxo, config |
| Emails transacionais (Resend) | `functions/src/email/` | Templates, provider, triggers, adapter |
| Limpeza de dados orfaos | `functions/src/cleanup.ts` | `dailyCleanup` (04:57 BRT), `scripts/listOrphanWorkspaces.mjs` |
| Force logout ao excluir conta | `functions/src/forceLogoutAllDevices.ts` | Revoga refresh tokens em todos dispositivos |
| Cancel workspace (Admin SDK) | `functions/src/cancelCoupleWorkspace.ts` | recursiveDelete + coupleInvites + workspaceRef |
| Rate limit WhatsApp | `functions/src/whatsapp/whatsappTransactionRateLimit.ts` | 100 transacoes/dia/workspace |

## Onde está cada coisa no código

| Assunto | Caminho |
|---|---|
| Telas autenticadas | `src/pages/` |
| Shell + nav inferior/FAB | `src/layout/AppShell.tsx` |
| Onboarding (questionário) | `src/onboarding/OnboardingPage.tsx`, opções compartilhadas em `src/onboarding/onboardingOptions.tsx`. Objetivo/desafio editável depois em `/app/settings/onboarding` (`src/settings/OnboardingAnswersSettingsPage.tsx`) — alimenta a Vic via `functions/src/ai/onboardingLabels.ts` |
| Tutoriais de tela (carrossel) | `src/onboarding/SlideTour.tsx` é o carrossel genérico; cada tela tem um par componente+store: `WelcomeTour` (global), `AnalysisTour`, `CategoriesTour`. O "já viu" mora no `localStorage` (`zerou.*TourSeen`), não no Firestore — é estado por aparelho. Tour de tela só abre depois do global, pra não empilhar dois modais |
| Componentes-base de UX | `src/components/` (`BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState`, `LoadingState` — placeholder "carregando" pra nunca confundir com EmptyState de "vazio de verdade", ver `docs/history/2026-07.md`) |
| Ícones + cores de categoria | `src/components/categoryIcons.tsx`, `src/theme/palette.ts` |
| Subcategorias — regras de hierarquia | `src/finance/categoryHierarchy.ts` (tudo função pura): `parentCategoryIds` (**exige a lista COMPLETA** — calcular sobre um recorte por tipo fez o pai voltar a ser selecionável, bug real 29/07), `selectableCategories`, `canBeParentOf` (3 travas de 1 nível), `parentCandidates`, `canDeleteCategory`, `dependentsOnCategory`. Plano e decisões: `docs/planning/SUBCATEGORIAS.md` |
| Categoria — formulário, ações e tela | `src/components/CategoryForm.tsx` (formulário compartilhado pelos DOIS lugares que criam categoria), `src/finance/useCategoryActions.ts` (hook que substituiu 21 closures duplicadas), `src/settings/CategoriesSettingsPage.tsx` (`/app/settings/categories`), `src/components/CategoryField.tsx` (seletor dentro do lançamento — **não** foi removido de propósito) |
| Serviço financeiro | `src/finance/financeService.ts` |
| Investimentos | `src/pages/InvestmentsPage.tsx` (página principal), `src/finance/InvestmentContributeSheet.tsx` (aporte/resgate), `src/finance/InvestmentValueUpdateSheet.tsx` (atualizar valor), `src/finance/InvestmentHistoryChart.tsx` (gráfico), `src/finance/investmentAnalysis.ts` (`buildInvestmentValueHistory`). Plano: `docs/planning/INVESTIMENTOS.md`. Tutorial: `src/onboarding/InvestmentsTour.tsx` + `investmentsTour.store.ts` |
| Saldo de conta (mantido incrementalmente) | `Account.currentBalanceCents`, `applyAccountEffectsToBatch` (`financeService.ts`), sinal por tipo de transação em `transactionAccountEffects` (`src/finance/financeCalculations.ts`, porta Admin SDK em `functions/src/shared/accountEffects.ts`) |
| ⚠️ Conta "fora do saldo" (vale-refeição, VR/VA, cartão presente) | `Account.excludeFromTotals` (`contracts.ts`, opcional ⇒ zero migração). Os dois recortes que tudo consome nascem em `useFinanceData.ts`: **`countedAccounts`** (entram no Saldo total) e **`excludedAccountIds`** (`Set` que os agregados usam pra descartar transação). `accounts`/`accountBalances` seguem COMPLETOS — a conta continua na tela Contas, no Extrato e em todo seletor de lançamento. `excludedAccountIds` é parâmetro **obrigatório** em `spendingByCategoryForMonth`/`monthlyTotals`/`spendingByCategoryAcrossMonths` (`spendingAnalysis.ts`) e em `calculateDashboardSummary`/`calculateNextMonthProjection` (`financeCalculations.ts`) — de propósito, pra tela nova não esquecer. Toggle e selo: `src/pages/AccountsPage.tsx` (`setAccountExcludeFromTotals`) + `.account-card-hero-flag`/`.icon-button--excluded` (`global.css`). Servidor: `functions/src/ai/buildFinancialContext.ts` e `functions/src/budgetAlerts.ts`. Detalhe: `docs/history/2026-08.md` |
| Acertar saldo com o banco (conciliação) | `AccountReconcileSheet` (`src/finance/`, sheet na tela de Contas, ícone balança) + `reconcileAccountBalance` (`financeService.ts`, cria 1 acerto pela diferença: `adjustment` se banco maior, `expense` se menor). Diagnóstico só-leitura da divergência: `scripts/reconcileAccountBalances.mjs` (bate `currentBalanceCents` vs histórico) e `scripts/dumpTransactionsForOwner.mjs`. Contexto (divergência fixa de 1,44 = rendimento externo, não bug): `docs/history/2026-07.md` |
| Dashboard (resumo, Saldo total/Comprometido) | `src/pages/DashboardPage.tsx`, `src/finance/financeCalculations.ts` (`buildUpcomingCommitments` = recorrências + contas + faturas do ciclo atual; `selectCurrentCycleInvoices` conta só a fatura aberta mais próxima + as fechadas por cartão, não parcelas futuras; `recurringChargesByInvoice` desfaz a duplicidade de recorrência no cartão — sem corte por data desde 2026-07-27, Disponível/payday/availableMode removidos). Cache de exibição do boot em `src/finance/dashboardViewCache.ts` |
| Transações (criar/editar/listar/filtrar) | `src/pages/NewTransactionPage.tsx`, `src/pages/EditTransactionPage.tsx`, `src/pages/TransactionsPage.tsx`, `src/components/TagInput.tsx`. Lista mostra 300 ao vivo + botão "Carregar mais" (paginação por cursor, `loadMoreTransactions` em `financeService.ts`) |
| Saldo por dia no Extrato + cor/sinal da linha | `balanceByDayEnd` (`src/finance/financeCalculations.ts`): saldo consolidado no fim de cada dia, partindo de `currentTotalBalance` (mesma fonte do Dashboard) e desfazendo os efeitos de trás pra frente — exige a lista **sem filtro**, ordenada do mais recente pro mais antigo. Cor/sinal da linha: `transactionFlowByType` (`spent`/`received`/`internal`; transferência e pagamento de fatura são internos). UI: `DayGroupBalance` em `TransactionsPage.tsx` + `.day-group-total*` (`global.css`). Regras visuais: `docs/design/DESIGN.md` |
| ⚠️ Hora gravada no `date` + ordem dentro do dia | `src/finance/financeDates.ts` — **duas convenções**: formulário do app ancora no **meio-dia** (`fromDateInputValue`, hora sem significado) e WhatsApp ao vivo grava o **instante real**. `fromDateInputValueForWrite` (data = hoje → hora real), `resolveEditedDate` (edição sem trocar o dia preserva o timestamp), `compareByDateDesc` (**dois níveis**: dia primeiro — senão o agrupamento por dia da `TransactionsPage` duplica cabeçalho — depois o instante, caindo no `createdAt` quando o `date` é o sentinela meio-dia). Testes: `financeDates.test.ts`. Contexto: `CHANGELOG.md` (2026-07-29) |
| Contas a Pagar (recorrentes + compromissos avulsos, seções separadas) | `src/pages/BillsPage.tsx` — seção "Recorrentes" (editar via `updateRecurringRule`) + seção "Compromissos" (filtro "Em aberto"/Vencidas/Pagas/Todas). `createBill`/`payBill`/`updateBillStatus`/`createRecurringRule`/`updateRecurringRule`/`recordRecurringPayment`/`deleteRecurringRule` em `financeService.ts` |
| Contas a Receber (Fase 1: avulso) | `src/pages/ReceivablesPage.tsx` (`/app/receivables`). Coleção **separada** `receivables` (nunca entra em saldo/comprometido). `createReceivable`/`markReceivableReceived` (espelho de `payBill` → cria income)/`markOverdueReceivables`/`subscribeReceivables` (`financeService.ts`). Dashboard ≤5 dias: `buildUpcomingReceivables` (`financeCalculations.ts`). Regras `validReceivable*` (`firestore.rules`). Recorrente = Fase 2 (ver `docs/planning/TODOS.md`). Detalhe: `docs/history/2026-07.md` |
| Orçamento por categoria | `createBudget`/`updateBudgetLimit`/`deleteBudget`/`subscribeBudgets` (`financeService.ts`), UI em `src/pages/SearchPage.tsx` (sheet "Orçamentos") |
| Exclusão de conta (self-service) | `src/settings/LoginMethodsPage.tsx` (UI, digitar EXCLUIR) + `src/settings/accountDeletionService.ts` (`runAccountDeletion`/`deleteAccountData`, inclui desvínculo de WhatsApp) + `src/settings/accountDeletion.store.ts` (flag que impede o guard de rota mandar pro onboarding no meio da exclusão, ver `src/auth/routeGuards.tsx`) |
| Exclusão de conta (admin) | `functions-admin/src/index.ts` (`adminDeleteUser`, codebase separado `admin` — deploy: `npx firebase deploy --only functions:admin`). Auth deletado primeiro, Firestore depois. `commitDeletes` deduplica por `.path` antes de montar os lotes e retorna contagem real. **Auditado 2026-07-31**: cobre `recurringNotifyState`, `billingEvents` (Stripe), `adminMessages` do usuário e `coupleInvites` que ele usou como parceiro — os 4 corrigidos nessa auditoria, ver `docs/history/2026-07.md`. Espelho client-side: `src/settings/accountDeletionService.ts` (auto-exclusão) — mesma cobertura, exceto as 3 coleções Admin-SDK-only (`write: if false`), que o client não pode alcançar de propósito. |
| Emails — boas-vindas, follow-up 3 dias, despedida | `functions/src/email/triggers.ts` (`onUserCreated`, `send3DayFollowUp`, `sendGoodbyeEmail`) + templates em `functions/src/email/templates/` + provider Resend em `resendProvider.ts`. Domínio verificado: `suporte@granativa.com.br`. |
| Limpeza diária automática | `functions/src/cleanup.ts` (`dailyCleanup`, 04:57 BRT): (A) couples abandonados (>7 dias sem partner), (B) ghosts (ownerUserId não existe), (C) mensagens WhatsApp >30 dias. Scripts manuais: `scripts/listOrphanWorkspaces.mjs`, `scripts/resetAllData.mjs`. |
| Force logout (auto-exclusão) | `functions/src/forceLogoutAllDevices.ts` — `auth.revokeRefreshTokens(uid)` via Admin SDK. Chamado com `Promise.race` de 5s no cliente antes de `deleteAccountData`. |
| WhatsApp preso/órfão (admin) | Painel Admin > aba "WhatsApp" (`AdminPage.tsx`, `WhatsappTab`) lista `whatsappPhoneIndex`, marca "Órfão" e desvincula via `adminUnlinkWhatsappNumber` (`functions-admin/src/index.ts`, deploy: `npx firebase deploy --only functions:admin:adminUnlinkWhatsappNumber`) — funciona mesmo com workspace já excluído |
| Mensagens do admin (push/email individual + broadcast) | Painel Admin > aba "Mensagens" (`AdminPage.tsx`, `MessagesTab`). Backend **no codebase `billing`** (não `functions-admin` — reaproveita `push.ts`/Resend que só existem lá): `functions/src/admin/adminMessaging.ts` (`adminSendMessage`/`adminBroadcastMessage`). Push individual reaproveita `sendPushToUser` (`push.ts`, retorna `{ tokensFound, sent }`); push broadcast usa o mesmo agrupamento por usuário de `sendDailyLogReminder` (`automation.ts`). Email usa `EmailKind: 'admin_message'` + `AdminMessageEmail.tsx` (texto livre do admin, não um `purpose` fixo). Histórico em `adminMessages/{id}` (Admin SDK only, regra copiada de `whatsappPhoneIndex`). Deploy: `npx firebase deploy --only functions:billing:adminSendMessage,functions:billing:adminBroadcastMessage` |
| Exportar CSV | `src/finance/csvExport.ts` |
| Cartões / faturas | `src/cards/`. Totais da fatura mantidos incrementalmente por Cloud Function (`functions/src/cards/invoiceLedgerEntryTrigger.ts`, reversão de compra excluída em `reverseCardPurchaseOnDelete.ts`) — nunca mais recalculados do zero. Ledger detalhado carregado sob demanda via `src/cards/useInvoiceLedger.ts` — retorna `{ entries, loading, error }` (2026-07-24; não mais no boot global, `useCardsData.ts` só usa os totais já persistidos). Fechamento de fatura tem dois autores: `closeInvoicesDue` (Cloud Scheduler diário, `functions/src/automation.ts`) e `markClosedInvoices` (client-side self-heal a cada snapshot, 2026-07-18, `cardService.ts` — mesmo padrão de `markOverdueBills`). Antecipação de parcela (`src/cards/anticipation.ts`) só aceita compra com `installmentTotal > 1` ou múltipla ocorrência no ledger — compra à vista nunca entra |
| Scripts de backfill (uso único) | `scripts/backfillAccountBalances.mjs`, `scripts/backfillInvoiceTotals.mjs`, `scripts/backfillBillTag.mjs` — precisam de `serviceAccountKey.json` na raiz (gerar em Firebase Console > Contas de serviço, apagar depois de usar) |
| Espaço do casal + cofrinho | `src/pages/SharedSpacePage.tsx` (orquestrador), `src/pages/shared/` (convite/modo/cofrinho/despesas), `src/shared/` (serviço/hooks) |
| Análise / gráficos / busca | `src/pages/SearchPage.tsx` (UI); `src/finance/spendingAnalysis.ts` (gasto por mês/categoria em **regime de competência**: compra à vista no cartão conta no mês da COMPRA, via a transação; parcela continua pela fatura, no ledger — 2026-07-28). `installmentPurchaseIds(invoices)` separa à vista de parcelado (por `installmentTotal > 1` ou ocorrência). Lê os meses completos **sob demanda** via `src/finance/useMonthlyTransactions.ts`, não a janela de 300 do boot. **`rollUpByParent`** (mesma `spendingAnalysis.ts`) soma subcategoria no pai — aplicado **SÓ na chamada do donut/lista**; `BudgetAlertBanner` e `annualSummaryCalculations` leem o cru de propósito (`[D9]`, com teste travando) |
| Histórico além das 300 transações (ler por mês, Carregar mais, custo) | Detalhe em `docs/history/2026-07.md`. `src/finance/useMonthlyTransactions.ts` (`useMonthlyTransactions` = meses sob demanda; `useCompleteCurrentMonth` = mês atual completo só se a janela transbordou); `subscribeTransactionsForMonths`/`loadMoreTransactions`/`dedupeById` em `financeService.ts`. Resolve o subcontar da Análise (F1) + "Carregar mais" em Transações (F2) + Dashboard/banner do mês atual (F3). Custo em `docs/COSTS.md` seção 6 |
| Metas (pessoais) — histórico, retirada, exclusão com devolução (2026-07-18) | `src/pages/GoalsPage.tsx` (lista), `src/pages/GoalDetailPage.tsx` (`/app/goals/:goalId`, histórico), `src/finance/GoalContributeSheet.tsx` (guardar/retirar), `src/finance/GoalDeleteSheet.tsx` (excluir com/sem devolução), `src/finance/useGoalContributions.ts`, `src/finance/useGoalsData.ts` |
| Resumo Anual | `src/components/AnnualSummarySheet.tsx`, `src/finance/annualSummaryCalculations.ts` |
| Alertas de Orçamento | `src/components/BudgetAlertBanner.tsx`, `src/finance/budgetAlertCache.ts` (banner cliente); `functions/src/budgetAlerts.ts` (Cloud Function push) |
| Tokens de cor / temas | `src/styles/themes.css` |
| CSS global | `src/styles/global.css` |
| Pull-to-refresh bloqueado (mobile, PWA incluso) | `src/pwa/preventPullToRefresh.ts` (JS cirúrgico via `touchmove`, chamado no `main.tsx`). **NÃO** usar `overscroll-behavior` pra isso — travou todo o scroll (ver `docs/design/DESIGN.md` e histórico 2026-07) |
| Landing pública | `src/landing/` (`LandingCss`, `LandingSections`, `LandingShell`, `AppMockup`, `landing.css`) |
| Notificações push (FCM) — ponta a ponta | **Cliente**: `src/pwa/notifications.ts` (`requestAndRegisterPushToken` + `listenForForegroundPush`, ambos travados por `isStandalonePwa()` — **só registra/escuta dentro do PWA instalado**, nunca numa aba comum, decisão de produto de 2026-07-31), cache do token em `src/pwa/pushTokenCache.ts`, chamado no `src/layout/AppShell.tsx`. **Service worker**: gerado em build pelo plugin `generateFirebaseMessagingSW` no `vite.config.ts` → `public/firebase-messaging-sw.js` (não commitado, está no `.gitignore`). **Servidor**: `functions/src/push.ts` (`sendPushToUser`), agendadas em `functions/src/automation.ts` (`closeInvoicesDue` 00h, `generateRecurrences` 06h, `sendDueReminders` 08h, `sendDailyLogReminder` 20h) e `functions/src/budgetAlerts.ts` (10h). Tokens em `users/{uid}/fcmTokens/{token}`. ⚠️ **Armadilhas já pagas caro** (ver `docs/history/2026-07.md`): o SW do FCM precisa de **escopo próprio** (`/firebase-cloud-messaging-push-scope`) porque o VitePWA ocupa `/`, e `getRegistration()` casa por escopo — não por script; o `link` do webpush tem que ser **URL absoluta HTTPS**; o cache local (`pushTokenCache.ts`) não sabe se o Firestore foi limpo por fora — `requestAndRegisterPushToken` confere com `getDoc` antes de confiar no cache; e `onBackgroundMessage` (SW) + `onMessage` (página) podem disparar os DOIS pro mesmo push apesar da `tag` igual — `shouldDisplayPush()` (Cache Storage, mesma chave nos dois lados: `notifications.ts` e o SW gerado por `vite.config.ts`) tenta deduplicar, mas **⚠️ testado ao vivo e a notificação em dobro continua acontecendo mesmo assim** — não resolvido, ver `docs/planning/TODOS.md` e `CLAUDE.md`. Testes: `src/pwa/notifications.test.ts`. Diagnóstico: `docs/RUNBOOK.md` |
| Índices Firestore (inclui as exceções de collection group) | `firestore.indexes.json`. ⚠️ Consulta de **campo único** num `collectionGroup` **não** usa o índice automático (que é por coleção) — precisa de entrada em `fieldOverrides` com `queryScope: COLLECTION_GROUP`, senão a query morre com `FAILED_PRECONDITION`. Já quebrou duas features em silêncio: `whatsappLinkCodes.code` e `budgets.isActive` |
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

# Investimentos
rg -n "Investment|investments|investmentValueUpdate" src/finance/financeService.ts src/types/contracts.ts

# Categoria sintética vinculada
rg -n "linkedInvestmentAccountId" src/ src/finance/ firestore.rules

# Regras de investimento no Firestore
rg -n "validInvestment|validExistingInvestmentAccountRef" firestore.rules
```
