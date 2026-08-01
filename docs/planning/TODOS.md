# Pendências e roadmap — Granativa

Itens acionáveis. Fechou? Move para "Concluído" ou remove. Detalhe histórico vai para `../history/`.

**Última revisão**: 2026-08-01 — auditoria completa de cada item contra o código real (3 agentes + graphify + grep).

## Abertas

### Segurança — auditoria 2026-07-19 ✅ FECHADA (12/12)

Relatório completo: `~/Desktop/relatorio-auditoria-2026-08-01.md`.

- [x] FIN-01/02/03 — Idempotência de pagamento
- [x] CLIENT-7 — Limpeza localStorage no logout
- [x] CLIENT-3/4/SECRETS-4/5 — Headers segurança
- [x] SECRETS-2 — defineString (decisão do dono)
- [x] WHATSAPP-02 — Zod webhook
- [x] PERF-2/3 — Lazy framer-motion (624→472 KB)
- [x] CLIENT-2 — CSP sem unsafe-inline (SHA-256)
- [x] AUTH-01 — Verificação email client-side
- [x] AUTH-02/ADMIN-5 — Admin custom claims
- [x] LACUNA-04 — Resolvido pela migração claims
- [x] LGPD-01 — DPO contato@granativa.com.br
- [x] LGPD-03/09/14 — DeepSeek nos Termos

Não implementado (decisão consciente):
- [ ] LGPD-02/04 — Export/portabilidade. Script manual se alguém pedir. Self-service com checkout.
- [ ] LGPD-16 — Direito de oposição. Precisa regras + deploy.

### Técnico

- [ ] **⚠️ Push em dobro — NÃO RESOLVIDO** (2026-07-31). `shouldDisplayPush` (Cache Storage) nos dois lados (notifications.ts:103, vite.config.ts:36-49), mas check-then-write não é atômico. Hipóteses: corrida Cache Storage ou redelivery Web Push. 3 tentativas falharam. Ver CLAUDE.md e docs/history/2026-07.md.
- [ ] **`sendBudgetAlerts` — verificar no log** se funciona. Código e índice deployados (budgetAlerts.ts, firestore.indexes.json:121-132). Roteiro: docs/RUNBOOK.md.
- [ ] **Pacote compartilhado lógica financeira** — `functions/src/shared/accountEffects.ts` é porta manual de `transactionAccountEffects`. Hoje estão em sincronia. Só fazer se crescer ou divergir.
- [ ] **`subscribeInvoices` limita a 24 faturas** — cardService.ts:789 (limit(24)). Inalcançável hoje (2 meses de app).
- [ ] **Code splitting** — bundle principal 472 KB + AuthContext 453 KB. Warning dos 500 KB não dispara mais (framer-motion saiu). Firebase Auth SDK é o próximo vilão mas difícil de separar.
- [ ] **App Check, backups Firestore, alertas custo** — infra, nada implementado.
- [ ] **Procedência logos banco** — 26/29 SVGs com fonte divergente. `public/bank-logos/SOURCES.md`. Decisão do dono pendente.
- [ ] **Emails oficiais** — suporte@/privacidade@ configurados no Cloudflare (Email Routing → zerou.contato.net@gmail.com). Conferir se entregam sem bounce.

### Produto / UX

- [ ] **Vic + contexto de investimento** — `buildFinancialContext.ts` não tem seção de investimentos. Account balances inclui tudo sem filtro. Parâmetro `includeInvestments` não existe.
- [ ] **Contas `investment` legacy** — tipo existe em contracts.ts. `useFinanceData.ts:294` já filtra `type !== 'investment'` do saldo. Nenhuma migração pra contas antigas do tipo.
- [ ] **`--chart-4` tema escuro** — valor real é `#FFD54F` (não `#F9A825` como anotado antes). `#F9A825` é dos temas claros. Fora de escopo (token global).
- [ ] **Categoria nome duplicado** — `createCategory` não valida (financeService.ts:272). Subcategorias tornam duplicata legítima em ramos diferentes. Validação futura = única dentro do mesmo pai.
- [ ] **Redesenho da Análise (SearchPage.tsx)** — 65 inline `style={{ }}`, ~35 no bloco donut. Sem herói visual, sem hierarquia visual entre seções.
- [ ] **Revisar demais telas** — sem lista fechada, avaliar conforme abrir.
- [ ] **Contas a Receber recorrente (Fase 2)** — `RecurringRule` não tem campo `direction`. Nenhum código de receita recorrente. Plano: `direction: 'payable' | 'receivable'` + botão Registrar espelhado + Cloud Function + deploy manual.
- [ ] **QA manual real no celular** — 10 fluxos.
- [ ] **Tendência pela fatia do donut** — `onClick` na fatia (SearchPage.tsx:627) só seleciona/dimming. Não abre CategoryTrendSheet. Só abre pelo menu "Tendência por categoria".
- [ ] **Copy páginas legais/ajuda** — LegalPages.tsx (246 linhas), sem rewrite de voz.

