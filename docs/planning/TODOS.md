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

### Casal — revisão de 2026-08-03

Entregue: excluir despesa, conta/categoria/data virando transação real, saída do parceiro, acerto
com tela, trava de conexão. Detalhe em `docs/history/2026-08.md`. O que ficou:

- [ ] **⚠️ DEPLOY DAS REGRAS PENDENTE** — 5 mudanças em `firestore.rules` (ramo de saída em `validAuditLogCreate`, delete de claim por quem registrou, `occurredOn` no claim, create de settlement já pago, `receiptConfirmedAt`). **Sem o deploy, "sair do espaço" continua quebrado em produção** e despesa dividida com data é rejeitada em silêncio (offline-first engole o erro). Comando: `npx firebase deploy --only firestore:rules --project zerou-26757`. 103 testes de regras verdes.
- [ ] **Editar despesa dividida** — só dá pra excluir e registrar de novo. Mexer em valor/divisão exigiria refazer a transação pessoal do outro lado (que pode estar em fatura já paga) — mesmo raciocínio que barrou editar valor de compra no cartão em 2026-07-23.
- [ ] **Acerto parcial não tem histórico visível** — a tela mostra o saldo atual e o pagamento aguardando confirmação, não a lista de acertos passados. Os dados existem em `settlements`.
- [ ] **`subscribeActiveInvites` continua assinando depois do casal formado** — a seção de convite não renderiza mais nesse estado. Custo perto de zero (query sem resultado), mas é listener sem uso.
- [ ] **Despesa dividida não aparece no Extrato como "do casal"** — a transação pessoal leva a tag `casal`, mas nada na linha do Extrato indica que ela tem uma contraparte compartilhada.
- [ ] **Contestar não avisa o outro** — muda o status e sai do acerto, sem push nem email. A pessoa só descobre abrindo a tela.

### Produto / UX

- [ ] **Vic + contexto de investimento** — `buildFinancialContext.ts` não tem seção de investimentos. Account balances inclui tudo sem filtro. Parâmetro `includeInvestments` não existe.
- [ ] **Contas `investment` legacy** — tipo existe em contracts.ts. `useFinanceData.ts:294` já filtra `type !== 'investment'` do saldo. Nenhuma migração pra contas antigas do tipo.
- [ ] **`--chart-4` tema escuro** — valor real é `#FFD54F` (não `#F9A825` como anotado antes). `#F9A825` é dos temas claros. Fora de escopo (token global).
- [ ] **Categoria nome duplicado** — `createCategory` não valida (financeService.ts:272). Subcategorias tornam duplicata legítima em ramos diferentes. Validação futura = única dentro do mesmo pai.
- [x] ~~**Redesenho da Análise (SearchPage.tsx)**~~ — hero full-width pro "Gasto/Previsto no mês" (`.analysis-hero`, mesmo padrão de `.dash-hero`/`.invoice-hero`), legenda do donut migrada de inline style pra classes (`.category-legend-*`), toggles "Ver todas" reaproveitando `.list-toggle`. "Compras parceladas em andamento" também compactada (3 por padrão, `showAllOngoing`). 523 testes verdes, verificado ao vivo (mobile, tema escuro, mês futuro).
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

### 2026-08-01 — Ícone de "Compromissos" sumindo em iPhone 16/12 e alguns Android — CONFIRMADO CORRIGIDO

- [x] `.dash-shortcut-row .button` (grid 2x2 de atalhos do Dashboard mobile) ganhou
      `min-width: 0` (item de grid herda `min-width: auto`, e "Compromissos" — a palavra mais
      longa da fileira, sem ponto de quebra — pode forçar o WebKit a espremer o ícone SVG até
      sumir em vez de deixar o texto quebrar) + `flex-shrink: 0` no SVG do ícone, reforçando que
      ele nunca deve ser comprimido. Mesma classe de bug já documentada no DESIGN.md
      ("input gigante em flex/grid precisa de min-width: 0"). Não reproduzível no Chromium
      (testado 393×852/390×844/320×700 — engine Blink não tem o bug de sizing do WebKit,
      independente do viewport). **Confirmado corrigido pelo dono em iPhone real.**

### 2026-08-01 — Bug real: "Projeção do próximo mês" recalculava do zero no boot (achado pelo dono)

