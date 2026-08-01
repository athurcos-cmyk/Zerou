# Pendências e roadmap — Granativa

Itens acionáveis. Fechou? Move para "Concluído" ou remove. Detalhe histórico vai para `../history/`.

## Abertas

### Segurança — auditoria 2026-07-19 fechada (2026-08-01)

Todos os 12 itens da auditoria de segurança de 19/07 foram resolvidos. Relatório completo em `~/Desktop/relatorio-auditoria-2026-08-01.md`. Resumo:

- [x] FIN-01/02/03 — Idempotência de pagamento (IDs determinísticos)
- [x] CLIENT-7 — Limpeza de localStorage no logout
- [x] CLIENT-3/4/SECRETS-4/5 — Headers de segurança (já estavam ok)
- [x] SECRETS-2 — defineString mantido (decisão do dono)
- [x] WHATSAPP-02 — Zod no payload do webhook
- [x] PERF-2/3 — Lazy load framer-motion (bundle 624→472 KB)
- [x] CLIENT-2 — CSP sem `'unsafe-inline'` (SHA-256) + `frame-ancestors`
- [x] AUTH-01 — Verificação de email (client-side)
- [x] AUTH-02/ADMIN-5 — Admin por custom claims
- [x] LACUNA-04 — Resolvido automaticamente pela migração pra claims
- [x] LGPD-01 — DPO → contato@granativa.com.br
- [x] LGPD-03/09/14 — DeepSeek nos Termos (decisão do dono)

**Não implementado da auditoria:**
- [ ] LGPD-02/04 — UI de export/portabilidade LGPD. Se um usuário pedir, rodar script manual via Admin SDK. Self-service fica pra quando houver checkout.
- [ ] LGPD-16 — Direito de oposição. Não implementado. Se for feito, precisa de `firestore.rules` + `test:rules` + deploy.

### Técnico — correções pendentes

- [ ] **⚠️ Push em dobro — NÃO RESOLVIDO** (2026-07-31). 3 tentativas, nenhuma resolveu. Hipóteses: check-then-write não-atômico no Cache Storage, ou redelivery na camada de transporte do Web Push. Ver `CLAUDE.md` e `docs/history/2026-07.md` para detalhe completo.
- [ ] **Remover diagnóstico `pushDebug`** — `writePushDebug` em `src/pwa/notifications.ts`, coleta em `accountDeletionService.ts`, e regra em `firestore.rules`. Já cumpriu o papel (achou o bug do cache), pode ser removido.
- [ ] **`recordRecurringPayment` usa `||` em vez de `??`** (`financeService.ts`): `opts.accountId || rule.accountId` — mesmo padrão que foi corrigido pra `??` em `payBill`. Inofensivo hoje (único caller normaliza `''` pra `undefined`); trocar quando mexer nessa função.
- [ ] **`sendBudgetAlerts` — verificar no log** que não há mais `FAILED_PRECONDITION` e que `budgetAlertState` funciona. Roteiro em `docs/RUNBOOK.md`.
- [ ] **Pacote compartilhado de lógica financeira pura** — `functions/src/shared/accountEffects.ts` é porta manual de `transactionAccountEffects`. Cada porta pode divergir. Infraestrutura de monorepo necessária. Não fazer agora; considerar se crescer ou divergir de novo.
- [ ] **`subscribeInvoices` limita a 24 faturas** — inalcançável hoje (app tem ~2 meses), mas anotado pra quando o app tiver 2+ anos de uso.
- [ ] **Code splitting** — bundle inicial > 500 kB (warning no build). Framer-motion já saiu (lazy). Resto: Recharts (já lazy no SearchPage), Firebase Auth SDK (difícil de separar).
- [ ] **App Check, backups do Firestore, alertas de custo** Firebase/Vercel.
- [ ] **Procedência dos logos de banco** — 26 dos 29 SVGs têm fonte divergente do script. Ver `public/bank-logos/SOURCES.md`.
- [ ] **Emails oficiais** — suporte@granativa.com.br, privacidade@granativa.com.br já existem no Cloudflare. Conferir se todos estão operacionais.

### Produto / UX