### Subcategorias — itens adiados

Feature entregue 2026-07-30 (plano: `docs/planning/SUBCATEGORIAS.md`).

- [x] ~~**Vic criar subcategoria por WhatsApp**~~ — **JÁ FEITO** (commit `04c299b`, 2026-07-30). Fluxo completo: `createCategoryFromMessage.ts` aceita `parentCategoryId`, `webhookHandler.ts:433-498` resolve pai e cria com `subcategoryCreatedMessage`, `interpretMessage.ts` entende "cria X dentro de Y". O TODOS.md anterior marcava isso como pendente por engano.
- [ ] **Orçamento no pai somando as filhas** — `spendingAnalysis.ts:192-204`: decisão de produto em aberto. Travado por `[D9]`.
- [ ] **Roll-up no Resumo Anual e alerta de orçamento** — `annualSummaryCalculations.ts:57` não rola. `budgetAlerts.ts:102` consulta Firestore direto por `categoryId`, sem filhos. Travado por `[D9]`.
- [ ] **`CategoryTrendSheet` não rola pro pai** — `CategoryTrendSheet.tsx:63` chama `spendingByCategoryAcrossMonths` sem `rollUpByParent`. Pai agrupado mostra só gasto direto. `rollUpByParent` só roda no donut (SearchPage.tsx:289).

### WhatsApp — Fase 2

- [ ] Parcela em andamento, antecipar, renegociar — redireciona pro app (`out_of_scope`).
- [ ] Editar/excluir por mensagem — redireciona pro app.

### Negócio / legal

- [ ] Revisão jurídica antes de escala pública.
- [ ] Stripe / billing real — só com decisão de produto.
- [ ] Rate limit Vic no plano pago — 60 msg/dia. Rever quando existir plano.

### Design — decisão de NÃO mexer

- [x] Paleta daltonismo — decisão explícita do dono.

## Concluído (recente)

### 2026-08-01 — Limpeza pós-auditoria

- [x] pushDebug removido (função + regra + 2 testes, -116 linhas)
- [x] 18 investmentValueUpdates órfãos limpos via Admin SDK
- [x] `recordRecurringPayment || → ??` — já resolvido via `resolvePaymentMethod.ts`

### 2026-08-01 — Auditoria segurança (12/12)

- [x] Idempotência, logout cleanup, verificação email, admin claims, Zod webhook, CSP hash, lazy landing, DPO

### 2026-08-01 — Investimentos

- [x] Feature entregue + QA ao vivo (6 bugs). Detalhe: `docs/history/2026-08.md`.

### 2026-07-31 — Push + exclusão conta + admin

- [x] Push causa raiz (escopo SW), PWA-only, cache corrigido
- [x] Exclusão conta: 4 resíduos
- [x] Admin mensagens push/email

### 2026-07-30 — Subcategorias

- [x] Feature entregue. Vic cria subcategoria por WhatsApp (commit `04c299b`).

### 2026-07-28/29 — Análise + Comprometido

- [x] Ordenação 2 níveis, competência, donut SVG, acerto saldo, Comprometido simplificado

### 2026-07-24/25 — Offline + dashboard

- [x] Auditoria offline, crash localStorage, Projeção, calculateInvoice client-side

### 2026-07-23 — Cartão crédito

- [x] 4 pendências + 3 bugs. Editar compra, Resumo Anual, ordenação ledger.

### Anteriores

- [x] Hero visual Dashboard, cartão em Contas a Pagar, recorrência virou lembrete, emails, tendência, contas a receber F1, Análise >300 transações, cache boot, metas, saldo incremental, WhatsApp integração, Vic, landing, rebrand, Cloudflare, legal