- [x] Ao contrário de Saldo total/Comprometido (que já usam `dashboardViewCache` pra mostrar o
      último valor conhecido enquanto Firestore ainda não respondeu), a "Sobra prevista" era
      100% recalculada a cada abertura do app com `bills`/`recurringRules`/`invoices` ainda
      vazios no boot — mostrava por um instante "sobra = salário inteiro" (sem descontar nada)
      antes de cair pro valor real quando os compromissos chegavam. `CachedDashboardView` ganhou
      `nextMonthProjection` (`dashboardViewCache.ts`, com fallback `null` pra cache de formato
      antigo sem essa chave — não invalida o resto); `DashboardPage.tsx` usa o mesmo gate `cache`/
      `isCommittedLoading` que o Comprometido já usa (mesma dependência de invoices/cards). A
      sheet de edição (`NextMonthProjectionSheet`) continua com o valor AO VIVO, não o cacheado —
      é onde a pessoa ajusta o número, precisa refletir o estado atual. 2 testes de regressão
      novos em `dashboardViewCache.test.ts`. Verificado ao vivo (localStorage confirma
      `nextMonthProjection` persistido, valor idêntico ao exibido após reload).

### 2026-08-01 — Busca em recorrências + filtro de categoria descobrível em Transações

- [x] **Recorrências**: campo de busca por nome acima da lista (`BillsPage.tsx`) — buscar
      mostra todos os resultados (ignora o cap de 3), toggle "Ver todas" some durante a busca.
- [x] **Transações**: filtro por categoria já existia (via texto digitado na busca), mas
      invisível — ninguém descobria sozinho. Novo `SelectField` "Categoria" (searchable) na
      sheet de Filtros, junto de Tag/Cartão, contabilizado no badge "Filtros · N".

### 2026-08-01 — Contas a Pagar compactada (3 por padrão)

- [x] "Recorrentes" e "Compromissos" (contas avulsas) mostravam a lista inteira sem limite —
      agora só as 3 primeiras, com `.list-toggle` ("Ver todas as N" / "Ver menos"), mesmo padrão
      já usado na Análise (compras parceladas) e na Fatura. Trocar de filtro em Compromissos
      (Em aberto/Vencidas/Pagas/Todas) reseta o "Ver todas". Verificado ao vivo com 12
      recorrentes reais.

### 2026-08-01 — Bug real: sync de tema em loop infinito de permission-denied — CORRIGIDO E DEPLOYADO

- [x] `firestore.rules` (`validThemeFields`) só aceitava os 6 nomes antigos de tema
      (`paper, sakura, obsidian, midnight, aurora, rose-gold`) — o client já usa 12 nomes novos
      desde o rebrand (`src/theme/theme.types.ts`: `paper, perola, floresta, lavanda, rosa, areia,
      noturno, carbono, cobalto, ametista, grafite, vinho`). Escolher qualquer tema que não seja
      "Paper" nunca persistia no servidor — o `AppearanceSyncBridge` ficava retentando pra sempre
      (write rejeitado → SDK reverte cache local → snapshot dispara de novo → retenta), inundando
      o console com `permission-denied` em TODA página (Dashboard, Análise, etc.), achado
      investigando um relato não relacionado ("orçamento de subcategoria não mostrou"/tela preta).
      Regra corrigida pra aceitar os 12 nomes atuais + teste de regressão novo em
      `tests/firestore.rules.test.ts` (rejeita nome antigo tipo `sakura`). 93/93 testes de regras
      verdes no emulador. **Deployado em produção** (`npx firebase deploy --only firestore:rules
      --project zerou-26757`, autorizado pelo dono) e verificado ao vivo: mutações antigas
      presas na fila do IndexedDB do cliente ainda geravam ruído por alguns reloads, mas
      confirmado com instrumentação que o loop parou de vez após o deploy.

### 2026-08-01 — Bug real: orçamento de subcategoria nunca aparecia na Análise

- [x] O orçamento de uma subcategoria (ex.: "Guloseimas" dentro de "Alimentação") sempre foi
      gravado certo no Firestore — o bug era só de EXIBIÇÃO: a lista/donut da Análise soma
      subcategoria no pai (`rollUpByParent`), então só o PAI vira uma linha; a expansão de
      subcategorias (`SearchPage.tsx`, dentro de `cat.children.map`) nunca olhava
      `budgetByCategoryId` pra elas — só a linha do pai tinha barra/%/limite. Corrigido: cada
      subcategoria na expansão agora mostra o mesmo `X% lim.` que a linha principal, verificado
      ao vivo com "Guloseimas" (orçamento pré-existente de R$100, 6% usado).

### 2026-08-01 — Redesenho da Análise

- [x] Hero visual (`.analysis-hero`), legenda do donut em classes CSS, "Compras parceladas em andamento" compactada (3 padrão)

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