- [ ] **Vic + contexto de investimento** — total investido/rendimento no `buildFinancialContext.ts` (só app, nunca WhatsApp). Sem dar conselho sobre investimento. Parâmetro novo `includeInvestments`.
- [ ] **Contas `investment` legacy** — tipo `'investment'` já era selecionável antes da feature. Pode haver conta assim em produção. Ao subir, some do Saldo total e aparece vazia na aba nova.
- [ ] **18 registros órfãos `investmentValueUpdates`** — dados de teste, imutáveis por regra. Invisíveis na UI. Limpar via Admin SDK se importar.
- [ ] **`--chart-4` do tema escuro** (`#F9A825`) — fora da faixa OKLCH recomendada. É token global (`themes.css`), não só Investimentos. Não corrigido (fora de escopo).
- [ ] **Categoria com nome duplicado** — sem validação. Com subcategorias, nome duplicado é legítimo em ramos diferentes ("Água" dentro de Casa e Mercado). Qualquer validação futura precisa ser por escopo (único dentro do mesmo pai), não global.
- [ ] **Redesenho da Análise (`SearchPage.tsx`)** — mesmo diagnóstico do Cartão/Fatura (donut ~30 inline styles, 9 seções com mesmo peso visual). Usar `CardsPage.tsx` como referência de "hero calmo de lista". Cuidado com o bloco donut e a decisão sobre unificar "Recorrências previstas" + "Parcelas em andamento".
- [ ] **Revisar demais telas** com a mesma disciplina visual — sem lista fechada, avaliar conforme abrir.
- [ ] **Contas a Receber recorrente (Fase 2)** — "recebo aluguel todo dia 5". Plano: `RecurringRule` ganha `direction: 'payable' | 'receivable'`, lembrete muda copy, botão Registrar espelha `recordRecurringPayment` criando `income`. Mexe em `firestore.rules` + Cloud Function + deploy manual.
- [ ] **QA manual real no celular** — cadastro, login, onboarding, conta, transação, conta a pagar, cartão, fatura, casal, cofrinho, resgate.
- [ ] **Tendência por categoria — entrada pela fatia do donut** — tocar na fatia/legenda abre tendência. Baixa prioridade, zero custo de leitura.
- [ ] **Copy das páginas legais/ajuda** — dar a mesma voz do resto do app.
- [ ] **Separar WhatsApp em codebase próprio** — reduz cold start sem custo mensal. O contêiner atual carrega 17 functions (Stripe, Resend, automações). Codebase só dele carregaria só o que usa.
- [ ] **`CategoryTrendSheet` não rola pro pai** — abrir tendência de categoria agrupada mostra só gasto direto, enquanto Análise mostra total do grupo. Mesmo nome, números diferentes. Não é regressão (nunca foi rolado).

### Subcategorias — itens adiados (2026-07-29)

Feature entregue (2026-07-30, plano em `docs/planning/SUBCATEGORIAS.md`). Ficaram de fora de propósito:

- [ ] **Orçamento no pai somando as filhas** — decidir dupla contagem (orçamento no pai E na filha). Decisão de produto.
- [ ] **Roll-up no Resumo Anual e alerta de orçamento** — travado por teste de regressão (`[D9]`).
- [ ] **Vic criar subcategoria por WhatsApp** — filtro de pais deployado (2026-07-30), criar hierarquia continua fora.

### WhatsApp — Fase 2 (fora do escopo atual)

- [ ] Parcela em andamento antes do WhatsApp, antecipar, renegociar — hoje redireciona pro app (`out_of_scope`).
- [ ] Editar/excluir lançamento por mensagem — hoje orienta usar o app.

### Negócio / legal

- [ ] Revisão jurídica antes de escala pública maior.
- [ ] Billing real (Stripe) — só com decisão explícita de produto (hoje 100% gratuito).
- [ ] Rate limit da Vic quando tiver plano pago — 60 msg/dia generoso pra gratuito. Revisar se virar benefício de plano.

### Design / Acessibilidade — decisão de NÃO mexer

- [x] **Paleta de cor de categorias falha 2 checks de daltonismo** — decisão explícita do dono de não mexer (é a identidade visual do app). Deixado aqui pra não ser redescoberto do zero.

---

## Concluído (recente)

Itens abaixo foram entregues e estão aqui por referência. Detalhes em `docs/history/`.

### 2026-08-01 — Fechamento da auditoria de segurança

- [x] Auditoria 19/07 100% fechada (12/12). Relatório: `~/Desktop/relatorio-auditoria-2026-08-01.md`.
- [x] Idempotência de pagamento, limpeza de logout, verificação de email, admin por claims, Zod webhook, CSP hash, lazy landing, DPO.

### 2026-08-01 — Investimentos (parte 1 e 2)

- [x] Feature de Investimentos entregue: tracking em dois níveis (conta + investimento individual), cor por investimento, gráfico multi-linha em %, aporte/resgate, exclusão.
- [x] QA ao vivo do dono: 5 bugs reais corrigidos + gráfico redesenhado. Detalhe em `docs/history/2026-08.md`.

### 2026-07-31 — Push + exclusão de conta + admin

- [x] Push: causa raiz corrigida (escopo do SW), PWA-only decidido, cache corrigido. Push em dobro **continua** (ver Abertas).
- [x] Exclusão de conta: 4 resíduos corrigidos. Query `list()` em OR documentada no `CLAUDE.md`.
- [x] Admin: mensagens push/email individual e broadcast com histórico.

### 2026-07-30 — Subcategorias

- [x] Feature entregue: hierarquia 1 nível, pai como agrupamento puro, herança de cor/tipo, tela nova, tutorial, roll-up na Análise, Vic alinhada.

### 2026-07-28/29 — Análise + Comprometido + Vic

- [x] Data de lançamento com ordenação em 2 níveis (dia + instante). Convenção unificada (hoje = hora real, passado = meio-dia).
- [x] Análise em regime de competência (compra à vista no mês da compra).
- [x] Donut SVG puro (fim do Recharts travando), orçamento com % do limite, cards com ícone+expansor.
- [x] Exclusão de compra no cartão agora some de verdade da Análise (signedCharge). 15 tipos de ledger auditados.
- [x] "Acertar saldo com o banco" (AccountReconcileSheet). Pipeline de saldo à prova de perda de centavos.
- [x] Comprometido simplificado (sem corte por data, sem payday). Disponível removido. Projeção mantida.
- [x] Vic: WhatsApp só lança, app conversa. Data retroativa no WhatsApp. Modelo DeepSeek v4-flash.

### 2026-07-24/25 — Offline + cartão + dashboard

- [x] Auditoria offline-first completa. 8 telas corrigidas (LoadingState vs EmptyState).
- [x] Crash "FIRESTORE INTERNAL ASSERTION FAILED" — localStorage acumulava. Corrigido + autorrecuperação.
- [x] Dashboard não espera mais cartão sincronizar (cache separado).
- [x] Projeção do próximo mês (card novo). Salário previsto manual, toggle "contar saldo atual".
- [x] "Limite disponível"/"Fatura atual" atualizam na hora (client-side calculateInvoice).
- [x] Rede lenta não some mais com dados. LoadingState com consciência de `navigator.onLine`.
- [x] Fatura: "Compras"/"Créditos" pararam de inflar após excluir compra.
- [x] Gráfico da Análise não carrega ao abrir — mesmo bug de boot/cache, tela diferente.

### 2026-07-23 — Cartão de crédito (4 pendências + 3 bugs)

- [x] Editar compra (descrição/categoria, sem valor). Editar limite/nome do cartão.
- [x] Categoria e data em "compra parcelada em andamento" corrigidas.
- [x] `reverseCardPurchaseOnDelete` dobrava crédito de antecipação — corrigido.
- [x] IDs de estorno colidiam por truncamento — corrigido com hash.
- [x] Resumo Anual mostrava `__none__` e id cru de transação — corrigido.
- [x] "Compras" na fatura ordenava asc → desc.

### Anteriores (2026-07)

- [x] Hero visual do Dashboard aplicado em Cartão/Fatura/Cartões.
- [x] Cartão como forma de pagamento em Contas a Pagar.
- [x] Recorrência não debita mais sozinha (só avisa). Push de lembrete.
- [x] Emendas: boas-vindas/despedida/3d com logo e layout à prova de email.
- [x] Tendência de gasto por categoria (últimos 6 meses).
- [x] Contas a Receber Fase 1 (avulso).
- [x] Análise além de 300 transações (leitura por mês + Carregar mais).
- [x] Dashboard pinta do cache local no boot (fim do "pisca em branco").
- [x] Metas: histórico, retirada, exclusão com devolução.
- [x] Saldo de conta e total de fatura incrementais.
- [x] Projeção de Fluxo de Caixa removida. Patrimônio Líquido descontinuado.
- [x] WhatsApp integração oficial Meta Cloud API. DeepSeek extrai gastos.
- [x] Vic (assistente IA) no app. Rate limit 60 msg/dia.
- [x] Landing nova. Rebrand Granativa. Domínio `granativa.com.br`.
- [x] Cloudflare DNS + Email Routing. Políticas legais reescritas (21+16+7 seções).
