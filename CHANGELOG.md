# Changelog

Resumo das mudancas recentes. O historico detalhado por mes fica em `docs/history/`.

## 2026-07-21 — feat: Tendência de gasto por categoria (Análise)

Comparação mês a mês por categoria na Análise (ideia de um amigo do dono). Planejado e revisado com `/plan-eng-review` + `/plan-design-review` + `/frontend-design`. **Custo de leitura zero**: agrega em memória os 6 meses que a `SearchPage` já carrega — nenhuma query nova, nenhuma mudança em `firestore.rules`/functions/índices. Detalhes em `docs/history/2026-07.md`.

- **Novo `CategoryTrendSheet`** (`src/components/`), aberto por um ícone `LineChart` no header da Análise, já focado na categoria destacada no donut. Chips roláveis (radiogroup) → stat-herói em texto grande (média mensal + "este mês X% acima/abaixo") → gráfico de barras dos últimos 6 meses (mês atual "em andamento", linha da média) → maior/menor mês + total.
- **Mês parcial tratado com honestidade**: a média usa só os meses fechados (exclui o corrente); nada de projetar/estimar o mês cheio (postura anti-especulação, igual à Projeção de Fluxo apagada). Categoria com 0-1 mês de gasto mostra o que tem + aviso, não esconde.
- **2 funções puras** em `spendingAnalysis.ts`: `spendingByCategoryAcrossMonths` (reusa `spendingByCategoryForMonth`, então os números batem com o donut) + `computeCategoryTrend` (série, média dos fechados, veredito, maior/menor/total). 7 testes novos.
- **DRY**: `resolveCategoryColor` (duplicado em `SearchPage` e `AnnualSummarySheet`) extraído pra `src/theme/palette.ts`; as 2 cópias migradas.
- typecheck / test (366) / build verdes. Zero mudança de backend. **Verificado ao vivo** com 8 meses de dados de teste — a verificação pegou 3 correções (truncamento de card, max/min do mês parcial, rótulo cortado).

## 2026-07-21 — Infraestrutura: 14 correções de segurança, dados e resiliência

Maratona de 12h. 43 agentes de auditoria em 3 camadas (primária → secundária → terciária). 14 bugs corrigidos, 25 Cloud Functions no ar, 440 testes verdes. Detalhes em `docs/history/2026-07.md`.

- **Resiliência — try/catch em 5 loops de automação.** `closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendDailyLogReminder`, `sendBudgetAlerts` — cada iteração de loop agora tem try/catch individual. Um documento corrompido ou falha de rede não derruba mais a função inteira (antes, todos os documentos seguintes eram perdidos). Loga o erro e continua.
- **Segurança de dados — `adminDeleteUser` reestruturado.** Auth deletado ANTES do Firestore (antes era o contrário: se Auth falhasse, dados já tinham sido apagados). CommitDeletes agora retorna contagem real com try/catch por lote de 450. Todas as 7 etapas de coleta de dados com try/catch individual.
- **Segurança de autenticação — `sendGoodbyeEmail` agora exige login.** Antes, qualquer pessoa podia chamar a função e enviar email de "conta excluída" para qualquer endereço. Agora verifica `request.auth?.uid`.
- **Segurança de workspace — `cancelCoupleWorkspace` com verificação de tipo.** Antes, passando o ID do workspace pessoal, a função deletava todos os dados financeiros sem apagar a conta. Agora valida `type === 'couple'` antes de prosseguir.
- **Dados órfãos — 3 subcoleções adicionadas à lista de deleção.** `aiUsage`, `budgetAlertState` e `whatsappTransactionUsage` agora são varridas na exclusão de conta (cliente + admin). Antes, sobreviviam como dados fantasmas.
- **Dados órfãos — `cancelCoupleWorkspace` usa `recursiveDelete`.** Antes, deletava só o documento workspace com `batch.delete`, deixando TODAS as subcoleções órfãs. Agora é uma Cloud Function que usa Admin SDK para deletar a árvore inteira.
- **Segurança — WhatsApp com rate limit de 100 transações/dia.** Transação atômica no Firestore (sem TOCTOU). Ao atingir o limite, responde "Volte amanhã ou cadastre pelo app". Antes, era possível criar transações ilimitadas via WhatsApp.
- **Segurança — `forceLogoutAllDevices` ao excluir conta.** Revoga refresh tokens de todos os dispositivos antes de apagar os dados. Com `Promise.race` de 5s (nunca bloqueia a exclusão). Antes, o PC continuava ativo por até 1h após exclusão no celular.
- **Resiliência — `metaClient` propaga erros em vez de engolir.** `sendWhatsAppMessage` agora lança exceção em falha HTTP e rede. O webhook captura no try/catch global. Antes, erros eram silenciosamente ignorados.
- **Resiliência — `generateRecurrences` não causa mais leituras infinitas.** Regra sem `accountId` agora avança `nextOccurrenceAt` antes de pular. Antes, era relida todo dia para sempre (730+ reads/ano por regra).
- **Correção de fuso — `send3DayFollowUp` usa BRT, não UTC.** Query de "3 dias atrás" agora calcula no fuso America/Sao_Paulo com offset explícito -03:00.
- **Email — templates e infraestrutura.** `follow_up` adicionado como tipo legítimo (antes era substring frágil). `GenericEmail` cobre 4 tipos sem template. WhatsApp mencionado nos emails de boas-vindas e follow-up.
- **Retry — `deepseekClient` com retry habilitado para jsonMode.** Antes, chamadas com `jsonMode: true` (interpretação de mensagens WhatsApp) não faziam retry em 429/503.
- **5 índices compostos** no Firestore para queries de automação. Sem eles, 4 funções agendadas falhavam silenciosamente em produção.
- typecheck / test (440) / build verdes. 25/25 Cloud Functions deployadas.

## 2026-07-20 — Passada visual front-end (pré-lançamento): contraste, a11y, CSS, ARIA

## 2026-07-21 — Infraestrutura: emails transacionais (Resend), limpeza de dados órfãos, force logout

Segunda metade da maratona de pré-lançamento. Foco em backend e segurança de dados.

- **Emails transacionais com Resend.** Três templates (Welcome, Goodbye, FollowUp 3 dias) com identidade Granativa. `onUserCreated` (Firestore trigger), `send3DayFollowUp` (agendado diário), `sendGoodbyeEmail` (onCall). API key no Google Secret Manager. Domínio `granativa.com.br` verificado no Resend com DNS configurado no Cloudflare.
- **Limpeza de dados órfãos.** `dailyCleanup` (agendado 04:57 BRT): deleta workspaces couple abandonados (>7 dias sem partner), workspaces ghost (owner não existe mais), e `whatsappProcessedMessages` com >30 dias. 13 testes unitários. `cancelCoupleWorkspace` substituído por Cloud Function com `recursiveDelete` (antes deixava subcoleções órfãs). `aiUsage` e `budgetAlertState` adicionados ao `WORKSPACE_COLLECTIONS` nos dois codebases de deleção (cliente + admin).
- **forceLogoutAllDevices.** Nova Cloud Function revoga refresh tokens ao excluir conta. Resolve o bug onde o PC continuava ativo por até 1h após exclusão no celular, criando dados fantasmas. `Promise.race` com timeout de 5s — não bloqueia a exclusão se a CF estiver offline.
- **Firestore reset.** `scripts/resetAllData.mjs` — reset completo do banco (6 coleções zeradas). Firebase Auth preservado.
- **Docs atualizados.** CHANGELOG, SESSAO, BUSCA_RAPIDA, DESIGN, TODOS.
- typecheck / test (440: 359 client + 81 functions) / build verdes.

## 2026-07-20 — Passada visual front-end (pré-lançamento): contraste, a11y, CSS, ARIA

## 2026-07-20 — Passada visual front-end (pré-lançamento): contraste, a11y, CSS, ARIA

Fase final de polimento antes do lançamento. 21 commits na branch `frontend-design-2026-07`, mergeados direto na main. 30 agentes de auditoria + 5 meta-revisores + 4 skills de review. Zero alterações em `firestore.rules` ou `functions/` — sem necessidade de deploy Firebase. Mapa completo em `docs/design/DESIGN_VISUAL_ACHADOS.md`.

- **Contraste — 6 temas escuros corrigidos.** `--text-muted` clareado em noturno, carbono, cobalto, ametista, grafite, vinho para ≥4.5:1 AA. Bordas trocadas de hex escuro (invisível, ~1.1:1) para `rgba(255,255,255,0.08/0.13)`. `--action-primary-hover` do noturno clareado (#3789d9) para contraste ≥4.5:1 com `--text-inverse`.
- **Acessibilidade — focus indicators, ARIA, touch targets.** 4 inputs que tinham `outline: none` sem substituto ganharam `:focus-visible` com `outline: 3px solid var(--border-focus)`. ~20 grupos de botões mutuamente exclusivos convertidos de `aria-pressed` para `role="radiogroup"` + `role="radio"` + `aria-checked` (11 arquivos). 4 touch targets ajustados para ≥44px (WCAG 2.5.8). `role="alert"` no erro do Dashboard. `aria-describedby` no ForgotPasswordPage.
- **CSS — 280 linhas mortas removidas, durações padronizadas, tokens novos.** Classes não referenciadas (`.launch-*`, `.app-preview-*`, `.pricing-*`, `.cookie-banner`, etc.) removidas de `global.css` e `landing.css`. ~35 transições com valores mágicos (120ms, 140ms, 0.15s, 0.18s, 0.2s, 0.3s, etc.) substituídas por `var(--duration-fast/normal/slow)`. Tokens novos no `:root`: `--bg-input`, `--text-placeholder`, `--shadow-lg`, `--radius-md`. `.metric-card--accent` unificado (2 blocos → 1). `.form-accordion-toggle` extraído de 4× inline style duplicado.
- **Reduced-motion — boot + runtime.** `theme.storage.ts` agora consulta `matchMedia('(prefers-reduced-motion: reduce)')` quando não há valor salvo em localStorage. `ThemeRuntime` ganhou listener para mudanças em tempo real da media query.
- **Limpeza — token fantasma, classe fantasma, fonte inline.** `var(--brand-color)` inexistente no WhatsAppLinkPage trocado por `var(--action-primary)`. Classe `.amount-hero--expense` referenciada mas nunca definida removida do TSX. 4 `fontFamily` inline substituídos por `className="display-number"` (SOL-06).
- **Headings — AssistantPage e NetWorthPage.** `AssistantPage` ganhou `className="page-title page-title--compact"` no h1. `NetWorthPage` corrigido (faltava classe base `page-title`).
- typecheck / test (359) / build verdes. Health score 10/10.

## 2026-07-20 — Bugs: exclusão de conta (dado órfão), recorrente duplicada, mensagens WhatsApp

Três correções antes da fase de front-end. Client (as duas primeiras) já no ar via Vercel; a de WhatsApp é functions e precisa de deploy manual.

- **Exclusão de conta + login Google não gera mais dado órfão (crítico).** Excluir a conta usando só Google podia deixar uma conta nos dados do app sem usuário no Firebase Auth (inconsistência Auth×Firestore). Causa: `AuthContext.finishBoot` restaura o usuário do cache quando o `onAuthStateChanged` dispara null — proteção offline correta pra queda de rede, mas a exclusão também dispara null e ressuscitava um "usuário-zumbi" (uid deletado) que o onboarding usava pra gravar. Correção em camadas: `authSession.ts` (sinal de sign-out intencional), `authService` (marca o sinal + limpa cache antes do `deleteUser`), `finishBoot` (null intencional desloga limpo, offline segue protegido), `ensurePersonalFoundation` (backstop: só grava com sessão Auth viva pro mesmo uid) e `LoginMethodsPage` (fallback com `clearLocalCache`). Fecha AUTH-03/AUTH-07 da auditoria. Regressão coberta em `src/workspaces/workspaceService.test.ts`.
- **Conta recorrente não duplica mais em avulsas.** `BillsPage` criava a regra em `recurring` E um bill avulso na hora; a ocorrência já vira transação quando vence (idempotente), então o bill imediato era um registro extra e errado. A recorrente agora vive só na seção "Recorrentes".
- **Mensagens do WhatsApp** ("não tem conta cadastrada" / transferência) reescritas pra deixar claro que falta uma conta **financeira** (carteira/banco), não uma conta de login no app. Deployado (`whatsappWebhook`).
- **Exclusão de conta Google mais suave:** reautenticação usa `login_hint` na conta atual (o Google abre apontado, confirma e fecha sozinho, sem seletor forçado nem `user-mismatch`); ao fechar o popup, mensagem tranquilizadora ("nada foi excluído") em vez de erro técnico. A janela de confirmação é exigência do Google/Firebase, não dá pra remover.
- **Preparo da fase front-end/design (pré-lançamento):** auditoria do estado real do plano v2 no código (várias coisas já feitas — ver `docs/planning/TODOS.md`), prompt de execução pro DeepSeek (passada visual ao vivo, temas escuros incluídos) e TODOS atualizado com o que sobrou.
- typecheck (client + functions) / test (359) / build verdes.

## 2026-07-19 — Meta-auditoria de seguranca (Camada 3): consolidacao de 26 relatorios

Auditoria final que consolida e audita 16 dominios da Camada 1 + 10 revisoes da Camada 2 da auditoria de seguranca 2026-07-19. Documento em `docs/security/auditoria-2026-07-19/meta-auditoria.md`.

- **Duplicatas eliminadas**: 8 grupos de duplicatas identificados (ex.: dangerouslySetInnerHTML reportado em 4 dominios, HMAC em 3, dados ao DeepSeek em 5).
- **Inconsistencias de severidade**: 7 subestimacoes corrigidas (PERF-4 de Media para Alta, WHATSAPP-04 de Alta para Critica, GRAZI-3/5 de Media para Alta, etc.) e 2 superestimacoes rebaixadas (AUTH-03 de Alta para Media, AUTH-06 de Media para Info).
- **7 lacunas globais** identificadas (testes automatizados, supply chain, disaster recovery, monitoramento, governanca de dados, seguranca fisica) — nenhuma coberta por C1 ou C2.
- **Ranking de qualidade**: LGPD (9), Auth/Grazi/WhatsApp C2 (9), UX C1 (5). A estrutura de 2 camadas se mostrou eficaz — C2 agregou valor real em todos os dominios.

## 2026-07-19 — Fatura: espaçamento das seções avançadas + auditoria da lógica (antecipar/estornos)

As duas seções colapsáveis do fim da fatura ("Antecipar parcelas de faturas futuras" e "Estornos,
créditos e tarifas") estavam **coladas** — `.advanced-panel` tem margem 0 e, com o mesmo
`bg-surface-subtle`, as bordas encostavam e viravam um bloco só.

- **Espaçamento** (`src/pages/InvoicePage.tsx` + `src/styles/global.css`): modificador `.invoice-page`
  dá `margin-top: 1rem` nos painéis (separa os dois **e** o primeiro do card acima) + entre
  Compras/Pagamentos quando ambos aparecem. Escopado na página: o `.advanced-panel` de outras telas
  vive em form com `gap` próprio e não pode ganhar margem à toa. Zero impacto fora da fatura.
- **Auditoria da lógica (código + dados) — sem bug, nada mudou no código.** Os 14 valores de
  `InvoiceLedgerEntryType` estão em sincronia nos **três** lugares: enum TS, `validInvoiceLedgerEntryType`
  (`firestore.rules`) e o bucketing da Cloud Function (`functions/src/cards/invoiceTotals.ts`). Saldo da
  fatura confere (`compras + tarifas − pagamentos − créditos`); a antecipação se anula na fatura de
  origem e passa a pesar na atual. O "terceiro ponto de sincronia" (a Cloud Function, que `git push`
  não reimplanta) ficou registrado na REGRA PRINCIPAL de enums do `CLAUDE.md`.
- typecheck / test (357) / build verdes.

## 2026-07-19 — Contas a Receber (Fase 1: avulso) — espelho do Contas a Pagar

Feature nova pedida pelo dono: anotar dinheiro a receber (quem te deve, freela pendente,
reembolso, racha de conta). Plano em `docs/planning/CONTAS_A_RECEBER.md`.

- **Coleção `receivables` SEPARADA** (não campo em `bills`) — decisão de arquitetura chave: o
  cálculo de saldo/Disponível/Comprometido **nunca** lê essa coleção, então um "a receber" é
  **impossível** de inflar o número por acidente. Dinheiro a receber só vira dinheiro ao marcar
  "recebido" (cria uma **receita** de verdade na conta escolhida, via `markReceivableReceived` —
  espelho de `payBill`). Mantém o número honesto, o valor nº1 do dono.
- `ReceivablesPage` (`/app/receivables`, nav sidebar + mobile): anotar (descrição, valor, de quem,
  previsão, conta), "Recebi" (escolhe a conta), cancelar (com confirmação). Atrasados marcados
  automático (`markOverdueReceivables`, espelho de `markOverdueBills`).
- **Dashboard**: seção "Próximos a receber" **no fim** da tela, só o que vence em **≤5 dias** e
  totalmente fora de qualquer total de saldo (pedido do dono, pra não dar ilusão de dinheiro).
- `firestore.rules`: `validReceivableCreate/Update` + `match /receivables` (a regra nº1 — coleção
  nova + teste real no emulador, 55/55). **Precisa de deploy das regras** pra funcionar em produção.
- Só **avulso** nesta fase; **recorrente** virou TODO/Fase 2 (mexe em Cloud Function + `RecurringRule`
  compartilhado). `typecheck`/`test` (357/357)/`test:rules` (55/55)/`build` limpos.
- **Polimento visual** (design pass) pra casar com o capricho das outras telas: o cabeçalho
  colapsável ganhou o chevron que rotaciona ao abrir (igual Contas a Pagar — antes não tinha
  affordance de "abre"), cada linha ganhou o ícone-tile de receita, form + lista foram pro
  `finance-grid` (respiro entre os cards no mobile, antes colados; 2 colunas no desktop), botões da
  linha no peso subtle/ghost em vez de primary "gritando", e a meta-linha deixou de ter um `<span>`
  aninhado que viraria bloco por `.list-row span`. Só visual, sem mudança de dado/fluxo.

## 2026-07-19 — Pull-to-refresh bloqueado via JS cirúrgico (✅ confirmado no celular do dono)

O PWA instalado no Android **tem** pull-to-refresh (o dono confirmou com print — não some só por
estar instalado, como eu tinha suposto errado). Depois da 1ª tentativa via CSS ter travado o scroll
(ver entrada abaixo), agora via JS **cirúrgico** (`src/pwa/preventPullToRefresh.ts`, chamado no
`main.tsx`): um listener de `touchmove` só cancela o gesto quando **três** coisas valem ao mesmo
tempo — a página está no topo (`window.scrollY <= 0`), o dedo vai pra baixo, **e** nenhum ancestral
rolável sob o dedo tem `scrollTop > 0` pra consumir o puxão. Ou seja, só o overscroll real do
documento vira refresh e é cancelado; rolar a tela (dedo pra cima, ou fora do topo) **e rolar dentro
de um BottomSheet** nunca são tocados. `window.scrollY`/`scrollTop` são confiáveis independente de
qual elemento rola (evita a ambiguidade que quebrou o CSS).
- Achado no processo (antes de ir pro dono): a 1ª versão do guard bloquearia o scroll pra cima
  DENTRO de um sheet aberto — corrigido com a checagem de ancestral rolável (`pullCanBeConsumed`).
- **Confirmado ao vivo pelo dono no Android**: refresh bloqueado, scroll normal e scroll dentro de
  sheet intactos. `typecheck`/`build` limpos.

## 2026-07-19 — REVERTIDO: bloqueio de pull-to-refresh travava o scroll no celular

`overscroll-behavior-y: contain` em `html, body` (adicionado mais cedo hoje pra bloquear o "puxar
pra recarregar") **travou todo o scroll no mobile** — dava pra clicar, mas não rolar a tela.
Deveria ser inofensivo pro scroll (é o uso padrão da propriedade), mas interagiu mal com o
`overflow-x: hidden` do body + o modelo de scroll do documento no navegador mobile real, que não
reproduzi no preview de desktop. **Revertido por completo** (`global.css`) — restaura o estado que
funcionava. O gesto nativo de pull-to-refresh fica como está (o flash que ele causava já foi
minimizado pelo cache do Dashboard). Nota de "não tentar de novo assim" em `docs/design/DESIGN.md`.

## 2026-07-19 — Dashboard e alerta de orçamento batem com a Análise mesmo com +300 no mês (Fase 3)

Terceira e última fase do plano `docs/planning/HISTORICO_TRANSACOES.md`, fechando a limitação da
janela de 300. O "Resumo de gastos" do Dashboard e o banner de orçamento calculavam das 300 do
boot — então, se alguém fizesse +300 lançamentos **no mês corrente**, subcontavam (a Análise não).

- Hook compartilhado `useCompleteCurrentMonth` (`useMonthlyTransactions.ts`, DRY): usado pelo
  Dashboard ("Resumo de gastos" + variação vs. mês passado) e pelo `BudgetAlertBanner`.
- **Detecção esperta e barata**: só carrega o mês atual (+ anterior no Dashboard) completo **se** a
  janela de 300 está cheia **E** a mais antiga carregada é do mês atual (sinal de transbordo). Pra
  todo mundo com ≤300 (todos hoje), **custo ZERO** — nenhuma leitura extra no boot.
- Fecha a inconsistência com a Análise sem cobrar leitura por abertura do Dashboard de todos. 3
  testes novos. `typecheck`/`test` (355/355)/`build` limpos.
- **A limitação das 300 transações está resolvida por completo** (Análise por mês + "Carregar mais"
  em Transações + Dashboard/banner do mês atual).

## 2026-07-19 — Transações: "Carregar mais" pra ver histórico antigo (Fase 2)

Segunda fase do plano `docs/planning/HISTORICO_TRANSACOES.md`. A lista de Transações mostrava só
as 300 mais recentes, sem como ver as mais antigas. Agora tem paginação sob demanda.

- `loadMoreTransactions` (`financeService.ts`): busca a próxima página de 50 transações mais
  antigas via `getDocs` com cursor por **DocumentSnapshot** (um `getDoc` da âncora — robusto contra
  empate de data, ao contrário de cursor por valor). Leitura pontual, não tempo real.
- `TransactionsPage`: as 300 do boot seguem ao vivo; botão **"Carregar mais"** anexa páginas de 50
  antigas (união por id, sem duplicar na fronteira). Página incompleta = fim do histórico. Offline
  sem cache → aviso pra reconectar (não marca "fim" à toa).
- ~50 leituras por toque, só quando a pessoa pede. **Sem índice novo** (ordena por `date`, já
  indexado). 2 testes novos. `typecheck`/`test` (352/352)/`build` limpos.
- Fase 3 (Dashboard/banner do mês atual, borda extrema) segue deferida.

## 2026-07-19 — Análise correta além de 300 transações (Fase 1: leitura por mês)

Primeira fase do plano `docs/planning/HISTORICO_TRANSACOES.md` (travado com `/plan-eng-review`).
A Análise e o resumo anual **subcontavam** meses/anos de quem passa de 300 transações, porque
calculavam filtrando só as 300 mais recentes carregadas no boot. Agora leem o histórico **por
mês, sob demanda**. Detalhes em `docs/history/2026-07.md`.

- `subscribeTransactionsForMonths` (`financeService.ts`): assina as transações de um conjunto de
  meses — 2 queries `in` (por `cashMonth`/`competenceMonth`, mescladas por id) **sem limite**, então
  um mês com >300 vem inteiro. Novo hook `useMonthlyTransactions` (sob demanda, mesma proteção
  anti-piscar dos outros hooks).
- `SearchPage` (Análise) e `AnnualSummarySheet` (resumo anual, 12 meses do ano sob demanda) passam
  a agregar sobre a **união** das 300 do boot + os meses completos carregados. Durante o
  carregamento mostram o resultado das 300 (sem flash vazio) e refinam pro completo.
- **Sem regressão pra quem tem ≤300 transações**: a união = as 300 (o histórico inteiro cabe na
  janela) → resultado idêntico ao de hoje. Só corrige quem passa de 300.
- Offline: mês já aberto online funciona offline (cache); nota sutil quando offline. Sem aquecedor
  proativo (decisão de custo — só lê o que a pessoa olha). **Zero mudança em `firestore.rules` e
  índices** (leitura já é por membro; campos string auto-indexados — verificado no código).
- Helper `dedupeById` extraído (DRY, 3 usos). 9 testes novos. `typecheck`/`test` (350/350)/`build`
  limpos. Verificação ao vivo do caso >300 depende de volume que ninguém tem ainda (~2 meses de app).
- **Falta**: Fase 2 ("Carregar mais" em Transações). Fase 3 (Dashboard/banner do mês atual) deferida.

## 2026-07-18 — Bloqueio do "puxar pra recarregar" (pull-to-refresh) no mobile

Decisão de produto (pedido do dono): o app é offline-first e sincroniza sozinho, então o
pull-to-refresh do Chrome Android só servia pra reiniciar o app à toa e reexibir o boot de
1-2s (o "pisca"). Contexto: cold-open sempre cai no Dashboard (já sem flash) e navegar entre
telas nunca pisca — o único jeito de piscar era dar refresh parado numa tela.

- `src/styles/global.css`: `overscroll-behavior-y: contain` em `html, body`. Mata a recarga
  por arrasto e o scroll-chaining pra fora, mantendo o scroll normal.
- **Não** bloqueia reload pelo botão do navegador / F5 / Ctrl+R, nem o cold-start.
- Escopo global (app + landing). Efeito concentrado no Chrome Android em aba de navegador —
  PWA instalado geralmente já não tem o gesto e o iOS Safari não recarrega por arrasto.
- Gesto de toque: não verificável no preview de desktop (validar no celular). Build limpo.
- A "etapa 2" (cache das outras telas via seed no núcleo) foi **arquivada de propósito**:
  ganho estreito (só refresh-na-tela) não justifica o risco de mexer em `useFinanceData`/
  `useCardsData` + serializar `Timestamp` do Firestore. Raciocínio em `docs/history/2026-07.md`.

## 2026-07-18 — Dashboard 100% offline: as listas também pintam do cache (fim do "pisca em branco")

Continuação do `dashboardSummaryCache` (que só cobria os 3 números do topo), a pedido do
dono — a sensação de "app sempre carregando" ao abrir a conta, pior no celular onde a
maioria vai usar. Detalhes técnicos e risco residual em `docs/history/2026-07.md`.

- Ao abrir, "Resumo de gastos", "Próximos compromissos" e "Transações recentes" apareciam
  em branco por 1-2s (o dado já está no cache do Firestore, mas ler o IndexedDB de volta no
  boot frio custa no celular). Os 3 números do topo já não piscavam porque tinham cache
  síncrono; as listas não tinham — era só estender o mesmo padrão.
- `dashboardSummaryCache.ts` → `dashboardViewCache.ts` (v2): guarda também uma foto
  denormalizada das 3 listas por workspace. No boot pinta do cache na hora; quando o dado
  real chega, troca sem piscar (quase sempre idênticos). Só acelerador de exibição — a fonte
  real continua sendo o cache do Firestore + os listeners.
- Marca (ícone+cor) pré-resolvida na gravação pra bater com o render ao vivo; datas via ISO;
  validação defensiva descarta cache corrompido/formato antigo e cai pro dado ao vivo.
- **Mesma classe de bug no guia "Comece em poucos minutos"** (achado pelo dono ao dar
  refresh): ele era decidido pelo dado ao vivo, que começa vazio no boot, então piscava
  mesmo numa conta já usada. Agora só aparece depois que finanças+cartões resolveram.
- **Legendas do Disponível/Comprometido e a variação "% vs. mês passado" também no cache**
  (pedido do dono): a legenda do Comprometido trocava "Contas e fatura." → "Considerando…"
  e a do Disponível mostrava "Carregando…"; a variação só aparecia depois de carregar.
  Agora as três vêm resolvidas do cache no boot, sem piscar nem trocar de texto.
- 2 arquivos de teste novos (round-trip do cache + render do Dashboard). **Verificado que os
  testes de render falham sem a correção.** `typecheck`/`test` (341/341)/`build` limpos.

## 2026-07-18 — "Disponível"/"Comprometido" ainda piscavam no celular (causa diferente do fix anterior)

Achado pelo dono com print, ao vivo no celular (PWA instalado e navegador mobile — nunca no
desktop), mesmo depois do fix de mais cedo no dia. Causa raiz completa em
`docs/history/2026-07.md`.

- Depois que os cartões carregavam com sucesso, um soluço de rede (comum em dados móveis)
  fazia o Firestore chamar erro de novo no MESMO listener — e o código tratava isso como a
  primeira tentativa, jogando a tela de volta pra "Carregando..." mesmo com dado bom na
  tela. Repetia a cada soluço (o "pisca 4-5 vezes" relatado).
- Achado revelador: uma variável `resolved` existia em `firestoreRetry.ts` mas nunca era
  usada — proteção que alguém começou e não terminou (`useFinanceData.ts` já tinha a
  versão certa disso). Foi descartada como "código morto" no fix de mais cedo no dia, sem
  perceber que era inacabada, não descartável.
- `subscribeWithTransientRetry` ganhou um `markLoaded()` que o consumidor chama ao receber
  o primeiro dado bom — erro depois disso no mesmo listener é ignorado silenciosamente.
- **Aplicado nos outros 5 hooks no mesmo dia** (pedido do dono, depois de confirmar o fix):
  `useGoalContributions.ts`, `useInvoiceLedger.ts`, `useCoupleSavings.ts`,
  `useSharedWorkspaceData.ts`, `useGoalsData.ts` — cobre metas, cofrinho do casal, espaço
  compartilhado e fatura detalhada, os mesmos 9 pontos de assinatura.
- 1 teste novo, verificado que falha sem a correção. `typecheck`/`test` (332/332)/`build`
  limpos.

## 2026-07-18 — Grazi ajuda a pensar em decisão financeira grande (app); WhatsApp redireciona

Preocupação do dono, motivada por feedback real de uma amiga que testou o app: pessoas vão
usar a Grazi pra tomar decisão de verdade, então o aconselhamento importa. Detalhes e
racional completo em `docs/whatsapp/WHATSAPP.md` e `docs/ai/GRAZI.md`.

- Grazi do app, ao ser perguntada sobre decisão financeira grande (empréstimo,
  financiamento, investir reserva, renegociar dívida), agora faz 1-2 perguntas objetivas
  com os dados reais da pessoa pra ajudar a pensar — em vez de só dar veredito pronto ou
  mandar procurar um profissional.
- Decisão explícita do dono: **não levar isso pro WhatsApp** — esse tipo de conversa
  precisa de histórico (ida e volta), que o WhatsApp nunca teve. Novo intent
  `advisory_decision` reconhece a pergunta e redireciona pro app, sem gastar chamada de IA.
- Achado no processo: já existe disclaimer forte sobre isso nos Termos de Uso (seção 9),
  mas nunca aparecia na conversa — a regra nova é o reforço comportamental que faltava.
- **Refinamento (mesmo dia)**: regra de "não sugerir produto específico" ficou absoluta —
  nunca nomeia banco/cartão/investimento, **mesmo se a pessoa pedir direto** (app não é
  patrocinado por nenhuma marca). Decisão de cartão novo/anuidade entrou no mesmo
  tratamento de "ajuda a pensar" do empréstimo. **Investimento ganhou regra própria e mais
  rígida**: nenhuma análise de produto/estratégia, nem as perguntas de reflexão — só
  redirecionamento caloroso pra profissional licenciado, já que é atividade regulamentada.
  WhatsApp espelha a regra de produto e passou a redirecionar pro app também em pergunta
  de cartão novo/anuidade e qualquer pergunta de investimento (antes só pegava "investir
  reserva").
- `functions build`/`test` (67/67) limpos em ambas as rodadas. **Deployado e verificado ao
  vivo três vezes no app real**: empréstimo (perguntou de volta, usou dados reais, só
  mencionou profissional no fim), cartão com anuidade (mesmo padrão, sem nomear banco),
  investimento (recusou analisar, redirecionou pra profissional, mas seguiu ajudando a
  pensar no tamanho da reserva). Pergunta rotineira continuou respondida direto nas três
  rodadas — regra não dispara fora do escopo. **Ponta do WhatsApp ainda não testada com
  mensagem real** — depende do dono mandar uma mensagem de teste pro número vinculado.

## 2026-07-18 — "Disponível"/"Comprometido" podiam piscar um valor errado por um instante

Preocupação do dono: o app não pode dar a sensação de estar sempre carregando. Achado
concreto: `useCardsData.ts` marcava "carreguei" assim que a lista de cartões chegava, sem
esperar as faturas — que é o dado que efetivamente abate o Disponível. Por um instante o
Dashboard mostrava um valor inflado (fatura ainda não descontada) e corrigia logo em
seguida. Detalhes técnicos e verificação em `docs/history/2026-07.md`.

- `src/cards/useCardsData.ts`: `loading` só vira `false` quando cartões e faturas de todo
  cartão ativo já resolveram (sucesso, erro ou timeout de 2.5s). `DashboardPage.tsx` já
  usava esse `loading` corretamente — passa a funcionar certo sem mudança lá.
- Graças ao cache já existente (`dashboardSummaryCache`), quem já tem dados nem percebe
  diferença: o último número certo continua na tela enquanto isso resolve em segundo
  plano, geralmente idêntico ao valor final.
- 1 teste novo, verificado que falha sem a correção. `typecheck`/`test` (331/331)/`build`
  limpos. Testado ao vivo com conta real com cartão e fatura.

## 2026-07-18 — Conta nova ficava presa em "não foi possível carregar cartões" (fix)

Achado pelo dono (`/investigate`): logo depois de criar conta, o app podia ficar preso numa
mensagem de erro permanente. Raiz: o onboarding libera a UI de propósito antes do servidor
confirmar a criação do workspace (fix de rede fraca já existente), e o retry que cobria essa
janela desistia depois de só ~8.2s — curto demais pra rede realmente lenta. Detalhes técnicos
completos, incluindo verificação de que o teste falha sem a correção, em
`docs/history/2026-07.md`.

- `src/firebase/firestoreRetry.ts` e `src/finance/useFinanceData.ts`: depois de esgotar o
  backoff rápido, continuam tentando num intervalo sustentado (10s) em vez de desistir de
  vez. Erro aparece uma vez; se resolver depois, o próprio sucesso limpa a mensagem sozinho.
- Corrige automaticamente os 6 hooks que usam esse retry compartilhado (cartões, dados
  financeiros, metas, cofrinho do casal, espaço compartilhado).
- 5 testes novos, incluindo verificação de que falham sem a correção. `typecheck`/`test`
  (330/330)/`build` limpos.

## 2026-07-18 — WhatsApp: conta principal + transferência entre contas

Corrige um problema real relatado pelo dono: com mais de uma conta cadastrada, a Grazi no
WhatsApp debitava/creditava numa conta escolhida arbitrariamente e não sabia transferir
entre contas. Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

- Nova **conta principal** (`Account.isPrimary`, botão estrela em Configurações > Contas) —
  fallback quando a mensagem não deixa clara a conta.
- `interpretMessage.ts` agora casa o **nome da conta citada na mensagem** ("gastei 30 no
  mercado itaú") contra a lista de contas do workspace, igual já fazia com categoria.
- Resolução em 3 níveis (nome citado → conta principal → conta única → bot pergunta),
  reaproveitando o mesmo padrão de pergunta numerada com TTL já usado pra escolher cartão.
- Novo intent **`transfer`** ("transfere 100 do nubank pro itaú") — resolve os dois lados
  independentemente, pergunta só o que faltar (um lado ou os dois).
- `pendingCardAction.ts` generalizado em `pendingAction.ts` (suporta as 3 perguntas
  pendentes); achado no processo e corrigido: a comparação de nome não era
  acento-insensível ("itau" não batia com "Itaú").
- `firestore.rules` atualizada (`isPrimary` em `accounts`) e testada (`npm run test:rules`,
  54/54). Suite de functions foi de 48 pra 67 testes.
- **Deployado em produção** (`firestore.rules` + `whatsappWebhook`, autorizado pelo dono) e
  verificado ao vivo: marcar conta principal persiste de verdade, sem erro.

## 2026-07-18 — Mobile com cara de app nativo: extrato por dia, sheet de detalhe, swipe nas sheets, menu novo

Auditoria de UX mobile (375px) com debate entre dois agentes (designer propôs, crítico
verificou cada alegação no código) e implementação dos 9 itens aprovados. Detalhes e
vereditos em `docs/history/2026-07.md`.

- **Extrato agrupado por dia** com header sticky ("Hoje/Ontem/12 jul") e líquido do dia;
  total some sob busca textual (senão o subtotal parece bug). `overflow-x` do `.app-main`
  mobile virou `clip` (era `hidden`, que mata `position: sticky` dos descendentes).
- **Linha de transação virou alvo de toque único**: Editar/lixeira saíram da linha e
  vivem num sheet de detalhe (`BottomSheet`) — destrutivo a dois toques, linha limpa.
- **`BottomSheet` ganhou swipe-to-dismiss** (drag restrito a grabber/header, threshold de
  8px preserva cliques; flick rápido também fecha) — todas as sheets do app herdam.
- **Menu mobile migrou pro `BottomSheet` base** em duas zonas: tiles "Ir para" (6 destinos,
  ícone em cima) e lista "Sua conta" — corrige o desalinhamento do grid antigo e o ícone
  "sumido" do Compartilhado.
- **Dashboard mobile**: só "Lançar agora" some (o FAB já cobre); Contas, Cartões,
  Compromissos e Metas continuam com atalho, em grid 2x2 mais compacto que o do desktop.
  (Primeira versão tinha removido Contas/Cartões também — corrigido no mesmo dia após
  o dono notar que sumiram do menu principal.)
- **Lançamento**: autofocus no valor (corta um toque do fluxo mais usado) e CTA "Salvar"
  sticky acima da bottom nav (nova var `--bottom-nav-space`, antes 5.75rem hardcoded).
- **Transações**: "+ Nova" oculto no mobile (FAB já cobre), placeholder curto, chips de
  filtro compactos em trilho horizontal com "Filtros" primeiro (carrega o contador de
  estado) — tamanho reduzido depois que o dono flagrou os últimos chips cortados fora da
  viewport em 375px. Linha do extrato ficou mais baixa (isenta da regra antiga que
  quebrava valor pra segunda linha, criada quando a linha ainda tinha botões inline).
- Proposta "Lança e vai" (captura relâmpago por long-press no FAB) **não implementada** por
  decisão do dono — spec salva em `docs/planning/LANCA_E_VAI.md` pra avaliação futura.

## 2026-07-18 — Landing: CTA do menu parava de implicar plano pago + "Entrar" sumia no celular

Dois ajustes pontuais na landing, achados numa revisão de design/frontend a pedido do
dono.

- **Botão do menu "Começar grátis" → "Começar agora"**: o dono notou que "grátis" colado
  no verbo dá a entender que é grátis só pra começar (like um trial), quando o produto é
  100% gratuito, sem plano nenhum. Os outros dois CTAs da página (hero e final) já
  evitavam esse problema com copy orientada a benefício; só o do menu destoava. A
  reafirmação "Grátis · sem cartão de crédito" continua exatamente onde já estava (nota
  do hero, nota do CTA final, faixa de stats "R$0 pra sempre").
- **"Entrar" desaparecia por completo abaixo de 480px** (achado pelo dono testando no
  próprio celular): a única forma de logar a partir da landing some no mobile — não
  existe outro link de login em nenhum lugar da página, nem no rodapé. Corrigido
  encolhendo os dois botões e a logo nesse breakpoint (em vez de esconder "Entrar"),
  verificado ao vivo em 375px e 320px sem overflow.

## 2026-07-18 — Fatura de cartão travava "Aberta" além do fechamento + parcela única aparecia como antecipável

O dono achou os dois bugs ao vivo, direto na fatura de julho: badge "Aberta" numa fatura
que já devia estar fechada, e "Restaurante"/"Farmácia" (compras à vista, sem parcela)
aparecendo na lista de "antecipar parcelas de faturas futuras".

- **Fatura só fechava via Cloud Scheduler diário** (`closeInvoicesDue`), que só roda
  no dia exato do fechamento de cada cartão — uma compra lançada com data retroativa (ou
  o scheduler falhando um dia) deixava a fatura presa em `open` por até um mês, com o
  botão errado ("Antecipar fatura" em vez de "Pagar fatura"). Existia até uma função
  `closeInvoice` pronta pra corrigir isso, mas sem nenhum lugar que a chamasse. Nova
  função `markClosedInvoices` fecha isso no cliente — mesmo padrão que `markOverdueBills`
  já usa pra contas a pagar: roda a cada snapshot de fatura, silenciosa, sem UI.
- **Compra à vista virando "antecipável"**: o filtro de parcelas futuras (`anticipation.ts`)
  não checava se a compra realmente tinha mais de uma parcela — qualquer compra que
  rolasse pra uma fatura futura (por ter sido feita depois do fechamento) entrava na
  lista. Corrigido: só entra quem tem `installmentTotal > 1` ou aparece mais de uma vez
  no ledger do cartão (cobre compra parcelada antiga, de antes desse campo existir).
- `/code-review` no próprio fix achou uma regressão: o fechamento estava ancorado ao
  meio-dia do dia de fechamento em vez do dia inteiro — uma compra à tarde nesse mesmo
  dia cairia numa fatura já marcada fechada horas antes da hora. Corrigido pra comparar
  por dia inteiro.
- Testado ao vivo o cenário pedido pelo dono: antecipar uma parcela cuja fatura de
  origem só tinha aquele lançamento faz a fatura de origem sumir do histórico — comportamento
  por design (`invoiceHasVisibleActivity`), não bug.
- Achado e **deixado documentado, não corrigido**: `subscribeInvoices` limita a 24
  faturas por cartão — em teoria uma compra parcelada muito antiga (de antes do campo
  `installmentTotal` existir) num cartão com 24+ faturas acumuladas poderia ficar de
  fora da antecipação. Sem impacto hoje (app só existe há ~2 meses, nenhum cartão chega
  perto de 24 faturas). Ver `docs/planning/TODOS.md`.
- Detalhes em `docs/history/2026-07.md`.

## 2026-07-18 — Metas ganham histórico por contribuição, retirada de valor e exclusão com devolução

O dono testou a fundo e trouxe 4 pontos reais sobre Metas: sem histórico por meta, sem
como retirar valor (só "Corrigir", que nunca mexia em conta nenhuma), exclusão de meta
nunca devolvia o dinheiro guardado (nem pedia confirmação), e uma suspeita de bug na
criação que não se confirmou ao testar ao vivo.

- **Depósito e retirada agora simétricos** (`contributeToGoalWithTransaction`): os dois
  podem mexer numa conta de verdade (débito no depósito, crédito na retirada) ou só
  corrigir o progresso ("Só registrar"). Bloqueia no formulário se a retirada passar do
  que a meta tem guardado.
- **Nova tela `/app/goals/:goalId`** com o histórico de cada meta — data, tipo
  (guardado/retirado) e conta envolvida.
- **Excluir meta com escolha**: meta de economizar com saldo > 0 agora pergunta —
  devolver pra uma conta escolhida ou deixar sumir. Meta de dívida (ou sem nada
  guardado) só pede confirmação simples — antes não pedia nenhuma.
- `firestore.rules` ganhou `accountId` opcional em `goalContributions` (já publicada em
  produção) e uma correção de robustez em `findNextIncomeDate` (não excluía retirada de
  meta/cofrinho do cálculo de "próximo recebimento").
- Verificado ao vivo, contra o banco de produção: depósito/retirada com conta escolhida
  moveram o saldo certinho, exclusão com devolução creditou o valor exato e limpou o
  histórico, exclusão sem devolver manteve o saldo intacto.
- Detalhes em `docs/history/2026-07.md`.

## 2026-07-18 — Revisão de design mobile: remove Projeção de Fluxo de Caixa, ajusta dataviz e formatação

Revisão tela a tela do app (Dashboard, Transações, Contas, Cartões, Contas a Pagar,
Metas, Análise, Compartilhado) a pedido do dono, usando lentes de design/dataviz.

- **Projeção de Fluxo de Caixa removida por completo** (`CashFlowChart`,
  `ProjectionTimeline`, `cashFlowProjection.ts` apagados, não só desconectados):
  especulava receita futura a partir de média histórica + regra de recebimento, e o
  dono decidiu que o risco de iludir alguém com dinheiro que não tem supera o valor da
  feature.
- Dashboard: "Disponível" ganha a mesma explicação clicável que só "Comprometido"
  tinha; card de gastos mostra variação vs. mês anterior.
- Cartões/Fatura: mês de referência da fatura formatado ("jul 2026" em vez de "2026-07"
  cru) em 6 lugares, inclusive no título da própria página da fatura.
- Análise: remove ícone redundante de "limite por categoria" do cabeçalho; corrige
  grade pontilhada e cor errada de "Saídas" no gráfico de entradas/saídas; lista de
  categorias agora expande além do top 6.
- Achado e corrigido: botão de excluir em listas pulava de posição quando a linha não
  tinha "Editar" (Transações, beneficia também Contas a Pagar); barras de progresso
  (gastos, metas, limite de cartão) ficam quadradas na base, arredondadas só na ponta;
  seletor 30d/60d/90d parou de quebrar letra por letra.
- Rodado o validador de paleta do dataviz na cor de categorias (`theme/palette.ts`):
  2 cores falham checagem de daltonismo/contraste. Dono decidiu não mexer — é a
  identidade visual do app. Documentado em `docs/planning/TODOS.md`.
- Detalhes em `docs/history/2026-07.md`.

## 2026-07-18 — Landing perde contraste AA no texto secundário e ignora prefers-reduced-motion

`--ink-3` tinha só 3.07:1 de contraste contra o fundo branco (usado em "Grátis · sem
cartão de crédito" e no fechamento do CTA) — escurecido pra 4.59:1. Bob do telefone e
das badges flutuantes no hero rodava infinito mesmo com `prefers-reduced-motion` (são
animações inline do Framer Motion, não pegas pelo media query CSS já existente).

## 2026-07-17 — Aba WhatsApp do admin: linha "fantasma" após excluir a conta dona

Achado pelo dono testando a feature nova de hoje: excluiu uma conta pelo admin (que já desvincula o WhatsApp sozinha) e, ao tentar desvincular esse mesmo número manualmente depois, caiu num erro "não pertence a nenhuma conta" — a lista da aba não se atualiza sozinha após excluir um usuário, então a linha continuava aparecendo mesmo já limpa no banco. `handleDeleteConfirm` agora também remove da lista local qualquer vínculo do usuário excluído; e tentar desvincular algo que já sumiu (corrida entre duas ações) agora é tratado como sucesso, não erro. Também esclarecido um segundo ponto levantado (sem mudança de código): reabrir o app em outro aparelho logo depois de excluir a conta em outro pode mostrar dado antigo por um instante — comportamento esperado de app offline-first + token JWT, não um bug novo. Detalhes em `docs/history/2026-07.md`.

## 2026-07-17 — Admin ganha aba WhatsApp: desvincular qualquer número, inclusive órfão

Consequência direta do fix de exclusão de conta (entrada abaixo): o dono excluiu a própria conta antes da correção existir, recriou com o mesmo email, e não conseguia mais vincular o mesmo número — preso num vínculo órfão apontando pra uma conta que já não existe. Nova aba **WhatsApp** no painel Admin lista todos os números vinculados (marca "Órfão" quando o dono não é mais encontrado) com botão "Desvincular" — nova Cloud Function `adminUnlinkWhatsappNumber` (`functions-admin`, Admin SDK, funciona mesmo com o workspace já excluído). Deployado e com IAM verificada. Detalhes em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-17 — Exclusão de conta: WhatsApp não desvinculava + race condition mandava pro onboarding

Relato ao vivo do dono: excluiu a própria conta (login Google), o WhatsApp continuou vinculado e a tela voltou pro onboarding em vez da landing. Duas causas reais, sem relação uma com a outra:

- **WhatsApp nunca era desvinculado**: nem a auto-exclusão (`accountDeletionService.ts`) nem a exclusão via admin (`functions-admin/src/index.ts`, `adminDeleteUser` — já existia, com botão em `AdminPage.tsx`) tocavam em `whatsappPhoneIndex`/`whatsappLinks`/`whatsappLinkCodes`. Corrigido nos dois: self-service chama o `unlinkWhatsapp` que já existia; admin apaga direto (Admin SDK).
- **Race condition** (a causa real do "voltou pro onboarding"): `deleteAccountData()` apaga `users/{uid}` antes de `deleteAuthenticatedUser()` (ordem deliberada). O `onSnapshot` ao vivo em `AuthContext.tsx` zera o perfil na hora, e o guard de rota `RequireOnboardingComplete` redirecionava pra `/app/onboarding` **no meio da própria exclusão**, parecendo que a conta tinha virado nova. Corrigido com uma flag transiente (`accountDeletion.store.ts`) que suspende esse redirect enquanto a exclusão está rodando.
- Bônus de UX: aviso antes do popup do Google na tela de exclusão, e mensagem clara se a pessoa confirmar com uma conta Google diferente (`auth/user-mismatch`).
- Verificado de ponta a ponta com conta descartável: sem flash de onboarding, WhatsApp simulado desvinculado, `functions:admin:adminDeleteUser` deployado e testado (IAM ok, sem repetir o bug de 2026-07-09). Detalhes em `docs/history/2026-07.md`.

## 2026-07-17 — Objetivo/desafio do onboarding: editável depois + alimenta a Grazi

Achado pelo dono: as respostas de "qual seu objetivo" e "qual desafio" no cadastro não influenciavam nada no app depois, e nunca podiam ser mudadas. Duas mudanças:

- **Editável**: nova tela `/app/settings/onboarding` ("Objetivo e desafio", link na sidebar/menu mobile) deixa mudar a resposta a qualquer momento — `updateOnboardingAnswers()` (`workspaceService.ts`), nova regra `onlyOnboardingAnswersChanged` no `firestore.rules` (teste de emulador novo cobrindo edição válida, tipo errado, campo contrabandeado e edição por outro usuário). Arrays de opções extraídos de `OnboardingPage.tsx` pra `src/onboarding/onboardingOptions.tsx`, reaproveitados pelas duas telas.
- **Alimenta a Grazi**: `buildFinancialContext.ts` agora inclui o objetivo/desafio (traduzido pra texto legível via `onboardingLabels.ts`) na seção SEU CICLO, usado tanto pela Grazi do app quanto pelas perguntas via WhatsApp (mesmo `buildFinancialContext`). Instrução nova no prompt: usar como tempero de tom, nunca como fato garantido (a resposta pode estar desatualizada). 2 testes novos.
- Sem mudança de rota WhatsApp/backend fora do prompt. Detalhes em `docs/ai/GRAZI.md`.

## 2026-07-16/17 — WhatsApp parou de responder: conta de desenvolvedor Meta bloqueada (não era bug)

Uma amiga do dono criou conta e não conseguiu vincular o WhatsApp. Investigação (logs de produção + teste direto do token contra a Graph API) confirmou: a conta de desenvolvedor da Meta foi bloqueada por "atividade incomum" (sistema automático de detecção de fraude, gatilho provável: muitos deploys + testes concentrados no mesmo dia). Nada pra corrigir no código — resolvido pelo dono confirmando identidade no painel da Meta. Testado de ponta a ponta depois: mensagem simples + vínculo novo com outro número, tudo funcionando. Detalhes e roteiro de diagnóstico em `docs/whatsapp/WHATSAPP.md` e `docs/RUNBOOK.md`.

## 2026-07-16 — Nome do cartão nas faturas do Dashboard/Projeção + "Ver todos" enganoso removido

Achado pelo dono ao vivo: com mais de um cartão, "Próximos compromissos" mostrava várias faturas com o texto idêntico "Fatura 2026-07" (o mês de referência), só distinguíveis clicando.

- `buildUpcomingCommitments`/`calculateDashboardSummary` (`financeCalculations.ts`) e `projectDailyBalance` (`cashFlowProjection.ts`) agora recebem a lista de cartões e trocam o nome do cartão pela descrição da fatura — com fallback pro texto antigo (`Fatura ${referenceMonth}`) se o cartão não for encontrado (ex.: já excluído). 2 testes novos.
- Ajuste de UI logo em seguida (pedido do dono, achou o texto "não bonito"): a descrição no Dashboard virou só o nome do cartão (ex.: "Cartão Nubank"), sem repetir "Fatura" nem o mês de referência técnico — a linha de baixo já mostra "Fatura · 10 jul". Mesmo padrão que bills/recorrências já usavam (descrição = só o nome). Na Projeção de Fluxo (sem esse rótulo separado) manteve o prefixo "Fatura" mas sem o mês de referência, já que cada evento aparece sob o cabeçalho do próprio dia.
- Removido o link "Ver todos" de "Próximos compromissos" — levava pra Contas a Pagar, que não lista faturas de cartão, então prometia mostrar tudo sem entregar quando a lista incluía fatura.
- Sem mudança de regra/backend.

## 2026-07-16 — Patrimônio Líquido desativado (temporariamente, a pedido do dono)

Feature "Patrimônio Líquido" desativada por pedido explícito ("talvez no futuro faremos, mas no momento pode desativar"). **Só desconectada da navegação, código intacto** — nenhum arquivo apagado, pra religar rápido se um dia voltar a ser prioridade:

- Removida a entrada "Patrimônio" da sidebar desktop e do menu mobile (`src/layout/AppShell.tsx`).
- Rota `/app/net-worth` trocada de `<NetWorthPage />` por um redirect pro dashboard (`src/App.tsx`) — protege quem tiver a URL salva/favoritada de cair numa tela morta.
- `src/pages/NetWorthPage.tsx` e `src/finance/netWorthCalculations.ts` continuam existindo, intocados, prontos pra religar (bastaria reverter os 2 arquivos acima). Ver `docs/planning/TODOS.md` pra reativar.

## 2026-07-16 — Contas a Pagar reorganizada + Grazi/WhatsApp corrigidas + achado operacional importante

- **Contas a Pagar redesenhada**: recorrentes e compromissos avulsos agora em seções separadas (antes misturados numa lista só); corrigido bug real onde a data da próxima recorrência aparecia trocada pelo valor em dinheiro; agora dá pra editar valor/frequência/categoria de uma recorrência (antes só dava pra criar); layout revisado pra celular de verdade (achado e corrigido um bug de sobreposição de texto em telas de 375px, junto com a mesma correção nas listas do Dashboard e Transações).
- **Filtros de Transações consolidados**: de 7 chips soltos (tipo + tags + conciliação) pra 4 chips de tipo + 1 botão "Filtros" com os secundários numa folha — sem perder nenhum filtro.
- **Removida a conciliação manual** ("marcar como conferido") — feature pouco usada, sem ligação com nada financeiro, removida junto com o filtro que dependia dela.
- **Tag interna "bill" (inglês) trocada por "conta"** — aparecia crua pro usuário no filtro de tags; corrigida no código e com backfill nas transações já existentes.
- **Grazi/WhatsApp**: a correção do bug "fatura sempre R$ 0,00" (ver entrada abaixo) tinha sido commitada mas nunca chegou a ser implantada — corrigido, com um aviso permanente novo em `docs/RUNBOOK.md` (`git push` não reimplanta Cloud Functions). Também adicionado: pedidos de editar/excluir algo já lançado via WhatsApp ("exclui essa transação") agora recebem orientação pra usar o app, em vez de cair no "não entendi" genérico.
- Detalhes completos em `docs/history/2026-07.md`, `docs/ai/GRAZI.md`, `docs/whatsapp/WHATSAPP.md`.

## 2026-07-16 — Saldo de conta e total de fatura: correção financeira + custo de leitura

Dois bugs de correção financeira corrigidos, pedido explícito do dono ("não tem como um aplicativo de finanças ter o saldo errado"):

- **Saldo de conta**: podia ficar errado silenciosamente em contas com 300+ transações (a janela de leitura nunca cobria o histórico inteiro). Agora mantido incrementalmente (`Account.currentBalanceCents`, `increment()` no mesmo batch da transação — mesmo padrão de `goals.savedCents`).
- **Total de fatura de cartão**: nunca era persistido de verdade (nascia 0), causando um bug ativo onde a Grazi/WhatsApp sempre reportava fatura em aberto como R$ 0,00, e forçando o app a resomar o ledger inteiro de toda fatura em todo boot (até 1.500+ leituras por reabertura). Agora mantido incrementalmente por Cloud Function (`invoiceLedgerEntryTrigger.ts`), com correção nova pra compra excluída no cartão (`purchase_reversal` + `reverseCardPurchaseOnDelete.ts`).
- `useCardsData.ts` parou de carregar o ledger de toda fatura no boot global — agora é sob demanda (`useInvoiceLedger.ts`), só quando a tela que precisa dele (cartão/fatura/análise) abre.
- Backfill rodado em produção (contas: 100% batendo com o cálculo antigo; faturas: 9 reversões retroativas encontradas de compras já excluídas antes da correção existir).
- Detalhes completos, riscos residuais e sequenciamento em `docs/history/2026-07.md`.

## 2026-07-16 — Banner "não foi possível preparar categorias padrão" corrigido

Reportado pelo dono: refresh do app (mesmo instalado) às vezes mostrava tudo piscando por alguns segundos + banner vermelho de erro no topo. Causa: `ensureDefaultCategories()` rodava uma leitura única do Firestore em *todo* refresh, mesmo com as categorias padrão já existindo há muito tempo — se essa leitura falhasse de forma transitória (rede instável logo após o refresh), tentava de novo por ~8s e aí mostrava o erro. A UI já mostra as categorias padrão via merge local independente dessa escrita ter sucesso, então a falha virou silenciosa (log só em DEV) e o "já preparado" passou a persistir em `localStorage`, não rodando mais essa leitura redundante a cada refresh. `src/finance/useFinanceData.ts`.

## 2026-07-16 — Auditoria CLAUDE.md: 2 travamentos offline-first + erro técnico exposto

Auditoria completa (3 frentes em paralelo: offline-first, sincronia payload↔firestore.rules, pontos sensíveis). O código do WhatsApp/cartão desta semana passou limpo em tudo. Achados reais, todos pré-existentes:

- **`JoinInvitePage.tsx`**: aceitar convite de casal travava a tela esperando o servidor (`await` bloqueante). Corrigido pra fire-and-forget, igual ao padrão já usado em `SharedSpacePage.tsx`.
- **`AdminPage.tsx`**: revogar convite tinha o mesmo travamento; corrigido. Também corrigidos 3 lugares que mostravam erro técnico cru (`err.message`) em vez de mensagem amigável.
- **`sharedService.ts`**: 5 funções de acerto de contas do casal (claims/settlements) reimplementavam o padrão fire-and-forget na mão em vez de usar o `fireWrite()` do projeto — um `await` futuro nelas travaria de verdade. Padronizado.

## 2026-07-15 — WhatsApp: compra no cartão (à vista ou parcelada)

- **Compra no cartão via mensagem**: "gastei 300 no cartão em 3x" cria a transação `card_purchase` + as parcelas nas faturas certas, portando a mesma lógica de `cardService.createCardPurchase()` do app.
- **Mais de um cartão cadastrado**: o bot pergunta qual usar (lista numerada, "1 - Itaú / 2 - Nubank") e espera até 3 minutos pela resposta — sem memória de conversa geral, só essa pergunta pontual. Resposta que não bate com nenhum cartão descarta a pergunta e trata a mensagem normalmente, sem travar o bot.
- **Fora do escopo, de propósito**: parcela que já estava em andamento antes de usar o WhatsApp, antecipar parcela/fatura, renegociar — o bot direciona pro app em vez de tentar.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: paridade com a Grazi (categorias, receita, perguntas) + vinculo unico/desvinculo

- **Roteamento de intencao**: uma unica chamada DeepSeek classifica cada mensagem em despesa/receita/criar categoria/pergunta/nao entendi, ao inves de assumir sempre despesa (`interpretMessage.ts`, substitui `extractExpense.ts`).
- **Categoria nova so por pedido explicito** ("cria uma categoria X") — lancamento sem categoria clara continua ficando sem categoria, nunca cria sozinha; a IA prioriza a categoria existente mais especifica.
- **Receita pelo WhatsApp**: "recebi 200 de freela" agora cria uma transacao `income` de verdade (antes so despesa era suportada).
- **Perguntas financeiras via WhatsApp**: mesma persona e dados da Grazi do app, rate limit compartilhado (60/dia por workspace).
- **Vinculo unico por workspace**: gerar codigo novo enquanto ja tem numero vinculado agora e bloqueado; codigos antigos nao usados sao limpos automaticamente.
- **Botao Desvincular**: novo em Configuracoes > WhatsApp — fecha um gap real de compliance (Termos e pagina de exclusao de dados ja prometiam essa opcao, que nao existia).
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: confirmacao lenta (CPU throttling) + extracao de gastos quebrada (secret faltando)

- **Confirmacao demorava ~1min**: Cloud Run corta CPU da instancia assim que `whatsappWebhook` responde 200 pro Meta, e o processamento (Firestore + envio da confirmacao) roda todo DEPOIS disso — throttled. Corrigido com `memory: 512MiB` + `cpu: 1` no codigo e `gcloud run services update --no-cpu-throttling` (precisa ser reaplicado a cada deploy, ver `docs/whatsapp/WHATSAPP.md`).
- **Extracao de gastos por mensagem quebrada desde a criacao da feature**: `whatsappWebhook` nunca declarou `secrets: [deepseekApiKey]`, entao toda chamada ao DeepSeek pra extrair "gastei 15 reais..." falhava com "No value found for secret parameter DEEPSEEK_API_KEY". Corrigido.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: vinculacao de conta corrigida (indice do Firestore faltando)

- **Bug**: "vincular 123456" chegava no bot mas nenhuma resposta voltava — nem sucesso, nem erro. Causa: `processLinkCode()` roda uma query `collectionGroup('whatsappLinkCodes').where('code','==',...)` que precisa de indice explicito em escopo COLLECTION_GROUP; sem ele o Firestore rejeita a query com `FAILED_PRECONDITION`, capturado silenciosamente pelo catch generico do webhook.
- **Correcao**: `fieldOverrides` adicionado em `firestore.indexes.json`, deploy via `firebase deploy --only firestore:indexes`. Confirmado com a query real reproduzida via REST API do Firestore.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: webhook destravado (WABA nao inscrita) + link faltante no menu mobile

- **Causa raiz do #133010 / webhook silencioso**: apos migrar para o numero real, a WABA (1431749015518519) nunca foi inscrita no app via `POST /{WABA_ID}/subscribed_apps` — `GET subscribed_apps` retornava `data: []`. A config de webhook (Callback URL, verify token, campo `messages` subscribed) estava correta, mas sem essa inscricao a Meta nunca entrega POSTs. Corrigido chamando o endpoint manualmente; confirmado com mensagem real (`whatsapp_message_received` nos logs).
- **Bug**: menu mobile (`AppShell.tsx`, `mobile-menu-footer`) nao tinha o link `/app/settings/whatsapp` — so existia na sidebar desktop. Usuario nao conseguia achar a tela de vinculacao pelo celular. Corrigido: link adicionado entre Aparencia e Seguranca, mesmo padrao dos demais.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp oficial Meta Cloud API + politicas legais completas + Cloudflare DNS

- **WhatsApp integrado via Meta Cloud API v25.0**: Cloud Functions `whatsappWebhook` (webhook publico) + `generateWhatsappLinkCode` (vinculo por codigo 6 digitos) em `functions/src/whatsapp/`. DeepSeek extrai gastos de mensagens em portugues. Pagina de vinculacao `/app/settings/whatsapp`. Numero real +55 11 936192757 registrado no WABA 1431749015518519 com token permanente via System User. Doc canonica: `docs/whatsapp/WHATSAPP.md`.
- **Politicas legais reescritas**: 3 documentos — Termos de Uso (21 secoes), Politica de Privacidade (16 secoes), Data Deletion (7 secoes). Identificacao completa (Arthur Olimpio Lima, CPF 487.655.288-67). LGPD, CDC, Marco Civil cobertos com artigos citados. WhatsApp, DeepSeek e Grazi explicitamente tratados com consentimento granular. Emails migrados para `@granativa.com.br`. Formatacao de sub-itens com quebra de linha automatica.
- **Grazi coberta legalmente**: Termos secoes 8-9 (descricao + limitacao de responsabilidade IA), Privacidade secoes 3.5, 4(e), 13.3.
- **DNS migrado para Cloudflare**: nameservers `kareem.ns.cloudflare.com` + `mia.ns.cloudflare.com`. Email Routing: suporte/contato/privacidade → zerou.contato.net@gmail.com.
- **App Meta publicado**: categoria "Servicos e produtividade", politicas aprovadas, webhook `messages` subscribed. URL canonica: https://developers.facebook.com/apps/1480907564073971/whatsapp-business/
- **Deploy**: `whatsappWebhook` + `generateWhatsappLinkCode` atualizadas com token permanente e phone number ID de producao.
- **Bug pendente**: numero real retorna erro #133010 "Account not registered" ao enviar mensagens — aguardando verificacao SMS da Meta.

## 2026-07-14 — Renomeacao Contas a Pagar + auditoria Grazi + push diario reescrito

- **"Contas" → "Contas a Pagar"**: renomeação nos labels de UI (sidebar, mobile, título da página, tour, Análise) pra evitar ambiguidade com contas bancárias. Termo "Despesas Fixas" substituído por "Contas recorrentes" nos labels da Análise.
- **Auditoria Grazi pós-unificação**: system prompt e context builder atualizados pra tratar contas avulsas e recorrentes como um grupo só (não mais 2 separados). Lista unificada com anotação "(se repete)". Rules de segurança, documentação e testes atualizados.
- **`sendDailyLogReminder` reescrito**: em vez de multicast cego pra todos os tokens, agora agrupa por usuário, personaliza com nome do perfil (batch `getAll`), sorteia entre 12 mensagens diferentes e limpa tokens stale por usuário (mesmo padrão do `sendPushToUser`).
- **`generateRecurrences`**: push title "Despesa Fixa" → "Conta recorrente".
- Duas auditorias de offline-first com agentes confirmaram zero violações nas 6 novas features e na unificação.
- **`budgetAlerts`**: formatação de dinheiro trocada de manual (`.toFixed(2).replace`) pra `formatBRL`.
- **Deploy**: 11 functions atualizadas em produção (`closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendDailyLogReminder`, `sendBudgetAlerts`, `financialAssistantChat` + billing/admin).

## 2026-07-14 — Unificação Compromissos + Despesas Fixas → "Contas a Pagar"

- **Tela unificada**: "Compromissos" e "Despesas Fixas" viram uma tela só — **Contas a Pagar** (`/app/bills`). Cada conta pode ser avulsa ou recorrente (toggle "Se repete"), com valor fixo ou variável (campo opcional).
- **Valor variável**: se a conta recorrente não tem valor definido (ex.: luz, água), a Cloud Function `generateRecurrences` agora cria um Bill pendente em vez de pular — o usuário preenche o valor quando chegar.
- **Novas funções**: `updateRecurringRule()` e `deleteRecurringRule()` (soft-delete via `isActive: false`) no `financeService.ts`.
- **Navegação**: link "Despesas Fixas" removido da sidebar e menu mobile. Rota `/app/recurring` removida.
- **Dashboard**: label unificado — ambos os tipos viram "Conta".
- **Deploy**: `functions` redeployado com a branch nova no `generateRecurrences`.

## 2026-07-14 — 5 novas features: Patrimônio, Fluxo de Caixa, YoY, Resumo Anual e Alertas de Orçamento

- **Patrimônio Líquido** (`/app/net-worth`): nova página com hero card, KPI strip (ativos/passivos), breakdown por tipo de conta, gráfico de linha com 12 meses de histórico. Cálculo = saldo das contas − faturas em aberto − contas a pagar.
- **Projeção de Fluxo de Caixa**: nova seção no Dashboard com saldo previsto dia a dia (30/60/90 dias), gráfico de linha e timeline de eventos colapsável. Projeta contas, recorrências, faturas e recebimento (via payday).
- **Comparação Ano contra Ano**: toggle na Análise alterna entre "vs. mês anterior" e "vs. mesmo mês ano passado".
- **Resumo Anual**: BottomSheet acessível pela Análise (ícone calendário) com taxa de poupança, KPI strip (entradas/saídas), melhor/pior mês, top 5 categorias, gráfico de barras mensal e year picker.
- **Alertas de Orçamento**: banner no Dashboard avisa quando categoria atinge 80% (amarelo) ou 100%+ (vermelho) do limite. Dismiss por localStorage. Cloud Function `sendBudgetAlerts` (10h BRT) envia push notification com os mesmos thresholds, usando subcoleção `budgetAlertState` pra não repetir alerta no mesmo mês.
- **Navegação**: link "Patrimônio" (TrendingUp) adicionado à sidebar e menu mobile.
- 307 testes (eram 276; +31), typecheck e build limpos.

## 2026-07-14 — 12 temas do Plantao + FAB adaptativo + avatares offline

- **12 temas portados do Plantao**: 6 claros (Paper, Pérola, Floresta, Lavanda, Rosa, Areia) e 6 escuros (Noturno, Carbono, Cobalto, Ametista, Grafite, Vinho). Substituem Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- **FAB e amount-hero adaptam ao tema**: `--gradient-brand` e sombras do FAB saem do bloco compartilhado e vão pra cada tema individual. Botão laranja de lançar transação agora reflete a cor do tema ativo.
- **Seletor agrupado claro/escuro**: `AppearanceSettingsPage` divide os temas em duas seções ("Claros" / "Escuros"), igual ao Plantao.
- **Avatares offline**: `.jpg` adicionado aos `globPatterns` do PWA — as 24 fotos agora são precacheadas.
- **Push notifications com app fechado**: `firebase-messaging-sw.js` registrado explicitamente com `serviceWorkerRegistration` no `getToken()`.
- **Auditoria offline (6 agentes)**: boot timeout 2.5s em 4 hooks, `subscribeWithTransientRetry` ignora `unavailable`, `profileLoading` sempre desbloqueia, `RootRoute` mostra loading em vez de tela branca, perfil `onSnapshot` com `includeMetadataChanges`.

## 2026-07-14 — Auditoria offline (6 agentes) + push notifications + Grazi deploy

- **Auditoria offline com 6 agentes**: ~100 arquivos analisados em paralelo. Corrigido: boot timeout de 2.5s em 4 hooks (`useCardsData`, `useGoalsData`, `useSharedWorkspaceData`, `useCoupleSavings`), `subscribeWithTransientRetry` ignora `unavailable` (SDK retenta sozinho), `profileLoading` sempre desbloqueia após timeout, `RootRoute` mostra "Carregando..." em vez de tela branca, perfil `onSnapshot` ganhou `includeMetadataChanges: true`, `createCardPurchase` com `.catch()`.
- **Push notifications com app fechado**: `firebase-messaging-sw.js` agora é registrado explicitamente e passado via `serviceWorkerRegistration` pro `getToken()`. Antes o SW do VitePWA roubava o lugar e notificações em background nunca chegavam.
- **Grazi**: build das functions + deploy (system prompt atualizado com 11 regras, contexto expandido pra 9 seções, bugs de auditoria corrigidos).

## 2026-07-14 — Offline: sessão mantida sem internet + avatar otimista + dashboard sem flash

- **Offline não desloga mais**: `finishBoot` no `AuthContext` agora rejeita `onAuthStateChanged(null)` quando há perfil em cache. Antes, Firebase Auth disparava null ao falhar renovação de token offline → user/profile zerados → redirect pra /login → todos os dados sumiam da tela.
- **Avatar com estado otimista**: `AppearanceSettingsPage` reflete a seleção imediatamente (`optimisticAvatarId`), sem esperar o `onSnapshot` do perfil. No mobile a latência dava impressão de "não foi".
- **Dashboard sem flash de empty state**: seções de gastos, compromissos e transações recentes não mostram mais `EmptyState` durante o loading (~200ms). Só renderizam quando o carregamento termina e realmente não há dados.
- **Arquivos da sessão anterior commitados**: avatares JPG em `public/avatars/`, `firestore.rules` com `validAvatarStyle()`, sidebar com scroll, reset de `button/input/select/textarea` no `global.css`.

## 2026-07-14 — Grazi expandida: 6 novos contextos + auditoria

- **Contexto expandido de 3 para 9 seções**: SEU CICLO (payday/availableMode), TENDENCIA (6 meses), ORCAMENTOS (limites com %), METAS (progresso), CASAL (cofrinhos do parceiro). GASTOS POR LUGAR considerado e removido (campo merchant escondido em "Mais detalhes", sem normalização = inútil).
- **Performance**: 2 queries por conta eliminadas (filtro em memória reaproveitando transações), `limit(2000)` na query de transações.
- **Bugs corrigidos**: `sanitize(undefined)` crash se doc sem nome, `amountCents` podia virar NaN, `savedCents` undefined produzia NaN%, `createdAt` sobrescrito no rate limit (agora `updatedAt`), `Timestamp` import não usado, `GoalData.dueDate` não usado removido.
- **System prompt**: de 9 para 11 regras, limite de contexto 3000 → 5000 chars.
- **Testes**: 8 novos (payday, budgets, goals, trend, couple, missing profile, missing couple, couple sem workspace). 35 funções + 276 app + 49 rules = 360 passando.
- Auditoria completa com agente: zero vulnerabilidades de segurança, regras do Firestore já cobrem todas as novas leituras. Detalhes em `docs/history/2026-07.md`.

## 2026-07-14 — App 100% offline (auditoria + correção de 11 funções)

- **Auditoria completa de offline-first**: todos os `await` em escritas no Firestore, `getDocs`/`getDoc` que falham sem cache, componentes com "Carregando..." que nunca resolvem offline. 2 agentes fizeram a auditoria e revisaram as decisões.
- **8 escritas convertidas para `fireWrite`**: `createAccount`, `createTransaction`, `createGoal`, `contributeToGoal`, `updateTransaction`, `coupleGoalDeposit`, `coupleGoalWithdrawal`, `ensureDefaultCategories` — todas estavam com `await` e travavam forms/sheets offline.
- **`useFinanceData`**: timeout de 2.5s por slice (`SLICE_BOOT_TIMEOUT_MS`) — se `onSnapshot` não disparar (cache vazio + offline), assume `[]` e destrava o loading. Antes, bastava UMA coleção sem cache pra dashboard ficar presa em "Carregando..." pra sempre.
- **Dashboard "disponível por dia"**: agora usa `cachedSummary.freeToSpendCents` como fallback enquanto carrega, em vez de mostrar "Carregando...".
- **Dead code removido**: `waitForLocalWrite()` + `Promise.race` em `NewTransactionPage`/`EditTransactionPage` (já eram inúteis — `createCardPurchase` já usava `fireWrite`). `.catch()` mortos em `CoupleSavingsSection`.
- **2 correções extras**: `updateAvatarStyle` e `syncAppearanceForUser` convertidas pra `fireWrite`.
- 276 testes unitários + 49 testes de regra (emuladores) + typecheck + build limpos. Detalhes da auditoria em `docs/history/2026-07.md`.

## 2026-07-14 — Redesign dos avatares (+ bug de permissão nunca funcionou) e polimento da sidebar

- **Avatares redesenhados**: os 12 rostinhos SVG desenhados à mão (`src/profile/avatarCatalog.tsx`) foram trocados por retratos recortados de um asset comprado no Adobe Stock (licença comercial confirmada pelo dono, `AdobeStock_420429519`, grid 16×6 de 96 retratos — grid detectado por análise de pixel, 12 recortados/redimensionados pra 256×256 JPEG). Uma primeira tentativa gerou avatares com o estilo open-source "Personas" (DiceBear) antes do dono pedir pra usar essa imagem própria em vez disso — infra do DiceBear (`@dicebear/*`, `scripts/generate-avatars.mjs`) removida. Arquivos estáticos em `public/avatars/*.jpg`, mesmos 12 `id`/rótulo de antes (sem migração de dado). Proveniência em `public/avatars/SOURCES.md`.
- **Bug real encontrado ao verificar ao vivo**: escolher um avatar sempre falhava silenciosamente — `firestore.rules` nunca permitiu o campo `avatarStyle` na regra de update do perfil (`onlyAppearanceChanged()`), então todo `updateDoc` voltava `permission-denied` do servidor. Mesmo padrão dos 2 incidentes anteriores documentados no `CLAUDE.md` (campo novo em payload sem atualizar a regra no mesmo commit). Corrigido: `avatarStyle` adicionado ao `hasOnly` + `validAvatarStyle()` valida contra os 12 ids válidos. Deploy publicado (`firebase deploy --only firestore:rules`) e confirmado ao vivo (seleção sobrevive a reload).
- De quebra, `AppearanceSettingsPage.handleAvatarChange` parou de dar `await` no write (violava a regra de offline-first) e passou a mostrar erro via `FormMessage` em vez de engolir silenciosamente.
- Teste de regressão em `tests/firestore.rules.test.ts`. 276 testes unitários + 49 de regra, typecheck e build limpos. Ver `docs/history/2026-07.md` para detalhe da escolha de estilo.
- **Mesma sessão, dono pediu ajuste**: rótulos trocados de adjetivo de personalidade ("Esperto",
  "Focado"...) pra nomes próprios (Ana, Bruno, Carla...) e catálogo expandido de 12 pra 24
  avatares — mais variedade de cor de cabelo/pele/acessório, escolhida à mão pra evitar
  repetir demais o cabelo ruivo (predominante no asset de origem). `validAvatarStyle()` e
  `tests/firestore.rules.test.ts` atualizados pros 24 ids novos, regra redeployada com
  autorização explícita do dono (2ª vez na mesma sessão — cada deploy pedido de novo, sem
  generalizar a autorização anterior). Também corrigido um recorte com margem grande demais
  que deixava um anel branco visível atrás do círculo no tema escuro — `.avatar-picker__svg-wrap`
  nunca tinha `border-radius`/`overflow:hidden` (só o avatar do header tinha).
- **Rótulos removidos de vez**: dono pediu pra tirar o nome de baixo de cada avatar na grade —
  agora é só a foto, com `aria-label="Avatar N"` numerado (não o nome) pra acessibilidade.
- **Bug real na sidebar, achado por print do dono**: `.sidebar` tem `height: 100vh` fixo sem
  `overflow`, e o menu cresceu pra 17 itens (10 links + 4 de conta + rodapé) — em tela mais
  baixa o conteúdo não cabia e o botão "Sair" podia ficar inacessível. Corrigido com
  `overflow-y: auto` + scrollbar escondida (`scrollbar-width: none` etc.). De quebra: nome do
  usuário movido do rodapé pro topo (embaixo da logo), e os dois botões de logout ("Sair" /
  "Sair deste aparelho" — **não eram equivalentes**, o segundo também limpava o cache local do
  Firestore) fundidos num só "Sair" que sempre faz a limpeza completa, com aviso no diálogo de
  confirmação sobre perder alterações offline não sincronizadas. Ver `docs/history/2026-07.md`
  para a investigação completa.
- **Espaçamento apertado corrigido** em telas com label + chips de filtro + lista (Compromissos,
  Despesas Fixas): `.eyebrow`/`.chip-row` não tinham margem própria quando filhos diretos de
  `.surface-pad`. Fix escopado (`.surface-pad > .eyebrow`, `.surface-pad > .chip-row`) pra não
  afetar os chip-rows que já viviam dentro de `.field` (com espaçamento próprio).

## 2026-07-13 — Grazi: rewrite do contexto financeiro + rename Recorrências → Despesas Fixas

- **Grazi agora vê tudo que o Dashboard vê**: `buildFinancialContext` reescrito para incluir despesas fixas (`recurring`), faturas de cartão (`cards/*/invoices`), bills vencidas (`overdue`), saldo individual por conta, e total "Comprometido" calculado (contas + despesas fixas + faturas). O contexto inclui seções RESÚMO, GASTOS POR CATEGORIA e COMPROMETIDO com quebra por tipo.
- **Antes**: Grazi só via transactions (`expense`/`card_purchase`) + bills `pending` 7 dias + nomes de contas. **Agora**: vê recorrências ativas (próx. ocorrência), faturas com saldo devedor (open/closed/overdue/partial), bills pending+overdue 30 dias, saldo das contas (abertura + transações), receitas do mês, e total livre para gastar.
- **Prompt atualizado**: regra #3 explícita para usar a seção COMPROMETIDO e nunca dizer "não tem nada" se houver itens listados.
- **Rename "Recorrências" → "Despesas Fixas"**: textos de UI (nav, página, Dashboard, Análise, Welcome Tour, push notification) atualizados. Identificadores de código (`RecurringRule`, `recurringRules`, rota `/app/recurring`) mantidos.
- 28 testes functions (4 novos: overdue bills, despesas fixas, total comprometido, saldo conta), 276 client, typecheck/build limpos. Deployado.

## 2026-07-13 — fix: regras de orçamento e reconciliação finalmente deployadas + UX de descoberta do limite por categoria

- **Deploy pendente resolvido:** as regras do Firestore para orçamento por categoria
  (item 7) e reconciliação "conferido" (item 9) estavam commitadas desde a sessão
  anterior mas nunca publicadas em produção (ver avisos ⚠️ mais abaixo neste arquivo,
  "commit local apenas"). Rodado agora: `npx firebase deploy --only firestore:rules
  --project zerou-26757`. Confirmado ao vivo, numa conta de teste: criar um orçamento
  antes era rejeitado silenciosamente pelo servidor (`permission-denied`, mascarado
  pelo padrão fire-and-forget — a UI deixava digitar e fechar normalmente sem indicar
  erro nenhum); depois do deploy, criar/editar/remover orçamento persiste de verdade.
- **UX: descoberta do limite por categoria** (`SearchPage.tsx`): o único ponto de
  entrada da feature era um ícone de engrenagem genérico no cabeçalho da Análise,
  sem rótulo visível — indistinguível de "configurações do app", achado só por acaso.
  Trocado por um ícone de alvo (`Target`, mais associado a "limite/meta" em apps
  financeiros) com `aria-label`/`title` explícitos. Adicionado também um aviso
  contextual dentro do card "Por categoria" — some sozinho assim que o primeiro
  orçamento existir — convidando a definir um limite (ex.: "até R$100 em Doces
  por mês").
- 276 testes unitários, typecheck e build limpos.

## 2026-07-13 — fix: bugs da Grazi encontrados em investigação com 7 agentes

- **7 agentes em 3 rodadas** (Explore, security, QA, produção, regressão) acharam bugs na Fase 1. Corrigidos todos os críticos/altos:
- **card_purchase invisível**: `buildFinancialContext` só contava `type: 'expense'`, ignorava `card_purchase` — quem só usa cartão via "R$ 0,00" de gasto.
- **BRT timezone**: `buildFinancialContext` usava `new Date()` (UTC), não `nowInBRT()`. 3h por mês com dados errados (21h-00h BRT no último dia do mês).
- **Rate limit**: contador era incrementado ANTES do DeepSeek — cada falha de API queimava cota. Movido pra depois do sucesso; pre-check de limite mantido.
- **Validação de input**: `history` sem validação permitia injeção de role `system`, strings gigantes, e crash com `history` não-array. `workspaceId` com whitespace passava. `request.data` undefined crashava. Tudo validado agora com `validateHistory()` + trim + guard.
- **`??` vs `||`**: `competenceMonth`/`categoryId` com string vazia não caía no fallback com `??`. Trocado por `||` + `cashMonth`.
- **Null dueDate**: uma bill sem `dueDate` derrubava `buildFinancialContext` inteiro. Tratamento defensivo com skip + `isNaN`.
- **Timeout DeepSeek**: 15s → 45s. API key validation adicionada. Retry único pra 429/503.
- 24 testes functions, 276 client, typecheck/build limpos. Deployado.

## 2026-07-13 — feat: assistente de IA financeiro (Fase 1)

- **Nova Cloud Function `financialAssistantChat`** (`functions/src/ai/`) — assistente de IA via DeepSeek (`deepseek-chat`) que responde perguntas sobre os gastos do usuário com base nos dados reais do workspace. Prompt de sistema em português, contexto financeiro agregado (gasto por categoria, top 5, contas próximas, saldos), rate limit de 60 msgs/dia por workspace.
- **Nova página `AssistantPage`** (`/app/assistant`) — chat com bolhas, sugestões iniciais, loading e tratamento de erro. Navegação na sidebar e menu mobile (ícone Bot, posição após "Compartilhado").
- **Cliente DeepSeek isolado** (`callDeepSeek`, JSON mode, timeout 15s, secret `DEEPSEEK_API_KEY`) + **verificador de membership** (`verifyWorkspaceMembership`) + **agregador de contexto** (`buildFinancialContext`).
- **Secret `DEEPSEEK_API_KEY` configurado** no Firebase. Nenhuma chave vaza pro bundle client (verificado em `dist/`).
- Testes unitários de `buildFinancialContext` (4 casos: gastos com categoria, transações excluídas ignoradas, contas próximas, workspace vazio) e `verifyWorkspaceMembership` (4 casos: membro ativo, não-membro, status não-ativo, dados nulos). Typecheck, 276 testes, 48 regras, build client + functions limpos.

## 2026-07-13 — fix: exclusão de conta apagava dados mas não excluía o login de verdade

- **Bug real, achado pelo dono e verificado ao vivo:** `onDeleteAccount` (`LoginMethodsPage.tsx`)
  apagava todos os dados do Firestore **antes** de tentar deletar o usuário do Firebase
  Auth, sem reautenticar. `deleteUser()` exige sessão recente e quase sempre falhava com
  `auth/requires-recent-login` — mas só depois que os dados já tinham sumido. A sessão do
  Firebase Auth continuava válida, e a pessoa caía em `/app/onboarding` como se fosse conta
  nova, sem precisar logar de novo — **a conta nunca era excluída de verdade, só os dados**.
- **Correção:** nova função `runAccountDeletion` (`accountDeletionService.ts`) reautentica
  (Google ou senha) **antes** de apagar qualquer dado. Reautenticação falhou → nada é
  apagado. Exclusão do Auth falha mesmo assim (janela residual menor) → força `logout()`
  antes de propagar o erro, nunca mais deixa sessão zumbi.
- **Verificado ao vivo de ponta a ponta** com conta de teste real: exclusão vai pra landing
  (não mais onboarding), `/app` redireciona pra login, login com a mesma senha depois falha
  (usuário do Auth realmente deletado). 5 testes de regressão novos. Typecheck, 276 testes,
  build limpos. Não toca `firestore.rules`.

## 2026-07-13 — fix: orçamento não sincronizava após a 1ª edição + remove orçamento + backlog revisado

- **Bug real corrigido:** `createOrUpdateBudget` reenviava `createdAt` (novo, via
  `serverTimestamp()`) em todo `setDoc`, tanto na criação quanto numa edição
  posterior. `validBudgetUpdate` exige `createdAt` igual ao do documento existente —
  toda edição de um orçamento já criado era **rejeitada pelo servidor
  silenciosamente** (fire-and-forget engolia o erro; a UI mostrava o valor novo por
  um instante e revertia sem aviso). Confirmado com teste de regra reproduzindo o
  payload real do cliente antes da correção.
- **Correção:** `createBudget` (só na criação) separado de `updateBudgetLimit`
  (`updateDoc` parcial, só `limitCents`/`isActive`/`updatedAt`) — mesmo padrão de
  `createCategory`/`updateCategory`. Teste de regressão em
  `tests/firestore.rules.test.ts` documentando por que as duas funções não podem
  virar uma "createOrUpdate" de novo.
- **`deleteBudget`** + botão de remover na tela de Orçamentos (Análise) — antes só
  dava pra criar/editar, não pra tirar.
- **Barra de orçamento na Análise:** o marcador de limite ficava sempre colado na
  borda direita (nunca se movia). Reescalado pra 0-150% do orçamento — o marcador
  agora fica numa posição fixa significativa e a barra pode ultrapassá-lo pra
  mostrar o estouro.
- **Backlog revisado** (`docs/SUGESTOES_FEATURES_2026-07-12.md`): itens 8
  (importação OFX/CSV), 10 (split de conta entre amigos) e 11 (modo escuro
  agendado) removidos a pedido do dono — decisão de produto, não recolocar sem
  pedido explícito.
- **Convenção nova:** arquivos `*.local.md` (gitignorados) para docs que nunca
  devem ser commitadas — primeiro uso: `TEST_ACCOUNTS.local.md` com credenciais de
  contas de teste, referenciado no mapa de contexto do `CLAUDE.md`.
- Typecheck, 271 testes unitários, 48 testes de regra e build limpos.

## 2026-07-13 — feat: reconciliação "conferido" nas transações

- **Novo campo `reconciledAt?: Timestamp` em `Transaction`** (`contracts.ts`): marca quando
  a transação foi conferida contra extrato. Checkbox manual — sem integração com
  importação ainda (item 8 bloqueado).
- **`toggleTransactionReconciled`** (`financeService.ts`): `updateDoc` com
  `reconciledAt: serverTimestamp() | deleteField()`, fire-and-forget. Inclui
  `updatedAt: serverTimestamp()` para passar na regra.
- **`firestore.rules`**: `reconciledAt` adicionado a `validTransactionUpdate.hasOnly`
  com validação condicional `is timestamp`. **Não** adicionado a `validTransactionCreate`
  (reconciliação só depois de existir). `npm run test:rules` passa (47 testes).
- **Teste de regra** (`firestore.rules.test.ts`): verifica que `reconciledAt` no
  create é rejeitado (não está no `hasOnly`).
- **Ícone de check em cada transação** (`TransactionsPage`): botão verde (`--success`)
  quando conferido, cinza padrão quando não. Clique alterna reconciliação.
- **Filtro "Não conferidos"**: chip toggle filtra transações sem `reconciledAt`,
  client-side.
- Typecheck, 271 testes unitários, 47 testes de regras e build limpos.
- **⚠️ Esta feature tocou `firestore.rules`** — deploy da regra só com autorização
  explícita do dono.

## 2026-07-13 — feat: orçamento mensal por categoria (maior feature do backlog)

- **Novo tipo `Budget`** (`contracts.ts`): `id === categoryId` (determinístico), `limitCents`,
  `isActive`, `createdBy`. Um orçamento por categoria, recorrente todo mês até ser mudado.
- **`createOrUpdateBudget` + `subscribeBudgets`** (`financeService.ts`): fire-and-forget
  com `setDoc` (id determinístico = categoria), snapshot sem `orderBy` (padrão de
  `subscribeGoals`). Coleção `'budgets'` adicionada a `FinancialCollectionName`.
- **`useFinanceData`** ganhou slice `budgets`: integrado ao `FinanceDataState`,
  `REQUIRED_SLICES`, array de unsubscribers e `pendingWrites`. Mock atualizado no teste.
- **`firestore.rules`**: `validBudgetCreate` (exige categoria existente via `exists(...)`,
  `id == categoryId`, `createdBy == request.auth.uid`) + `validBudgetUpdate` (só
  `limitCents`/`isActive`/`updatedAt` mutáveis). Match block completo com read/create/
  update/delete. **`npm run test:rules` passa (46 testes)**.
- **Testes de regra** (`firestore.rules.test.ts`): `budgetPayload` helper + caso
  `validates budget documents` — cria orçamento válido, atualiza limite, rejeita
  campo travado, rejeita `createdBy` forjado, rejeita categoria inexistente.
- **Barra de orçamento na Análise** (`SearchPage`): `spendingByCategory` agora inclui
  `categoryId`; legenda de categorias cruza com `budgetByCategoryId` e colore a barra:
  verde (`--success`) < 80%, amarela (`--warning`) 80-100%, vermelha (`--danger`) > 100%.
  Valor mostra "gasto / limite" quando há orçamento.
- **Sheet de configuração** (`SearchPage`): botão Settings no cabeçalho abre
  `BottomSheet` com input de valor por categoria de despesa; `onBlur` grava via
  `createOrUpdateBudget` (fire-and-forget). Valores inicializados do Firestore ao abrir.
- **Dashboard fora do escopo do v1** — só a Análise mostra orçamento por decisão de
  produto documentada.
- Typecheck, 271 testes unitários, 46 testes de regras e build limpos.
- **⚠️ Esta feature tocou `firestore.rules`** — deploy da regra só com autorização
  explícita do dono (commit local apenas).

## 2026-07-13 — feat: tags com chips visuais + filtro por tag nas Transações

- **Novo componente `TagInput`** (`src/components/TagInput.tsx`): substitui o campo de
  texto livre separado por vírgula por chips visuais — Enter ou vírgula adiciona um chip,
  Backspace no campo vazio remove o último chip, clique no X remove um chip específico.
  Normaliza tags (trim + lowercase) e evita duplicatas por capitalização.
- **Integrado em `NewTransactionPage` e `EditTransactionPage`**: ambos trocaram o
  `<input>` de texto por `<TagInput>`. Estado interno mudou de `string` (separado por
  vírgula) para `string[]` — o payload do Firestore já era `string[]`, sem mudança de
  schema.
- **Filtro por tag em `TransactionsPage`**: chips das tags únicas encontradas nas
  transações ativas, multi-seleção (OR entre tags), filtro client-side integrado ao
  `useMemo` de `visibleTransactions`.
- **CSS do `TagInput`** em `global.css`: container com borda e foco estilizado, campo
  interno sem borda, botão de remover com hover `--danger`. Reaproveita a classe `.chip`
  existente para os chips.
- Sem mudança no Firestore nem em `firestore.rules` — `validTags()` já cobria o array
  como estava.
- Typecheck, 271 testes e build limpos.

## 2026-07-13 — feat: pagamento de compromisso com descrição e categoria editáveis

- **Sheet "Confirmar pagamento" agora tem campos de descrição e categoria** (`BillsPage`):
  além de valor e conta (que já existiam), é possível mudar a descrição (ex.: compromisso
  genérico "Contas do mês" pago como "Luz") e a categoria antes de confirmar. Campos vêm
  pré-preenchidos com os valores do compromisso original.
- **`payBill` (`financeService.ts`) aceita `description` e `categoryId` como overrides
  opcionais** em `opts` — sem mudar o contrato existente, quem chama sem esses campos
  continua funcionando igual (usa os valores do compromisso).
- **`CategoryField` reutilizado no sheet** (já era importado na página) — mesma
  experiência de criar/editar/excluir categoria inline que o form de criação de
  compromisso já oferece.
- Sem mudança no Firestore nem em `firestore.rules` — o payload da transação gerada
  (`validTransactionCreate`) já aceita qualquer `categoryId`/`description`.
- Typecheck, 271 testes e build limpos.

## 2026-07-13 — feat: widget "quanto posso gastar por dia" no Dashboard

- **Valor por dia no card "Disponível"**: substitui "Livre agora." por
  "≈ R$ X,XX/dia até {data}" quando há saldo disponível e data de corte resolvida
  (receita futura, próximo recebimento ou janela de dias). Cálculo: `freeToSpendCents /
  daysUntilCutoff`, arredondado pra baixo.
- **Casos de borda**: saldo negativo ou zero mostra "Você já comprometeu tudo que tem
  disponível."; loading mostra "Carregando..."; sem `committedCutoff` mantém "Livre
  agora." (fallback).
- Reaproveita 100% de dado já calculado (`dashboard.freeToSpendCents` +
  `dashboard.committedCutoff`) — sem nova leitura do Firestore.
- Typecheck, 271 testes e build limpos.

## 2026-07-13 — feat: exportar transações do mês em CSV

- **Novo módulo `src/finance/csvExport.ts`**: funções puras `transactionsToCsv` e
  `downloadCsv`, sem dependência de Firebase/React. Delimitador `;` (ponto e vírgula)
  para compatibilidade com Excel brasileiro, valores em formato `1234,56` (vírgula
  decimal, sem `R$`), BOM UTF-8 no início do arquivo para acentos abrirem corretos
  no Excel do Windows.
- **Colunas**: Data, Tipo, Descrição, Categoria, Conta, Valor, Tags. Categoria e Conta
  resolvidas via `Map` (mesmo padrão da Análise). Tipo usa `transactionTypeLabels`.
- **Testes unitários** (`csvExport.test.ts`, 9 casos): BOM, delimitador, formato
  brasileiro, valores negativos, escape de campos com `;`/`"`, acentos, lista vazia.
- **Botão Download no cabeçalho da Análise** (`SearchPage`): ícone ao lado da lupa,
  exporta as transações do `selectedMonth` atual (filtradas por `!deletedAt` +
  `cashMonth || competenceMonth`). Arquivo: `granativa-YYYY-MM.csv`.
- Exporta o valor bruto da transação (`amountCents`), não a visão diluída por
  parcela do regime de caixa — limitação documentada no código.
- Sem mudança no Firestore nem em `firestore.rules`.
- Typecheck, 271 testes (28 arquivos) e build limpos.

## 2026-07-13 — feat: meta com data-limite visível no card

- **Prazo da meta agora aparece no card** (`GoalsPage`): linha abaixo da barra de
  progresso mostra "Até {data}" quando falta mais de 7 dias, com destaque `--warning`
  quando faltam 7 dias ou menos, e "Atrasada — venceu {data}" em `--danger` quando o
  prazo já passou. Meta concluída não mostra prazo (já exibe "concluída").
- Usa `differenceInCalendarDays` do date-fns (já era dependência do projeto) +
  `formatFriendlyDate` (helper existente). Campo `Goal.dueDate` já existia no tipo e
  na regra do Firestore — nenhuma mudança de schema ou regra.
- CSS mínimo: `.goal-card-due` com fonte 0.82rem e margem superior de 0.25rem.
- Typecheck, 261 testes e build limpos.

## 2026-07-13 — feat: filtro por status nos Compromissos

- **Chips de filtro em `BillsPage`**: botões "Todos", "Pendentes", "Vencidos", "Pagos"
  entre o cabeçalho "Lista" e a lista de compromissos — mesmo padrão de `chip-row` já
  usado nos filtros de tipo das Transações.
- **Filtro 100% client-side** (`useMemo` sobre `finance.bills`): sem chamada de rede,
  reage instantaneamente à troca de chip e a bills que viram `overdue` automaticamente
  (via `markOverdueBills`, já existente).
- **EmptyState com `illustration="bills"`** (ilustração de calendário+check, já existia
  mas nunca era usada nesta página — antes usava `wallet`): variante `compact` para
  "Nenhum resultado" (filtro sem match) e variante normal para "Nenhum compromisso
  ainda" (lista vazia de verdade).
- Sem mudança no Firestore nem em `firestore.rules`.
- Typecheck, 261 testes e build limpos.

## 2026-07-13 — fix: 2 bugs de CSS achados testando a tela nova (dinheiro colado no texto + resumo ilegível no mobile)

- **`.notice` estava com `display: flex` sem `flex-wrap` vazando de uma regra morta**
  (`global.css`): `.entitlement-list li, .notice { display: flex; ... }` — `entitlement-list`
  é da feature de billing (inativa) e não existe em nenhum `.tsx`, mas o `.notice`
  agrupado na mesma regra é usado em 7 lugares vivos do app. Qualquer `.notice` com
  texto misturado a `<strong>` (como o resumo do formulário de compra parcelada)
  virava uma fileira de itens de flex sem quebra, cortando texto e empilhando pedaços
  fora de ordem. `.notice` removido do agrupamento — a regra base (borda/padding,
  sem flex) volta a valer sozinha.
- **"Fatura atual" (`CardDetailPage`) mostrava o valor colado no texto seguinte**
  (`R$ 3.200,002026-07 · em aberto...`, sem espaço): o `<strong>` do valor e o
  `<span className="text-secondary">` do texto secundário são elementos inline sem
  quebra entre eles — diferente do resto do app, que usa `.list-row` (que já empilha
  texto por regra global). Essa seção usa `<div>` com estilo próprio, fora desse
  padrão. `display: 'block'` adicionado ao `<strong>`.
- Verificado ao vivo no navegador em viewport mobile (375px): os dois pontos
  reproduzidos antes do fix e confirmados corrigidos depois. Checados os outros
  lugares que usam o mesmo par `<strong>`+`<span className="text-secondary">` —
  todos os demais já estão dentro de `.list-row` ou têm CSS próprio de grid/flex
  intencional (`.dash-metric`, `.anticipation-group-head`), únicos os dois corrigidos.
- Typecheck, 261 testes e build limpos.

## 2026-07-13 — feat: formulário de "compra parcelada que já começou" simplificado

- Feedback direto do dono usando a própria tela: pra lançar uma compra parcelada que já
  estava rolando, o formulário pedia "próxima parcela é a Nº de M" (dois números fáceis
  de trocar) + "em qual mês essa parcela cai na fatura" — a última exige olhar o extrato
  do banco, informação que ninguém sabe de cabeça.
- Trocado por "quando você comprou" (date picker, igual o de compra nova) + "total de
  parcelas" + "quantas já pagou". O mês da próxima parcela deixou de ser perguntado e
  passou a ser **calculado** (`resolveInstallmentCycle`, a mesma função que já resolve
  compra nova, usando o fechamento/vencimento já cadastrados do cartão) — só aparece no
  resumo pra confirmar, não é mais um campo cru. `OngoingInstallmentsSheet` passou a
  receber o cartão inteiro em vez de só o id, pra ter `closingDay`/`dueDay` no cálculo.
- Verificado ao vivo: compra em 15/mar num cartão que fecha dia 10 (1ª parcela cai em
  abril), 10 parcelas, 6 já pagas → calculou sozinho "próxima (7/10) cai na fatura de
  outubro/2026", 4 parcelas restantes somando R$600 — bate com a conta manual.
- 261 testes, typecheck e build limpos. Sem mudança de regra/schema — só o formulário e
  o cálculo que já preenchia o campo que sumiu.

## 2026-07-12 — fix: 13 bugs de uma varredura de investigação (casal, cartão, Análise)

- Investigação por 4 agentes achou 20 bugs (`docs/BUGS_INVESTIGACAO_2026-07-12.md`);
  18 confirmados reais, 2 descartados (contrariavam a arquitetura offline-first do
  projeto ou eram limitação de modelagem, não bug). 13 corrigidos
  (`docs/CORRECAO_BUGS_2026-07-12.md`): erro engolido nas escritas do espaço a dois
  (`fireWrite`), status de fatura travado após reconciliação manual, dupla
  antecipação de parcela por falta de idempotência, guardar/resgatar do cofrinho
  não-atômico entre workspace do casal e pessoal, status `overdue` de fatura nunca
  produzido, Análise ignorando `refund`/`reimbursement`/`adjustment`, entre outros.
  Zero mudança em `firestore.rules`.
- Revisão de código da própria correção (feita porque o dispatch de subagentes
  falhou no ambiente, revisão manual direto no diff) achou 2 fixes incompletos:
  o do erro engolido só cobria 2 das 5 funções afetadas (as outras 3 são de uma
  feature "acerto de contas" sem UI ainda, sem sintoma hoje mas armadilha pra
  quando for construída), e o da Análise só corrigia o total do mês, não o
  detalhamento por categoria. Ambos completados; 2 funções que ficaram sem
  nenhum caller (`addGoalContribution`/`withdrawGoalContribution`) removidas.
- 261 testes (3 novos), typecheck e build limpos.

## 2026-07-12 — fix: spread frágil na saída do espaço a dois + bills viram "vencido" sozinhas

- Análise de arquitetura feita junto com outra IA (Deepseek — ver `docs/ANALISE_PROJETO_2026-07-12.md`) revisada ponto a ponto contra o código antes de implementar; dois achados de baixo risco/alto valor foram aplicados, um terceiro (apertar a regra de exclusão de conta pra `canDeleteWorkspaceTree`) foi descartado depois de achar que qualquer membro ativo pode excluir a própria conta hoje pela UI — apertar a regra quebraria isso silenciosamente pro parceiro não-dono, o mesmo padrão de bug que este projeto já sofreu 3 vezes.
- `accountDeletionService.ts` (`leavePartnerWorkspace`): trocado o `{...workspaceRefData, status, updatedAt}` por objeto explícito `{status, updatedAt}` — a pendência que estava documentada no `CLAUDE.md`.
- `markOverdueBills` (`financeService.ts`) roda a cada snapshot de `subscribeBills` e marca `pending → overdue` (fire-and-forget) toda bill com vencimento em dia anterior a hoje; regra do Firestore já aceitava o valor, não precisou mudar. `BillsPage` ganhou os botões "Pago"/"Cancelar" também pra bills `overdue` (antes só apareciam pra `pending` — a marcação automática ia esconder a ação de pagar uma conta vencida).
- 258 testes (2 novos, cobrindo os limites de `markOverdueBills`: dia de vencimento vs hoje vs futuro, e os 3 status que não devem disparar escrita), typecheck e build limpos. Sem mudança de regra do Firestore.

## 2026-07-12 — fix: número da parcela antecipada some no caminho, "Parcela antecipada" ficava genérica

- Ao antecipar, o número da parcela (8/10, 5/5...) era descartado antes de gravar no ledger — nem o débito (fatura de origem) nem o crédito (fatura de destino) guardavam qual parcela era. Combinado com o fix anterior (parcela antecipada some da fatura futura), isso dava a impressão de que sobravam parcelas: a última visível de uma compra em 10x parava em "7/10" sem nenhuma pista de que 8, 9 e 10 foram antecipadas — parecia fatura incompleta, não paga adiantado.
- `anticipateInstallmentsSchema` ganhou `installmentNumber`/`installmentTotal` opcionais por parcela; `InvoicePage` carrega esses números (do grupo de antecipação) e `cardService.anticipateInstallments` grava os dois no débito e no crédito. A regra do Firestore **já aceitava** esses campos genericamente pra qualquer tipo de lançamento — não precisou mudar. Fatura de origem agora rotula "parcela 8/10 antecipada" em vez de "Parcela antecipada" sem número; antecipações antigas (sem o dado salvo) continuam com o texto genérico como fallback.
- Verificado ao vivo: antecipei 2 parcelas novas ("Notebook teste", 4/5 e 5/5) e a fatura de origem mostrou "parcela 5/5 antecipada" e "parcela 4/5 antecipada" corretamente; as faturas de destino (nov/dez de 2026) tiveram o valor reduzido em R$1.000 cada e o Limite Usado total do cartão **não mudou** (R$8.700 antes e depois — antecipar só move entre faturas). 256 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — fix: parcela antecipada some da fatura futura (igual Nubank)

- Depois do fix anterior (parcela antecipada aparecendo na fatura de origem), sobrou uma confusão do lado oposto: a fatura **futura** de onde a parcela saiu continuava mostrando "Compras R$300 / Créditos −R$300" lado a lado — dinheiro fantasma que se cancela mas fica visível, e a fatura em si (com saldo R$0) ainda aparecia no histórico do cartão como se tivesse algo pendente. No cartão de verdade (Nubank), a parcela antecipada só **some** da fatura futura.
- `anticipatedAwayEntryIds` (`src/cards/anticipation.ts`) casa cada parcela `purchase` com o crédito `installment_anticipation_credit` que a anula (mesma compra, mesmo valor) e esconde os dois. `InvoicePage` deixa de listar essa parcela e some com a linha "Compras" do resumo quando não sobra nada pra mostrar (mensagem "A parcela que caía aqui foi antecipada pra uma fatura anterior."). `CardDetailPage` some com a fatura do "Histórico de faturas" quando, depois de esconder o par antecipado, não sobra nenhuma atividade real (`invoiceHasVisibleActivity`) — nada é apagado, é recalculado toda vez: se uma compra nova cair nessa mesma fatura depois, ela deixa de ficar vazia e reaparece sozinha, com o valor real.
- Verificado ao vivo: as 3 faturas de 2027 zeradas por antecipação sumiram do histórico do cartão (a de janeiro/2027, com compra de verdade, continua aparecendo normal); a fatura de origem (julho/2026) continua mostrando as 4 parcelas somando R$1.200, sem regressão do fix anterior. 256 testes (9 novos), typecheck, lint (linha de base) e build limpos. Só UI; sem mudança de regra/dados — o ledger continua intacto e append-only, isso é puramente como a tela escolhe mostrar.

## 2026-07-12 — fix: parcela antecipada some da lista "Compras" da fatura

- O total "Compras" no topo da fatura (`invoice.purchasesTotalCents`) soma tanto a compra normal do mês quanto qualquer parcela **antecipada** trazida de uma fatura futura (`installment_anticipation`, que também é um débito real na fatura atual). Mas a lista "Compras" logo abaixo só filtrava `type === 'purchase'` — as parcelas antecipadas engordavam o total sem aparecer em nenhuma linha. Sintoma real (achado pelo dono numa fatura de teste): total "R$ 1.200" com a lista mostrando só "R$ 300".
- `purchases` em `InvoicePage.tsx` agora inclui `installment_anticipation` também; cada uma aparece com o rótulo "Parcela antecipada" (em vez do número de parcela, que essas entradas não carregam) pra não se confundir com a compra normal do mês.
- Verificado ao vivo: fatura que tinha 1 compra normal (R$300) + 3 parcelas antecipadas (R$300 cada) agora lista as 4 linhas, somando os R$1.200 do topo. 247 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — feat: "Próximos compromissos" clicável + filtro por cartão nas Transações

- **As linhas de "Próximos compromissos" no Dashboard viraram clicáveis**: tocar numa **Fatura** abre a fatura do cartão (`/app/cards/:id/invoices/:invoiceId`), **conta a pagar** abre Compromissos, **recorrência** abre Recorrências. Antes eram só texto — dava pra ver o que vencia primeiro, mas não chegar lá. (`UpcomingCommitment` ganhou `cardId`; linhas usam o `.list-row--link` que já existia.)
- **Filtro por cartão na tela de Transações**: um seletor "Cartão" (todos / cada cartão) mostra só as compras daquele cartão — além da visão por fatura que já existia. Combina com a busca e os chips de tipo.
- Verificado ao vivo: clicar na Fatura no Dashboard abre a fatura certa; filtrar por "Cartão QA" some com as compras dos outros cartões. 247 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — feat: tour de boas-vindas em slides no primeiro acesso

- Antes, quem criava conta caía direto no Dashboard sem ninguém explicar as features (o onboarding é só um questionário de configuração; o único explicador era o mini-tutorial do "Disponível"). Agora um **tour de boas-vindas em 6 slides** abre sozinho uma vez após o onboarding, apresentando os pilares: lançar tudo num lugar, cartões sem susto (parcelas), Compromissos × Recorrências, Disponível × Comprometido, e Metas/Casal/Análise. Com "Pular", "Voltar/Próximo", dots e "Começar".
- **Reabrível a qualquer momento** em "Como funciona" (menu Mais / sidebar). "Já viu" mora no localStorage (`zerou.welcomeTourSeen`, mesmo padrão do prompt de instalação — sem write no Firestore). Sequenciado **antes** do mini-tutorial do "Disponível" pra não empilhar dois modais.
- `WelcomeTour` + `welcomeTour.store` (Zustand) em `src/onboarding/`, montado no `AppShell`. Só tokens de tema no CSS (tema claro e escuro). Verificado ao vivo: auto-abre no 1º acesso, navega os 6 slides, "Começar" persiste e não reabre no reload, e o "Como funciona" reabre. 247 testes, typecheck, lint (linha de base) e build limpos.

## 2026-07-12 — feat: logos de serviço (6 oficiais + 13 tiles de marca "ícone de app")

- O dono trouxe os 19 logos que faltavam. **6 tinham símbolo quadrado** usável no tile de 36px → adicionados como SVG oficial: ChatGPT, Microsoft 365, Oi, Google One, Claro, Rappi.
- Os outros **13 eram só wordmark** (logo horizontal, ilegível espremido no quadradinho). Em vez de usá-los assim, o `ServiceMark` agora desenha um **tile "ícone de app"**: quadrado na cor da marca com as iniciais em branco (Prime Video azul "PV", Disney+ marinho "D+", Wellhub laranja "WH"…). Cores em `serviceBrandColors` (`src/theme/palette.ts`, lugar sancionado pra literais); novo estado `.service-mark--brand`. `logoPath` tem prioridade — dá pra promover qualquer uma a logo de verdade depois, é só trazer o SVG quadrado.
- Genéricos (Aluguel, Água, Energia…) seguem no tile de iniciais neutro — não são marcas.
- Verificado ao vivo em tema claro **e escuro** (a borda sutil foi mantida de propósito pros tiles bem escuros — Disney marinho, Smart Fit quase preto — não sumirem na superfície dos temas dark). Procedência dos 6 SVGs em `public/service-logos/MANUAL_SOURCES.md`. 247 testes (incl. `noHardcodedColors`), typecheck, lint (linha de base) e build limpos.

## 2026-07-12 — feat: pagar recorrência adiantado (janela de dias antes do vencimento)

- Dava pra registrar uma recorrência **só a partir do dia do vencimento** — quem paga a conta uns dias antes (conta do dia 10 paga no dia 7) ficava travado no "Em dia", sem ação. Agora, dentro de uma **janela de ~7 dias antes** do vencimento, aparece o botão **"Pagar adiantado"**; registrar ali lança o pagamento hoje e a recorrência avança pro próximo período normalmente.
- **É seguro liberar adiantado**: a transação da ocorrência é identificada pela **data de vencimento** (`recurringOccurrenceTransactionId`), não pela data do pagamento — então registrar adiantado e a automação das 6h rodar no vencimento caem no mesmo id, sem duplicar. Nova função pura `canRegisterRecurrence` (+`RECURRENCE_EARLY_PAY_DAYS = 7`) em `financeService.ts`, testada (5 casos: vencida, dentro/no limite/fora da janela, janela customizada).
- Verificado ao vivo: recorrência vencendo em 3 dias mostrou "Pagar adiantado", pagar avançou a próxima ocorrência pro mês seguinte e voltou pra "Em dia"; recorrência distante (mês seguinte) segue "Em dia". 247 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra do Firestore.

## 2026-07-12 — feat: busca direta na tela de Transações

- A tela de Transações (o extrato) ganhou uma **barra de busca sempre visível** no topo + **chips de filtro por tipo** (Tudo / Despesas / Receitas / Transferências). A busca por texto filtra a lista **ao vivo** por **nome, categoria, tag e estabelecimento** — os campos que a pessoa lembra. "Despesas" inclui compras no cartão. Empty state próprio quando o filtro/busca não acha nada ("Nenhum resultado"), distinto do "nenhuma transação ainda".
- Antes só existia busca na Análise, escondida atrás de um ícone (BottomSheet). Aqui é inline, no lugar mais natural pra achar um lançamento. Reaproveita `.input-with-icon` e `.chip`/`.chip--active` (nova `.transactions-filter` só pra espaçar).
- Verificado ao vivo: buscar "eletr" acha o Notebook pela **categoria** (não está no nome), "mercado" acha pelo nome, texto sem match mostra "Nenhum resultado", e o chip "Receitas" esvazia a lista de despesas (com destaque no chip). Typecheck, 242 testes, lint (linha de base) e build limpos.

## 2026-07-12 — fix: iniciais do selo de serviço encostadas à esquerda (Recorrências/Compromissos)

- O tile de iniciais/ícone (`ServiceMark`) nas listas de Recorrências e Compromissos mostrava as letras coladas no canto esquerdo do quadrado, em vez de centralizadas. Causa: `.service-mark` usa `display: inline-grid; place-items: center`, mas a regra genérica `.list-row span { display: block }` (que empilha o texto das linhas) tem especificidade maior e derrubava a grade. Corrigido subindo o seletor para `span.service-mark` — exatamente o mesmo padrão do `span.category-mark`. É o **segundo** caso real desse bug de especificidade em tiles dentro de `.list-row`. Verificado ao vivo (o "EN" de Energia elétrica agora centralizado, folgas iguais nos 4 lados). Só CSS; 242 testes e build limpos.

## 2026-07-12 — feat: camada "Previsto" na Análise (recorrências projetadas) + categoria de compra conferida

- **Mês futuro agora mostra "Previsto"**, não só o comprometido: além das parcelas de cartão e contas a pagar (obrigação firme), soma as **recorrências projetadas** para aquele mês (aluguel, assinaturas…). O KPI vira "Previsto no mês", um terceiro card mostra "Recorrências ~R$", e uma seção **"Recorrências previstas"** lista cada regra — deixando claro o que é firme (comprometido) e o que é estimativa (recorrência, pode mudar se cancelar/ajustar).
- **Projeção mês a mês** (`projectedRecurringForMonth`/`recurringByCategoryForMonth` em `spendingAnalysis.ts`): trata mensal (1×/mês), semanal (soma as ocorrências do mês) e anual (só no mês do aniversário), com o avançador de ocorrência (`nextOccurrenceDate`) injetado pra manter o módulo puro. O horizonte de navegação passou a ir até a última parcela/conta **ou** +12 meses quando há recorrência ativa (recorrência é "infinita", precisa de teto).
- **Categoria conferida ao vivo, nos dois caminhos** (dúvida do dono): compra no cartão com categoria mostra a fatia certa no donut (parcela → transação-mãe → categoria: "Alimentação R$200"), e recorrência idem ("Casa R$1.500"). Antes a conta de teste tinha tudo sem categoria, então parecia "Sem categoria 100%".
- Verificado ao vivo: ago/2026 = R$2.000 previsto (R$300 parcela + R$1.500 recorrência + R$200 compra categorizada), donut com 3 fatias, seção de recorrências e console limpo. 242 testes (6 novos de projeção de recorrência), typecheck, lint (abaixo da linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — feat: projeção de meses futuros na Análise (o que já está comprometido)

- **Dá pra avançar pra meses futuros na Análise** e ver o que já está comprometido lá. O botão de avançar mês, que parava no mês atual, agora vai **até o último mês com parcela/conta comprometida** (`lastCommittedMonth`) — sem meses vazios sobrando no fim.
- **Mês futuro mostra "Já comprometido", não "Gasto"**: num mês que ainda não chegou não existe gasto realizado, então a tela conta **parcelas de cartão caindo naquele mês + contas a pagar (bills) vencendo nele**, por categoria. Rótulos, legenda ("Mês ainda não chegou — isto é o que você já assumiu…") e empty state adaptados; "vs. mês anterior" some (comparação só entre meses realizados).
- **Recorrências ficaram de fora de propósito** (decisão de produto): projetar recorrência mês a mês seria estimativa (valor/cancelamento incertos), e misturar previsão especulativa com obrigação real numa Análise engana. Cartão (ledger) e contas a pagar são dados reais já cadastrados. Recorrência pode virar uma camada "Previsto" separada depois.
- Verificado ao vivo (conta de teste): ago/2026 = R$300 (parcela 2/10), out/2026 = R$625 (10x QA R$300 + Geladeira 1/12 R$200 + Óculos 8/10 R$125), avançar trava no último mês comprometido, console limpo. 236 testes (7 novos: `billsByCategoryForMonth`, `committedByCategoryForMonth`, `lastCommittedMonth`), typecheck, lint (abaixo da linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-11 — feat: Análise em regime de caixa (por parcela) + compras parceladas em andamento

- **A Análise deixou de jogar a compra parcelada inteira no mês da compra.** Uma compra de R$3.000 em 10x aparecia como R$3.000 num mês só (a tela somava a transação `card_purchase`, que guarda o valor cheio no mês da compra) e os outros 9 meses zerados. Agora o cartão entra pela **parcela que cai na fatura de cada mês** — R$300 em cada um dos 10 meses. Casa com o "Comprometido" do Dashboard (que já contava por fatura) e com o que "quanto gastei no mês" significa. Nova lógica isolada em `src/finance/spendingAnalysis.ts`, pura e testada (11 casos).
- **Antecipar parcela agora reflete na Análise, de graça.** Como o gasto do mês reusa o `recognizedExpenseCents` do ledger (`purchases + fees − credits`, incluindo débito de antecipação na fatura atual e crédito na futura), antecipar uma parcela move o gasto do mês futuro pro atual também nos gráficos — antes a Análise nem olhava o ledger.
- **Nova seção "Compras parceladas — Em andamento"** na Análise, dando visibilidade ao valor cheio que a visão por parcela dilui: "R$3.000 em 10x", quantas parcelas faltam e quanto resta. "Restante" é líquido de antecipação (parcela antecipada sai do que falta, como no cartão de verdade). Vale mesmo pra compra migrada em andamento (óculos 7/10 → mostra o total real R$1.250, não só o que falta).
- **Busca enriquecida**: um resultado de compra no cartão mostra "10x de R$300" ao lado do valor cheio, ligando a compra às parcelas.
- Verificado ao vivo (conta de teste): julho mostrando R$1.200 (as parcelas do mês, não as compras cheias), seção em andamento com Geladeira R$2.400/12, Compra 10x QA R$2.100 restante/7 (refletindo 3 já antecipadas) e Óculos R$500/4, console limpo. 229 testes, typecheck, lint (uma abaixo da linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-11 — feat: antecipar fatura x antecipar parcela explícitos + aviso de que é irreversível

- **Confirmação antes de antecipar parcelas.** Ao confirmar, um diálogo mostra de quais faturas futuras as parcelas saem e que passam a contar nesta fatura agora (ex.: "Ela sai das faturas de dez/2026 e passa a contar nesta fatura agora — total R$ 125,00. Seu limite não muda; só o mês em que cada parcela pesa. Isso não pode ser desfeito."). Fecha a decisão #4 da spec (explicitar o que se move, já que não há desconto pra "vender" a ação) e o aviso de irreversibilidade (mantida irreversível, como no Nubank).
- **"Antecipar fatura" e "antecipar parcela" viraram conceitos distintos na UI.** Numa fatura ainda aberta, o botão de pagar vira **"Antecipar fatura (pagar antes de fechar)"** com um texto curto explicando a diferença pra antecipar parcela; o título do sheet e o botão do cartão acompanham ("Antecipar" quando aberta, "Pagar fatura/agora" quando fechada).
- Conferência final contra `spec_antecipacao_fatura_parcela.md`: o comportamento bate. Nosso modelo de ledger (débito na fatura atual + crédito na futura) já entrega o `mes_referencia` × `mes_pago` da spec sem precisar dos dois campos de data, e os relatórios de mês futuro já saem líquidos de graça (o crédito zera a parcela na fatura de origem).
- Verificado ao vivo (conta de teste): botões, texto e diálogo com o mês certo (dez/2026), stepper da última pra trás refletindo antecipação anterior (10x já sem 8/9/10 → próxima 7/10; óculos intacto → próxima 10/10), console limpo. 218 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-11 — fix: antecipação só da última parcela pra trás + trazer compras existentes ao criar o cartão

- **Antecipação de parcela reescrita pra funcionar como no cartão de verdade.** Antes o app deixava marcar qualquer parcela futura solta — inclusive uma do meio, deixando as de trás (parcelei em 5x, tô na 1ª, e dava pra antecipar a 3ª). Isso não existe: antecipação é sempre **da última parcela pra trás, contígua**. Agora o painel agrupa por compra e oferece um seletor "antecipar as últimas [N] parcelas" — pega da última pra trás, nunca uma do meio. Verificado ao vivo: antecipar as 3 últimas de um 10x moveu R$900 das faturas fev/mar/abr pra fatura atual, **limite usado inalterado** (antecipar move dívida entre faturas, não muda o total). O mecanismo em si (débito na fatura atual + crédito na futura) já estava certo; o bug era só a seleção.
- **Trazer compras existentes ao cadastrar o cartão.** A maioria já chega com parcelas rolando. Agora, ao criar um cartão, o app vai direto pra página dele com um destaque: "Esse cartão já tinha compras? Traga o que já existe" — parcelas em andamento (ex.: 12x, já na 7ª) **e compras futuras que começam mais pra frente** (ex.: parcelas que só começam na fatura de outubro). Reaproveita o fluxo `registerOngoingInstallments`, com cópia mais clara pros dois casos. Verificado ao vivo (compra futura de 12x começando em outubro → 12 faturas de out/2026 a set/2027).
- 218 testes de unidade, typecheck, build e lint (linha de base) limpos. Regra do Firestore não mudou (os campos de parcela já foram deployados).

## 2026-07-11 — fix: conservador não estoura mais com parcela + lançar compra parcelada em andamento

- **Conservador com Disponível muito negativo — corrigido.** A causa era o modo contar **todas** as parcelas futuras de uma compra no cartão como se vencessem hoje. Reproduzido no caso do dono (R$5.000 de limite, R$3.000 em 10x, saldo baixo): antes dava Comprometido R$3.000 / Disponível −R$2.000. Agora o conservador olha a **janela de dias** (sem nunca assumir salário), então só a parcela que vence logo pesa — Comprometido R$300, Disponível R$700. Verificado ao vivo. Mini tutorial, tela de Recebimento e legenda do Dashboard reescritos pra refletir a diferença real entre os modos (conservador = janela fixa; "até o recebimento" = corte no salário).
- **Lançar compra parcelada que já começou** (`registerOngoingInstallments` + `OngoingInstallmentsSheet`, botão na página do cartão). Pro caso de migrar pro app uma compra que já vinha pagando: informa o valor da parcela, "está na parcela 7 de 10" e o mês da próxima; o app cria só as que faltam (7 a 10), nas faturas certas, sem recriar as pagas. Preview ao vivo antes de confirmar.
- **Toda compra parcelada agora mostra "parcela X/N"** na fatura (novos campos `installmentNumber`/`installmentTotal` no ledger). Resolve a confusão das "10 faturas abertas que parecem 10 contas". Exige regra do Firestore nova (deployada).
- QA ao vivo completo numa conta criada do zero (cadastro → onboarding → conta → cartão → compra 10x → conservador → compra em andamento), tudo persistindo após reload, console limpo. 221 testes de unidade + 45 de regras, typecheck, lint (linha de base) e build limpos.

## 2026-07-11 — feat: logos e autocomplete de assinaturas nas Recorrências e Compromissos

- **Catálogo de ~60 serviços** (`src/finance/subscriptionServices.ts`): assinaturas (Netflix, Spotify, Prime Video, Disney+, Max, Wellhub, Xbox…) e contas fixas (energia, água, aluguel, internet…). Digitar no campo Descrição sugere a marca, preenche o nome canônico e sugere a categoria (sem sobrescrever uma escolhida à mão). A lista de recorrências e de compromissos passou a mostrar a marca ao lado do nome.
- **26 logos SVG** gerados do `simple-icons` (mesma fonte CC0 dos bancos), via `npm run generate:service-logos`, com `SOURCES.md` automático. Chip de fundo sempre claro (`--brand-chip-bg`) pra logos pretos (Apple TV, Notion, Uber) não sumirem nos 4 temas escuros.
- **Marcas fora do simple-icons mostram tile de iniciais**, igual aos bancos sem logo. Prime Video, Disney+, Wellhub, Xbox, Microsoft 365, Adobe, Canva, ChatGPT e Globoplay **não existem** no pacote (que remove logo a pedido do dono) e não têm versão quadrada de fonte confiável — busquei no Wikimedia Commons e só há wordmarks marcados como `trademarked`, ilegíveis num tile de 36px. Decisão do dono: tentar o oficial, cair no simple-icons quando não der.
- **Reconhecimento por palavra inteira**, não substring: "Time do coração" não vira TIM, "Oitava parcela" não vira Oi — logo errado ao lado de dinheiro é pior que logo nenhum. Coberto por teste.
- Achado no caminho e anotado como pendência: o `SOURCES.md` dos **bancos** estava errado (dizia gerar 26 SVGs do simple-icons que na verdade vieram de outra fonte). Corrigido o texto; a origem real fica pra decidir com o dono.
- 213 testes de unidade, typecheck, lint (1 problema a menos que a linha de base), build e `noHardcodedColors` limpos.

## 2026-07-11 — fix: as 3 pendências técnicas + um bug de offline achado no caminho

- **Excluir uma transação offline não fazia nada.** `snapshot.data()` devolve `null` para um `serverTimestamp()` ainda pendente, então `deletedAt` chegava nulo no cache local: a transação continuava no Extrato e a compra continuava somando na fatura até o servidor responder. Num app offline-first, a UI desfazia a ação do usuário. Toda leitura de snapshot passa agora por `readSnapshotDoc` (`serverTimestamps: 'estimate'`).
- **Compra de cartão excluída voltava a contar na fatura.** O filtro de lançamento órfão usava a janela das 300 transações mais recentes; uma compra antiga que saísse dela sumia do conjunto de "excluídas" e o valor **voltava** — a fatura podia até deixar de estar paga. Agora o `useCardsData` consulta o servidor pelos ids que a janela não cobre (normalmente nenhum) e, na dúvida, mantém o lançamento: sumir com ele apagaria dívida real.
- **Trava de exclusão de conta era furada** pelo mesmo motivo: uma conta antiga parecia vazia e podia ser apagada, deixando as transações órfãs. Passou a perguntar ao servidor.
- **Recorrência gerava despesa em dobro**: a Cloud Function das 6h e o botão "Registrar" criavam transações independentes para a mesma ocorrência. Agora as duas usam um id derivado de `(regra, data da ocorrência)` — a segunda escrita cai no mesmo documento e é rejeitada pela regra do Firestore, o que está provado por teste no emulador. O botão "Registrar" também sumiu das recorrências que ainda não venceram (mostram "Em dia"); clicar ali lançava despesa inexistente e ainda pulava um período.
- **Código morto removido**: `useFinanceData` recalculava um `dashboard` sem faturas, payday nem `availableMode` que nenhuma tela consumia.
- `generateRecurrences` deployada com autorização do dono, então a idempotência vale dos dois lados.
- 193 testes de unidade + 44 de regras, typecheck, lint e builds (app e functions) limpos. Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-10 — fix: `npm run test:rules` desbloqueado (e 5 testes que ele revelou quebrados) + clareza na tela de Recebimento

- **`npm run test:rules` voltou a rodar**, depois de meses bloqueado. O Java desta máquina tinha dois JDK 25 **sem a pasta `bin/`** e um stub órfão da Oracle primeiro no PATH do sistema, morrendo com `0xC0000409`. Como `firebase-tools` chama `spawn("java")` cru e ignora `JAVA_HOME`, e corrigir o PATH do sistema exige admin, o script passou a usar `scripts/with-java.mjs`: acha um JDK que de fato executa e o coloca na frente do PATH só daquele comando.
- **Ao rodar, a suíte acusou 5 falhas — todas nos testes, não nas regras.** O seed criava `users/charlie` antes do teste que deveria *criar* a fundação (virava update); os testes de casal usavam id `coupleA`, mas a regra exige `^couple_`; o payload de teste não tinha `coupleMode` nem `displayName` (ler campo ausente numa rule é *evaluation error*, não `false`); e o convite tinha `expiresAt` fixo em `2026-06-16`, uma data que já passou. 43/43 passando agora, e um teste de mutação confirmou que a suíte realmente pega uma regra sabotada.
- **Excluir cartão com fatura em aberto** agora avisa, com o valor na frente, que a dívida vai parar de contar no "Comprometido" e as faturas somem do app (as compras continuam no Extrato). O texto anterior prometia que "as faturas continuam no histórico" — não continuam.
- **Tela de Recebimento reescrita**: clicar num modo não dava retorno nenhum (o "Salvo." ficava no rodapé, fora da tela) — agora há um selo "Salvo" que aparece e some. A tela também mostra **a data-limite real em vigor** ("Hoje o corte é 5 ago — seu próximo recebimento"), usando a mesma função do Dashboard, e explica em português o que a data de recebimento faz e o que é o período de dias.
- No modo Conservador, a seção de recebimento fica recuada com um aviso: nada ali muda o resumo.
- **Rótulo errado no cartão**: "Fatura em aberto" mostrava a soma de *todas* as faturas (o limite usado), não a fatura atual. Virou "Limite usado".
- Campo de valor da recorrência vinha preenchido com `"R$ 39,90"` em vez de `"39,90"`, fora do padrão dos outros campos de dinheiro.
- 178 testes de unidade + 43 de regras passando, typecheck e build limpos, lint com 2 problemas a menos que a linha de base.

## 2026-07-09 — fix: 7 bugs de cartão/parcela/Comprometido + a pessoa escolhe como o "Disponível" é calculado

- **Cartão excluído continuava listado em Cartões e ainda comprometia saldo e limite** — `deleteCard` é soft-delete e nada filtrava `isActive`. Corrigido na raiz (`useCardsData`), verificado ao vivo: o Comprometido volta sozinho ao excluir o cartão.
- **Parcelamento colidia num mês e pulava outro**: compra 4x em 31/jan num cartão que fecha dia 28 gerava duas parcelas em fevereiro e nenhuma em março (`addMonths` clampando fevereiro). Novo `resolveInstallmentCycle` garante faturas consecutivas.
- **Antecipação de parcelas**: oferecia faturas *passadas* como se fossem futuras (antecipá-las jogaria a dívida pra frente), e antecipar uma parcela escondia as irmãs da mesma compra. Lógica extraída pra `src/cards/anticipation.ts` com 10 testes. Antecipação de parcela de meses depois testada ao vivo — limite consumido não muda.
- **Comprometido**: conta que vence no próprio dia do salário sumia do cálculo, e o número mudava conforme a hora do dia em que o app abria. O corte agora é sempre fim do dia.
- **Push "Fatura fechada: R$ 0,00"**: `outstandingBalanceCents` nunca é gravado no Firestore (o total vem do ledger, no cliente) e a Cloud Function lia o campo cru. Agora calcula do ledger — **exige `firebase deploy --only functions`**.
- **Novo: escolha do modo de "Disponível"** (`conservative` × `until_payday`), com mini tutorial que abre no primeiro Dashboard, trocável e revisitável em Configurações. Nasce do ponto levantado pelo dono: o app não pode simplesmente *deduzir* que um salário futuro vai cair. O default mantém o comportamento atual.
- **"Sem categoria" aparecia duas vezes** no Resumo de gastos e no donut da Análise: o agrupamento usava `?? 'uncategorized'`, e compra no cartão sem categoria grava `categoryId: ''` — string vazia passa pelo `??`. Trocado por `||`.
- **`fireWrite` agora loga `permission-denied` no console em desenvolvimento** — o silêncio de propósito já escondeu dois bugs graves por semanas, e escondeu um terceiro nesta sessão (pego olhando a resposta HTTP do Firestore).
- Regras do Firestore e Cloud Functions **deployadas e verificadas ao vivo** com autorização do dono. 178 testes passando, typecheck e build limpos. Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — fix: cartão/fatura não excluía direito, Comprometido contava fatura cedo demais, antecipação de parcelas nunca funcionou + feature de payday

- **4 bugs reais de cartão/fatura corrigidos**: excluir compra no cartão não saía da fatura; "fatura atual" mostrava a fatura errada quando havia parcelamento; cartão que fecha tarde/vence mês seguinte calculava vencimento antes até da própria compra; e o mais sério — **antecipação de parcelas nunca funcionou em produção** (regra do Firestore nunca aceitou o tipo de lançamento de crédito, silenciosamente rejeitada desde que a feature existe).
- **Comprometido/Disponível revisados a fundo**: o critério de quando uma fatura conta como "comprometida" mudou de "mês do ciclo da compra" pra "data de vencimento real" (mesmo cutoff de contas a pagar/recorrências), por decisão do dono, depois de investigar um caso concreto onde uma fatura que só vencia mês seguinte já derrubava o "Disponível" hoje.
- **Nova pergunta de onboarding "quando você recebe?"** (dia fixo / Xº dia útil / fim do mês / renda variável — plantão, freela, autônomo) alimenta esse cutoff automaticamente, com janela de dias configurável em Configurações → Recebimento. Dashboard agora explica de onde vem o número do Comprometido.
- Nomenclatura desktop/mobile unificada (Extrato→Transações, Casal→Compartilhado) e confirmação adicionada antes de excluir qualquer transação.
- Todas as mudanças de `firestore.rules` desta sessão foram revisadas só manualmente (Java local quebrado bloqueia `npm run test:rules`, ver `CLAUDE.md`), deployadas com autorização explícita do dono e verificadas ao vivo em produção.
- 147 testes passando (vários novos), typecheck limpo. Detalhes completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — fix: datas cruas ("2026-07-08") em Extrato, Contas a pagar, Faturas, Cartões, Recorrências e Busca

- Extensão do fix de data amigável aplicado antes só na Dashboard: `toDateInputValue` (formato de `<input type="date">`) trocado por `formatFriendlyDate` ("Hoje", "Ontem", "8 jul") em `TransactionsPage`, `BillsPage`, `InvoicePage`, `CardDetailPage`, `CardsPage`, `RecurringPage` e `SearchPage`. Sessão spawnada separadamente (chip de sugestão) e revisada/mesclada aqui.
- 3 riscos anotados em `CLAUDE.md` (seção temporária, remover ao resolver): Java local quebrado bloqueando `npm run test:rules`, `fireWrite` sem log nem em dev, e um `spread` frágil em `accountDeletionService.ts` que pode repetir a mesma classe de bug da regra de categoria se o tipo `WorkspaceRef` ganhar um campo novo.

## 2026-07-09 — fix: criar categoria nova falhava silenciosamente + auditoria de regras

- Ao lançar uma despesa/receita e criar categoria nova no picker, o app também salvava a transação incompleta (form da categoria, dentro de um `BottomSheet`/portal, ainda é "filho" do form da transação na árvore React — sem `event.stopPropagation()`, o submit se propagava pros dois). Corrigido em `CategoryField.tsx`.
- Causa mais séria: `validCategoryCreate` (`firestore.rules`) nunca foi atualizada quando o campo `createdBy` foi adicionado no cliente — toda categoria personalizada era rejeitada pelo servidor **silenciosamente há ~3 semanas**. Corrigida e deployada.
- Ao corrigir a regra, quebrei sem querer o seeding das categorias padrão (que nunca envia `createdBy`) — pego e corrigido na mesma sessão antes de virar um problema novo. Regra final trata os dois casos (categoria padrão sem `createdBy` vs. personalizada com `createdBy` obrigatório).
- **Auditoria completa**: todo write do app (`financeService`, `cardService`, `sharedService`, `workspaceService`, sync de tema, tokens de push) comparado campo a campo contra as regras do Firestore — nenhum outro desalinhamento encontrado. Teste novo em `tests/firestore.rules.test.ts` cobrindo os dois ramos da regra de categoria.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — feat: revisão de design da Dashboard

- **Ícone de categoria descentralizado** (`.category-mark`): conflito de especificidade CSS com `.list-row span` (regra genérica que empilha texto nas linhas de lista) derrubava o `display: grid` que centraliza o ícone — o SVG ficava encostado no canto superior-esquerdo do quadrado colorido. Fix: seletor `span.category-mark` (mesma especificidade, vence por ordem no arquivo).
- **Datas amigáveis em português**: `toDateInputValue` (formato `yyyy-MM-dd`, pensado só pra `<input type="date">`) estava sendo exibido cru como texto pro usuário ("2026-07-08"). Novo helper `formatFriendlyDate` (`financeDates.ts`) — "Hoje", "Ontem", "8 jul" ou "8 jul 2025" (locale pt-BR do date-fns) — aplicado em "Últimos movimentos" e "Próximos compromissos" da Dashboard. O mesmo problema existe em outras telas (Extrato, Contas a pagar, Faturas, Cartões, Recorrências, Busca) — ainda não corrigido lá.
- **"Próximos compromissos" vazio** ganhou ilustração própria (calendário + check), consistente com o resto do app — antes era só texto seco enquanto o card ao lado (transações) já usava `EmptyState` ilustrado.
- **"Resumo de gastos"** agora mostra o tile colorido da categoria (`CategoryMark`) ao lado do nome, criando o mesmo fio visual da lista de transações — agrupamento trocado de nome pra ID de categoria pra viabilizar.

## 2026-07-09 — fix: campo "Saldo inicial" pré-preenchido com "0,00" ao criar conta

- Em Contas → Criar conta, o campo "Saldo inicial" vinha com o valor real `"0,00"`, exigindo apagar antes de digitar. Os demais campos de dinheiro do app (Metas, Contas a pagar, Recorrências, Faturas, Cofrinho e despesas do casal, Nova transação) já usavam `"0,00"` só como placeholder, some ao focar. `AccountsPage.tsx` era o único fora do padrão — alinhado.

## 2026-07-09 — fix: exclusão de conta no admin retornava "internal"

- Digitar `EXCLUIR` e confirmar na tela de admin sempre falhava com erro genérico "internal", mesmo com a frase certa.
- Causa: a Cloud Function `adminDeleteUser` (`functions-admin/`) estava sem a permissão pública de invocação (`roles/run.invoker` para `allUsers`) no Cloud Run — a requisição era bloqueada pela infraestrutura antes de chegar no código, então o SDK do Firebase nunca via o erro de verdade. Provavelmente perdida no redeploy que resolveu o conflito de codebases em 2026-07-07.
- Fix aplicado direto via API do Cloud Run (`setIamPolicy`), igualando à policy do `adminForceLogout`. Um redeploy comum (`firebase deploy`) **não** reaplica essa permissão em functions já existentes — só na criação.
- Bônus: `DeleteConfirmModal` (`AdminPage.tsx`) passou a usar `.trim()` na comparação com `EXCLUIR`, igual à autoexclusão em `LoginMethodsPage.tsx` — protege contra espaço acidental deixando o botão travado sem aviso.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: domínio próprio granativa.com.br

- Domínio comprado no registro.br e adicionado no Vercel (apex `A` + `www` CNAME).
- Código atualizado pra `https://granativa.com.br`: canonical e `og:image` em `index.html`, todas as URLs de `public/sitemap.xml` e `public/robots.txt`, links de notificação push nas Cloud Functions (`functions/src/automation.ts`, `push.ts`, `index.ts`, `.env`).
- `src/components/Seo.tsx` já era dinâmico (`window.location.origin`) — não precisou mudar.
- `functions` já deployado com o `APP_BASE_URL` novo — links de push (fatura fechada, conta a vencer, lembrete diário) já usam o domínio novo em produção.
- Zona DNS configurada no registro.br (registro `A` na raiz + `CNAME` em `www`).
- **Migração completa e confirmada**: HTTPS válido, landing carregando, login com Google testado em produção no domínio novo pelo dono.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — fix: "Gasto no mês" cortava o valor com "..." na Análise

- O card destaque "Gasto no mês" ficava estreito (dois cards lado a lado no mobile) e a fonte grande do valor não cabia, cortando "R$ 430,..." com reticências.
- Faixa de KPI virou grid: o card destaque ocupa a linha inteira (número herói, valor nunca trunca — testado até 7 dígitos), e "Maior categoria" + "vs. mês anterior" ficam lado a lado embaixo. Mesma hierarquia do Dashboard.

## 2026-07-08 — fix: clareza visual dos modos do casal (pareciam se acumular)

- Os 3 modos são níveis progressivos (cada um mostra as seções do anterior + a sua), o que dava a impressão de "ativar os 3 juntos" ao trocar. É sempre um modo só.
- Badge do modo atual visível no topo do espaço parceirado (antes só aparecia escondido em "Gerenciar espaço"), clicável pra trocar, com texto deixando claro que o cofrinho funciona em qualquer modo.
- Botões "Ativar transparência/equilíbrio" renomeados pra "Mudar pra..." (deixa claro que troca, não soma).
- Tag "Atual" no seletor de modo marcando o modo vigente, distinto do que está sendo selecionado — evita trocar sem querer.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — fix: 3 bugs no espaço do casal achados testando com dispositivos reais

- Corrigida race condition no botão "Cancelar espaço compartilhado" — ficava clicável (mas inerte) por 1-2s antes do workspace terminar de carregar.
- Corrigido bug real em `firestore.rules`: trocar o modo do espaço (`updateCoupleMode`) sempre dava "Missing or insufficient permissions" pros dois lados — a regra só previa as transições de aceitar/sair, não uma mudança isolada de modo.
- Testado ponta a ponta com uma segunda conta real aceitando o convite (sem reload na aba de quem convidou) — página atualizou sozinha; terceiro problema relatado não reproduziu, provável consequência dos outros dois.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: admin com paginação/detalhe de usuário + fix de vazamento na exclusão de conta

- Bug real corrigido: `users/{uid}/fcmTokens` (token de push) nunca era apagado nem na autoexclusão (`accountDeletionService.ts`) nem na exclusão pelo admin (`functions-admin/src/index.ts`) — ficava órfão no Firestore pra sempre. Corrigido nos dois fluxos; alinhei também a lista de subcoleções (`comments`) entre os dois arquivos.
- Admin (`/admin`): teto fixo de 500/200 usuários/casais/convites virou paginação de verdade por cursor (`startAfter`, 100 por página, botão "Carregar mais").
- Novo painel de detalhes por usuário (clicar na linha): perfil + lista de espaços (pessoal/casal, papel, status) — só metadados que o admin já podia ler, sem tocar em regra de dado financeiro.
- Nova ação "Forçar logout" (`adminForceLogout`, nova Cloud Function em `functions-admin/`, `auth.revokeRefreshTokens`) — precisa de deploy de functions antes de funcionar em produção.
- Filtros por status (Casais: ativo/arquivado/deletando; Convites: ativo/expirado/aceito) via StatCards clicáveis, mais ordenação por coluna nas 3 tabelas.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: reestruturação da tela de Análise (mês, empty states, busca)

- Cards de KPI e cabeçalhos passaram a reaproveitar `.metric-card`/`.metric-icon`/`.section-heading` do design system (classes que já existiam em `global.css`, nunca usadas) em vez de ~40 blocos de estilo inline.
- Empty states com `EmptyState` (ilustração) no gráfico de categoria e no histórico mensal, no lugar de texto seco.
- Navegação por mês nova (seletor `‹ Mês ›`) — KPI, categoria e "vs. mês anterior" acompanham o mês escolhido; histórico de 6 meses continua fixo como tendência.
- Busca por texto saiu do meio da rolagem e virou `BottomSheet` sob demanda (ícone no cabeçalho); link "Buscar" do Dashboard agora abre a busca direto.
- Corrigido ao testar com dado real: legenda do donut cortando nomes curtos ("Casa" → "C...") e nome de categoria longo cortando no card "Maior categoria" ("Alimenta...").

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: reestruturação da UI do espaço do casal + 2 bugs corrigidos nas regras do Firestore

- `SharedSpacePage.tsx` (880 linhas) dividida em `src/pages/shared/` (`CoupleInviteSection`, `CoupleModeSheet`, `CoupleSavingsSection`, `CoupleExpensesSection`) — página principal virou orquestrador.
- Fluxo de convite reescrito: uma ação primária por estado (gerar/compartilhar/regenerar/cancelar) em vez de até 6 botões simultâneos; "Compartilhar" usa `navigator.share` com fallback pra copiar.
- Bug real corrigido: recarregar a página depois de gerar um convite fazia o app "esquecer" que já existia um ativo — clicar em gerar de novo invalidava silenciosamente o código já enviado. Agora mostra "Convite ativo, expira em..." e avisa antes de invalidar.
- 2 bugs achados e corrigidos em `firestore.rules` (impediam criar o espaço/aceitar convite de verdade): checagem de entitlement de billing não seguia o mesmo default do cliente; regras de criação do membro (dono/parceiro) não incluíam `displayName` na lista de campos permitidos.
- Formulário de nova despesa virou `BottomSheet` (padrão do app); seleção de modo do casal deixou de estar duplicada (uma lista só, reusada em criar/trocar).

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: prompt de instalação do PWA no Dashboard

- Verificação do manifest (`vite.config.ts`, plugin VitePWA): conteúdo correto, mas achei 2 bugs pequenos — `lang` não estava setado (caía no default `en` num app em português) e os caminhos dos ícones referenciavam `Granativa-app-icon-*.png` (G maiúsculo) enquanto os arquivos reais em `public/brand/` são todos minúsculos. Confirmei ao vivo contra a produção que o Vercel serve como case-insensitive (não estava 404, mas ficava frágil) — corrigido de qualquer forma.
- Novo `InstallPromptSheet` (montado só na tela inicial `/app`, via `DashboardPage`): mostra um bottom sheet central com botão "Instalar agora" quando o navegador suporta o evento nativo `beforeinstallprompt` (Android/Chrome/Edge/desktop); no iPhone/iPad (sem esse evento no Safari) mostra um tutorial visual de 3 passos (Compartilhar → Adicionar à Tela de Início → Adicionar).
- Nunca aparece pra quem já instalou (`display-mode: standalone` / `navigator.standalone`) nem pra quem já dispensou uma vez (`localStorage`, permanente).
- Captura do `beforeinstallprompt` acontece desde o boot (`src/pwa/installPrompt.ts`, importado em `main.tsx`), não só quando a tela do Dashboard monta — o evento pode disparar antes.

## 2026-07-08 — fix: texto preto ilegível nos 4 temas escuros

- Causa raiz: `global.css` usa as diretivas legadas `@tailwind base/components/utilities` (estilo v3), mas o Tailwind instalado é v4 — o plugin `@tailwindcss/postcss` v4 não processa essa sintaxe, então o preflight nunca rodava. Sem o reset `button/input/select/textarea { color: inherit }` do preflight, qualquer elemento nativo sem classe (ex.: `<h2>` dentro de `<button>` sem estilo) caía no preto padrão do navegador — invisível nos 4 temas escuros (Obsidian, Midnight, Aurora, Rose Gold). Reproduzido em 5 páginas com o mesmo padrão de botão colapsável (Contas, Cartões, Compromissos, Metas, Compartilhado).
- Fix: reset explícito em `global.css` (`button, input, select, textarea { font: inherit; color: inherit; }`), independente do Tailwind. Não migrei a diretiva pra `@import "tailwindcss"` (mudança maior no pipeline de build) — só resolvi o sintoma real com uma regra CSS padrão.

## 2026-07-08 — fix: UX de aparência, segurança da conta e navegação

- **Saldo do Dashboard**: mostrava "—" por 1-2s a cada reload enquanto o Firestore sincronizava. Cache local (`dashboardSummaryCache.ts`, mesmo padrão do `profileCache.ts`) mostra o último valor conhecido até o dado real chegar.
- **Bug de troca de tema**: clicar num tema às vezes revertia pro anterior. Causa: `hydrateFromProfile` aplicava qualquer snapshot do perfil vindo do Firestore, inclusive um em trânsito com o tema antigo. Fix: `hasLocalOverride` no `appearance.store.ts` — depois da primeira escolha manual na sessão, o Firestore só hidrata, nunca mais sobrescreve.
- **Tela de Segurança reescrita** (`LoginMethodsPage.tsx`): bloco de Perfil (nome/email) no topo, UID e "workspace" removidos da tela, métodos de login como lista com badge "Ativo", explicação clara pra quem loga só com Google. Exclusão de conta agora só exige digitar EXCLUIR — sem campo de senha.
- **Aparência simplificada**: seção "Conforto de leitura" (densidade/fonte/reduzir animações) removida. Grid de temas compactado — ficava 1 coluna gigante no mobile por um `@media` que colapsava `.theme-grid`; agora sempre 3 colunas, cards menores.
- **Navegação**: nenhuma tela resetava o scroll ao trocar de rota (abria no meio da página anterior). `ScrollToTop.tsx` novo, montado uma vez em `App.tsx`.
- **Menu**: Aparência e Segurança agora ficam agrupadas sob o rótulo "Conta" na sidebar e no menu "Mais" do mobile, em vez de soltas entre os outros itens.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: `adminDeleteUser` duplicada em 2 codebases de Cloud Functions

- Deploy de functions revelou uma duplicata real: `adminDeleteUser` existia tanto em `functions/src/admin.ts` (codebase `billing`) quanto em `functions-admin/src/index.ts` (codebase `admin`, isolado de propósito desde 17/06 pra deployar sem depender de secrets do Stripe). O Firebase rejeitou o deploy ("More than one codebase claims...").
- `firebase functions:list` confirmou: a função ao vivo já pertencia ao codebase `admin`. Removido o duplicado de `functions/src/admin.ts` (arquivo deletado, export tirado de `functions/src/index.ts`) — `functions-admin/` continua sendo a única fonte de verdade.
- As 10 functions dos 2 codebases foram redeployadas com sucesso (`npx firebase deploy --only functions`), incluindo a limpeza da referência a `comments` (feature já removida) que só tinha sido sincronizada no codebase errado antes.

## 2026-07-07 — feat: painel admin funcional (QA + UX)

- **2 bugs de segurança corrigidos**: admin podia deletar a própria conta sem aviso especial (sem proteção contra auto-exclusão); confirmação de exclusão comparava com o primeiro nome do usuário — se o nome estivesse vazio, o botão de deletar ficava liberado sem digitar nada. Trocado por frase fixa "EXCLUIR" (mesmo padrão da autoexclusão do usuário) + linha "Você" bloqueada na própria conta.
- **Convites agora são gerenciáveis**: aba Convites ganhou busca, tira-teimas de status (Ativos/Expirados aguardando TTL/Aceitos) e botão "Revogar" — antes só dava pra visualizar. Regra do Firestore liberada pra admin revogar (`isAdmin()` em `validInvite`... delete).
- **Busca adicionada** nas abas Casais e Convites — só existia em Usuários antes.
- **Contagens truncadas sinalizadas**: "500+"/"200+" em vez de um número que parece exato quando a query bate no teto (`ADMIN_USERS_LIMIT`/`ADMIN_COUPLES_LIMIT`/`ADMIN_INVITES_LIMIT`).
- Limpeza: `WORKSPACE_COLLECTIONS` na Cloud Function `adminDeleteUser` não referencia mais `comments` (feature removida na sessão anterior).

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria de uso do Firestore (leituras/escritas desnecessárias)

- **`coupleInvites`**: política de TTL nativa configurada no Firestore (campo `expiresAt`) — convites expirados são apagados sozinhos, sem Cloud Function. Configuração manual, feita direto no Console.
- **Faturas de cartão**: `subscribeInvoices` limitado às 24 mais recentes por cartão (~2 anos). Sem isso, cada fatura carregada abria seu próprio listener de ledger em `useCardsData` e o total de listeners simultâneos crescia sem parar conforme a conta envelhecia.
- **Feature morta removida**: sistema de comentários do espaço do casal (`SharedComment`, `addSharedComment`, `subscribeSharedComments`, coleção `comments`) — existia o listener e a escrita, mas nenhuma tela nunca chamou nem exibiu isso. Puro custo, zero uso. Removido de ponta a ponta: tipo, schema, serviço, hook, regra do Firestore.
- **Token FCM**: parava de gravar o mesmo token no Firestore toda vez que o app abria. Agora compara com um cache local (`src/pwa/pushTokenCache.ts`) antes de escrever.
- **Guia de quando escalonar**: documentado em `SESSAO.md` o critério prático pra decidir quando vale adicionar `.limit()` numa coleção (regra de bolso: ~500-1000 docs por workspace) e o que monitorar no painel do Firestore.

Detalhes e raciocínio completo em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — feat: resgatar do cofrinho do casal

- Nova ação "Resgatar" no cofrinho compartilhado: retira do total do casal e, opcionalmente, credita como entrada numa conta pessoal — espelha "Guardar" em sentido inverso.
- `GoalContribution` ganhou campo `type: 'deposit' | 'withdrawal'`; estatísticas por pessoa/mês extraídas para a função pura `calculateCoupleGoalStats` (12 testes novos).
- Nova categoria padrão "Cofrinho" (`both_cofrinho`) para as transações de guardar/resgatar não caírem em "Sem categoria".
- Regras do Firestore atualizadas (`goalContributions` aceita `type`) e deployadas em produção.
- Revisão de design da `SharedSpacePage`: já seguia os padrões do app; toggle Guardar/Resgatar e botões em linha reaproveitam os mesmos componentes usados no resto do app (sem CSS novo).

Detalhes e decisões de design em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria pré-lançamento, testes de lógica financeira e recorrência com anchorDay

- Design/consistência: cores literais da `SearchPage` viraram tokens (`noHardcodedColors` volta a passar), `window.confirm` trocado por `useConfirm`, empty states ilustrados em Bills/Recurring/Accounts.
- Fire-and-forget consertado em Bills/Cards/Recurring (formulário não trava mais esperando o servidor) e bug de boot offline corrigido (saldo podia piscar R$ 0,00 antes do cache carregar por completo).
- Suíte de testes de domínio ampliada de 46 para 113 testes (saldo, faturas de cartão, casal, dinheiro, recorrência).
- 2 bugs corrigidos: `parseMoneyToCents` inflava 100x um valor com ponto decimal; `nextOccurrenceDate` pulava fevereiro inteiro numa recorrência no dia 31.
- Novo campo `anchorDay`: recorrência mensal/anual guarda o dia original e volta a ele quando o mês permite (client + Cloud Function + regras do Firestore, já deployadas em produção).

Detalhes técnicos completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-06-22 — feat: redesign página de Análise (SearchPage)

- **KPI strip**: 3 cards no topo — gasto total do mês (destaque laranja), maior categoria com valor, variação % vs. mês anterior com ícone `TrendingUp`/`TrendingDown`/`Minus`.
- **Donut**: aumentado para 200px; centro exibe nome + valor + percentual da categoria selecionada; legenda substituída por barras de progresso coloridas por categoria.
- **Histórico mensal**: altura do gráfico de barras aumentada para 220px; legenda própria com quadradinhos no lugar do `<Legend>` padrão do Recharts; tooltip com uppercase label.
- **Busca**: card de resultados oculto quando campo está vazio.

## 2026-06-22 — feat: logos oficiais com transparência real + fix Firestore coupleMode

- **Logos oficiais**: todos os PNGs de brand substituídos por versões com alpha real (sem fundo branco). `granativa-logo-horizontal.png` (nav/og:image), `granativa-logo-primary.png`, `granativa-logo-stacked.png` e `granativa-logo-stacked-hq.png` adicionados.
- **Favicons**: `favicon-16x16.png` e `favicon-32x32.png` transparentes substituem o `favicon.png` legado (784KB). `index.html` atualizado.
- **Nav/footer landing**: `LandingShell` agora usa a logo horizontal como `<img>` única (sem texto duplicado em HTML). `BrandLogo.tsx`: paths corrigidos para lowercase.
- **fix Firestore**: `validCoupleWorkspaceCreate` não listava `coupleMode` no `hasOnly()` — qualquer usuário recebia `permission-denied` ao criar espaço compartilhado. Corrigido + validação `in ['savings_only', 'transparent', 'balanced']`. `validCoupleWorkspaceUpdate` também corrigido para permitir troca de modo. Regras deployadas.
- **`Seo.tsx`**: og:image corrigido para `granativa-logo-horizontal.png` (casing lowercase).

## 2026-06-22 — rebrand: Granix → Granativa + landing UX mobile

- **Nome final**: app renomeado de "Granix" para **Granativa** (portmanteau: grana + ativa). 35 arquivos atualizados, concordância de gênero corrigida (a/na/da Granativa).
- **Assets**: `public/brand/granativa-*.png` (10 arquivos, casing lowercase). Paths em `index.html` e `LandingShell.tsx` corrigidos.
- **Landing mobile — hover removido**: `whileHover` eliminado de `TiltCard` e couple-card; eventos de mouse no hero ligados só em `(hover: hover)` via `canHover` ref; estilos `:hover` movidos para `@media (hover: hover)`.
- **Stats band**: mantido em linha horizontal no mobile (sem `flex-direction: column`), padding e fonte compactados em `≤520px` — números não quebram mais linha.
- **Botões hero**: `flex-direction: column; width: 100%` em `≤640px` — CTAs empilhados e legíveis no celular.
- **Nav mobile**: botão ghost "Entrar" oculto em `≤480px` para dar espaço ao "Começar grátis".
- **`CountUp`**: simplificado para `motion.span` único com texto completo — elimina quebra de linha entre número e sufixo `%`.

## 2026-06-20 — feat: landing page redesenhada com Framer Motion 3D

- **Hero light**: fundo claro (branco → areia), texto estático, stage (phone + badges) inclina em 3D com o mouse via `rotateX/Y` + `preserve-3d` e `useSpring`.
- **Parallax em camadas**: stage sobe mais devagar no scroll (`useScroll`); badges em Z-depths diferentes (`z: 60 / 30 / -15`) criam profundidade real; phone tem gloss de luz (`useMotionTemplate`) que desloca com o cursor.
- **Grade perspectiva**: `linear-gradient` com `perspective(700px) rotateX(-62deg)` e mask cria piso de grade laranja recuando para o fundo.
- **Seções**: stats band, bento com `TiltCard` 3D hover (`rotateX/Y` no `whileHover`), seção do casal com card hover + `rotateZ`, steps com `whileInView`, FAQ accordion, CTA dark. Tudo com `RevealSection` (useInView + stagger).
- Detalhes técnicos em `docs/history/2026-06.md`.

## 2026-06-20 — rebrand: Zerou → Granativa

- **Novo nome**: app renomeado de "Zerou" para **Granativa**. Tagline mantida: "Controle individual. Organização a dois."
- **Novo logo**: ícone de duas bolas sobrepostas (sólida laranja + outline escuro), gerado com IA. Assets em `public/brand/Granativa-*.png` (`Granativa-app-icon-180/192/512`, `Granativa-maskable-512`, `Granativa-logo-horizontal`, `Granativa-symbol`).
- **PWA manifest**: `name`, `short_name`, `theme_color` (`#EE5524`), `background_color` (`#FAF8F5`) e todos os ícones atualizados em `vite.config.ts`.
- **`index.html`**: `<title>`, meta description, OG tags e `apple-touch-icon` atualizados. Favicon agora é PNG (`/favicon.png`).
- **Componentes e textos**: todas as ocorrências visíveis de "Zerou" → "Granativa" com artigo correto (o/do/na Granativa). Version strings internas do Firestore (`zerou-v12.2-*`, `zerou-cache`) mantidas para não invalidar registros existentes.

## 2026-06-18 — feat: gráficos interativos de análise de gastos (Recharts)

- **`SearchPage` → `Análise`**: donut interativo (clique destaca fatia/legenda, centro mostra categoria + valor) e gráfico de barras entradas vs saídas dos últimos 6 meses. Recharts instalado (`v3.8.1`). Nav renomeada de "Busca" para "Análise" com ícone `BarChart2`.

## 2026-06-18 — fix: ícone de categoria, delete de cartão, InvoicePage simplificada

- **CSS mobile**: `.list-row--with-icon` agora mantém `flex-direction: row` dentro do `@media (max-width: 900px)` — ícone de categoria deixou de quebrar para cima do texto.
- **`deleteCard`** (`cardService.ts`): soft-delete com `isActive: false`. Botão de lixeira adicionado no `CardDetailPage` com `ConfirmDialog` antes de confirmar.
- **`InvoicePage` simplificada**: "Fechar fatura" e "Conciliar manualmente" removidos da UI principal (automação cuida do fechamento). Pagamento via `BottomSheet`. Compras e pagamentos em seções separadas. Antecipação, créditos e tarifas em `<details>` colapsados.

## 2026-06-18 — feat: notificação diária às 20h para registrar gastos

- **`sendDailyLogReminder`** (`functions/src/automation.ts`): Cloud Function scheduled todo dia às 20h (BRT). Busca todos os tokens FCM cadastrados (`collectionGroup('fcmTokens')`), envia push em lotes de 500 com título "Como foi o dia?" e corpo "Registre seus gastos antes de dormir." linkando para `/app/transactions/new`.
- Exportada em `functions/src/index.ts` e deployada em `billing:sendDailyLogReminder(southamerica-east1)`.

## 2026-06-18 — perf: boot instantâneo em internet fraca, saldo não pisca mais

- **`AuthContext`**: estado agora inicializa **sincronamente** do `localStorage` — se o usuário já logou antes, `loading` começa como `false` e o app abre direto sem tela "Carregando Zerou...". Firebase confirma a sessão em background. Timeout de fallback: 1800ms → **500ms**. Bug corrigido: sem cache + Firebase não responde → agora libera `loading=false` em vez de travar.
- **Google Fonts não-bloqueantes** (`index.html`): `<link rel="stylesheet">` externo era render-blocking em redes lentas. Trocado por `rel="preload" onload` — browser baixa em paralelo sem travar o render.
- **Workbox runtime cache** (`vite.config.ts`): fontes do googleapis.com e gstatic.com agora são cacheadas com `CacheFirst` 1 ano — ficam disponíveis offline após primeira visita.
- **Dashboard** (`DashboardPage`): saldo total, disponível e comprometido mostram `—` enquanto `finance.loading` é true, eliminando o flash `R$ 0,00` antes dos dados do Firestore chegarem.

## 2026-06-18 — fix: fatura aberta permanece aberta com pagamento antecipado

- **`resolveInvoiceStatus`**: fatura com lifecycle `'open'` agora sempre retorna `'open'` (exceto `'overpaid'`). Antes, um pagamento total numa fatura ainda aberta a marcava prematuramente como `'paid'` — comportamento errado, pois novas compras ainda podem entrar antes do fechamento.
- Consequência cascata correta: `advance` no pagamento é sempre `true` enquanto a fatura está aberta (qualquer pagamento antes do fechamento é um adiantamento); `Comprometido` já excluía por `outstandingBalanceCents > 0`, então continua correto.
- Teste atualizado para usar `lifecycle: 'closed'` nos cenários de `'partial'`/`'paid'`; novo teste cobre fatura aberta com pagamento antecipado permanecendo `'open'`.

## 2026-06-18 — antecipação de parcelas estilo Nubank

- **Novo tipo de ledger** `installment_anticipation_credit`: credita o invoice futuro quando uma parcela é antecipada, reduzindo seu `outstandingBalanceCents` client-side via `calculateInvoice`.
- **`anticipateInstallments`** reescrito em `cardService.ts`: usa `writeBatch` — adiciona `installment_anticipation_credit` em cada invoice futuro selecionado e `installment_anticipation` (débito total) no invoice atual. Fire-and-forget.
- **Schema atualizado** (`anticipateInstallmentsSchema`): aceita `currentInvoiceId` + array de `credits` `{invoiceId, amountCents, sourceTransactionId}` em vez de valor manual único.
- **`InvoicePage`**: painel de antecipação substituído por seleção inteligente — lista parcelas futuras do mesmo cartão agrupadas por invoice, com checkbox por item, total ao vivo e "Confirmar antecipação". Parcelas já antecipadas são ocultadas automaticamente.
- Comprometido no Dashboard atualiza em cascata: invoices futuros com crédito de antecipação têm `outstandingBalanceCents` reduzido, saindo do cálculo se zerados.

## 2026-06-18 — UI premium: cabeçalhos, ícones de categoria, cards de conta, nav inferior

- **Cabeçalhos**: todas as páginas do app passaram a ter eyebrow + título compacto sem parágrafo de descrição (menos espaço desperdiçado, conteúdo aparece logo de cara).
- **Ícones de categoria**: `CategoryMark` (tile colorido 36×36 com ícone lucide) adicionado em todos os itens de lista de transações — em `TransactionsPage` e `DashboardPage` (recentes). Fallback por tipo: verde para renda, slate para transferências.
- **Contas como cards**: `AccountsPage` reescrita — contas exibidas como cards com gradiente escuro (`--gradient-slate`), saldo em destaque, bank-mark no canto. Form de cadastro agora colapsável (igual ao CardsPage).
- **Nav inferior**: slot 2 trocado de Cartões → Extrato (Transações); slot 4 mantém Cartões. Casal movido para o menu "Mais". Indicador de ponto laranja acima do ícone ativo.
- **Formulários colapsáveis**: `BillsPage` e `AccountsPage` ganharam mesmo padrão do `CardsPage` — form colapsado por padrão, toggle com chevron animado.
- **`CategoryMark`** exportado de `src/components/categoryIcons.tsx` — reutilizável em qualquer lista.

## 2026-06-18 — cartão: offline-first na fatura, fatura aberta em destaque, chip-row de conta

- **`InvoicePage`**: removido `guardAction` — pagamento, crédito, tarifa e antecipação são agora fire-and-forget com reset imediato do form. Botão de pagamento desabilitado até valor e conta estarem preenchidos.
- **`InvoicePage`**: campo "Pagar com qual conta?" trocado de dropdown (`SelectField`) para chip-row (consistência com BillsPage, RecurringPage, GoalsPage).
- **`CardDetailPage`**: fatura aberta aparece em destaque entre o bloco de limite e o formulário de compra, com link direto para pagar e valor em vermelho.
- **`CardsPage`**: cada cartão na lista agora exibe fatura aberta (mês de referência, vencimento, valor em vermelho) quando houver saldo pendente.

## 2026-06-17 — lógica financeira: pagamentos debitam contas, metas não viram gasto

- **`payBill`**: batch atômico marca conta como paga e cria transação de despesa (tag `bill`) debitando a conta selecionada. BillsPage abre sheet de confirmação com valor editável e chip de conta.
- **`recordRecurringPayment`**: batch avança `nextOccurrenceAt` para o próximo período e cria transação de despesa (tag `recorrente`). RecurringPage ganha botão "Registrar" que abre sheet com valor, conta e aviso da próxima data.
- **`contributeToGoalWithTransaction`**: batch incrementa `savedCents` da meta e, quando conta escolhida, cria despesa (tag `meta`). GoalsPage tem chip "De qual conta sai? / Só registrar" no sheet de contribuição.
- **`nextOccurrenceDate`**: função pura que avança uma data por `weekly` / `monthly` / `yearly`.
- **DashboardPage**: `spendingByCategory` exclui transações com tags `meta` e `cofrinho` — contribuições de meta/cofrinho não aparecem mais como gasto no resumo mensal.

## 2026-06-17 — redesign do modo casal e offline-first

- **Sistema de modos** (`coupleMode` no workspace): `savings_only` (só cofrinho), `transparent` (despesas visíveis) e `balanced` (barra proporcional de quem cobre mais). Pode ser escolhido na criação e mudado em qualquer momento via "Gerenciar espaço".
- **Nomes reais**: `WorkspaceMembership.displayName` salvo na criação do workspace e no aceite do convite; "Dono/Parceiro(a)" substituído pelo nome real da pessoa.
- **Validação de saldo no cofrinho**: "Guardar" valida o saldo da conta pessoal selecionada e bloqueia com mensagem amigável se insuficiente.
- **Removido breakdown individual** do cofrinho ("Você juntou / Parceiro juntou"); agora só aparece o total unificado.
- **Removido fluxo de acerto de contas** (settlements); substituído pelos modos transparent/balanced que mostram proporção sem acerto formal.
- **Offline-first**: todos os writes em `SharedSpacePage` refatorados para fire-and-forget (`.catch`); `guardAction` removido. Confirm dialogs aguardam normalmente; o write subsequente é fire-and-forget.
- **CLAUDE.md**: seção `⚠️ REGRA PRINCIPAL` com padrão correto/errado e exemplos de código explicitando que o app deve funcionar offline.

## 2026-06-17 — painel admin em /admin com deleção de usuário via Cloud Function

- **Rota `/admin`** protegida por `RequireAdmin` (email `a.thurcos@gmail.com`); qualquer outro usuário é redirecionado para `/app`.
- **AdminPage** com 4 abas: Visão Geral (4 cards de métrica + tabelas recentes), Usuários (busca por nome/email, tabela completa), Espaços de Casal (dono + parceiro resolvidos por nome), Convites (status, expiração, quem usou).
- **Deleção de conta**: botão de lixeira em cada linha de usuário, modal de confirmação exige digitar o primeiro nome, toast de sucesso mostra quantos documentos foram removidos.
- **Cloud Function `adminDeleteUser`** (`functions-admin/` codebase separado, sem dependência do Stripe): usa Admin SDK para deletar workspace pessoal, espaços de casal criados, membership em espaços alheios, billing, privacy requests e a conta Firebase Auth. Deployed em `southamerica-east1`.
- **Firestore rules**: `isAdmin()` adicionada; admin tem `read` em `users`, `workspaces` e `coupleInvites`.
- **`firebase.json`**: dois codebases separados — `billing` (existente, com Stripe) e `admin` (novo, sem secrets) — permitindo deploy independente.
- CSS 100% com variáveis de token; nenhuma cor hardcoded. Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — cancelar espaço do casal sem parceiro

- **`cancelCoupleWorkspace`** (nova): quando o dono está sozinho e quer sair, deleta em batch o member record, o workspaceRef e o workspace em vez de fazer `update(status: removed)`. O path de update só estava disponível para `role == 'partner'` nas rules, o que gerava "missing or insufficient permissions".
- **SharedSpacePage**: `handleLeaveOrRemove` agora distingue três casos — dono+parceiro (`removePartner`), dono sozinho (`cancelCoupleWorkspace`), parceiro saindo (`leaveCoupleWorkspace`). Botão "Cancelar e sair do espaço" visível sem precisar expandir `<details>`.

## 2026-06-17 — invites de casal deletados após uso em vez de acumular

- **Firestore rule** (`coupleInvites` delete): adicionada condição `status == 'accepted' && usedBy == request.auth.uid` para que quem aceitou o convite possa deletá-lo depois que o membro foi criado.
- **`acceptCoupleInvite`**: após `batch.commit()` confirmar (membro criado, regras satisfeitas), dispara `deleteDoc` fire-and-forget no invite.
- **`createCoupleInvite`**: removida guarda `!== 'accepted'` — agora deleta todos os invites antigos do workspace, incluindo aceitos.
- **`cleanupExpiredInvites`**: removida guarda `accepted`; dono pode limpar tudo (ativos expirados + revogados + aceitos).
- Rules publicadas via `firebase deploy --only firestore:rules`.
- Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — três bugs de navegação e fluxo de convite

- **Bug: usuário logado via na landing** — rota `/` agora usa `RootRoute` que redireciona autenticados para `/app`; antes renderizava `<LandingCss />` incondicionalmente, quebrando o PWA instalado.
- **Bug: aceite de convite perdido após login/cadastro** — `JoinInvitePage` passa `state.returnTo = /join/:code` ao navegar para `/login` ou `/register`; `LoginPage` já usava `location.state.returnTo` para redirecionar de volta. `OnboardingPage` redireciona para `/join/:code` ao terminar onboarding se há invite pendente no localStorage, em vez de ir sempre para `/app`.
- **Bug: botão "Sair" escondido** — "Cancelar e sair do espaço" movido de `<details>` para botão visível na tela de aguardar parceiro.

## 2026-06-17 — redesign do fluxo de aceite de convite de casal

- **`JoinInvitePage`** (`/join/:code`): agora faz preview automático do convite quando o usuário já está logado e com onboarding completo, mostrando o nome do workspace, data de expiração e botão "Entrar" direto na página — sem precisar ir ao `/app/shared`.
- **`SharedSpacePage`** estado sem espaço: se há código pendente no localStorage, mostra o card de aceite como ação primária (não mais escondido em `<details>`); auto-dispara o preview no mount.
- Fluxo anterior ficava preso na etapa do convite pois a UI de aceite estava oculta em `<details>Tenho um convite</details>` e não havia preview automático.

## 2026-06-17 — limpeza de coupleInvites acumulados

- **`createCoupleInvite`**: deleta todos os invites anteriores do workspace (exceto `accepted`) ao criar um novo, em vez de atualizar status para `revoked`. Elimina o backlog de 38 docs acumulados.
- **`revokeCoupleInvite`**: deleta o documento em vez de marcar `status: revoked`.
- **`cleanupExpiredInvites`**: deleta todos os não-`accepted` (revogados + expirados + ativos vencidos) em vez de atualizar status. Invites `accepted` são mantidos pois a Firestore rule de membership faz `getAfter` neles.

## 2026-06-17 — providers de dados compartilhados e higiene de re-renders

- **`FinanceDataProvider` + `SharedDataProvider`** montados no nível do `<RequireOnboardingComplete>` em `App.tsx`: listeners de Firestore agora ficam vivos entre navegações em vez de serem destruídos e recriados em cada troca de página. Todas as 13 páginas autenticadas consomem contexto via `useFinanceContext()`, `useCardsContext()`, `useGoalsContext()`, `useSharedContext()` e `useCoupleSavingsContext()`.
- **`hydrateFromProfile` com guard de igualdade**: o Zustand só notifica subscribers (e grava no localStorage) quando algum dos 5 campos de aparência realmente muda, eliminando re-renders e escritas desnecessárias a cada snapshot do perfil.
- **`limit(300)` em `subscribeTransactions`**: limita o listener a 300 transações mais recentes, evitando crescimento ilimitado de memória e CPU com o tempo.

## 2026-06-17 — estabilidade de listeners em useCardsData

- **Sem cascata de re-subscription em cartões**: dependências dos effects de faturas e ledger trocadas de `state.cards`/`state.invoices` (array inteiro) para `cardIds`/`invoiceIds` (string de IDs). Listeners só são recriados quando o conjunto de cartões ou faturas muda, não a cada atualização de campo (como `localSyncStatus` pending → synced).
- Removido `CODEX.md` da raiz (instruções consolidadas em `CLAUDE.md`).

## 2026-06-17 — higiene de custo Firestore no Blaze

- **Menos writes invisíveis**: a sincronização de aparência só grava em `/users/{uid}` quando tema, densidade, fonte ou movimento realmente mudarem.
- **Menos operações repetidas**: categorias padrão passam a ser preparadas uma vez por workspace na sessão do app, evitando rechecagens a cada mount de página financeira.
- Testes adicionados para garantir que aparência igual não dispara sync e que categorias padrão não são preparadas repetidamente no mesmo workspace.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (45/45), `npm run build`.

## 2026-06-17 — QA preventivo de permissões e listeners Firestore

- **Listeners protegidos com retry**: metas, cartões/faturas/ledger, espaço compartilhado e cofrinho do casal agora tentam novamente em `permission-denied`, `unavailable` e `deadline-exceeded` transitórios antes de mostrar erro.
- **Categorias com cor sem acesso negado**: `firestore.rules` agora permite `color` em criação/edição de categorias, alinhando as regras com os formulários do app.
- **Metas/cofrinho com schema nas rules**: create/update de `goals` e create de `goalContributions` ganharam validação de campos, usuário, valores e `monthKey`.
- Testes de rules adicionados para categoria colorida, meta válida, tentativa de forjar `createdBy` e contribuição zerada.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; `firestore.rules` compilado e publicado em `zerou-26757`. `npm run test:rules` segue bloqueado pelo Java local.

## 2026-06-17 — retry financeiro pós-onboarding e bottom sheet sem arrasto lateral

- **Conta recém-criada mais estável**: leituras financeiras protegidas agora tentam novamente quando o workspace acabou de nascer e o Firestore ainda não confirmou o membership no servidor.
- **Sem erro prematuro no dashboard**: a mensagem “Não foi possível carregar os dados financeiros deste workspace” deixa de aparecer durante a janela curta de confirmação da fundação inicial.
- **Metas no iPhone sem arrasto lateral**: bottom sheets, grids de cor/ícone, campos e controles segmentados receberam contenção de largura para evitar scroll horizontal no Safari/mobile.
- Teste novo cobre retry de `permission-denied` transitório em `useFinanceData`.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; checagem Playwright em viewport 393x852 confirmou `scrollWidth == clientWidth` no sheet.

## 2026-06-17 — exclusão definitiva de conta nas configurações

- Adicionado botão **Excluir minha conta** em `Segurança > Métodos de login`, com confirmação digitada (`EXCLUIR`) e reautenticação por senha ou Google.
- Criado `accountDeletionService`: remove perfil, refs do usuário, workspace pessoal completo, cartões/faturas/ledger, coleções financeiras, billing shell e espaços de casal criados pelo usuário; se for parceiro, sai do espaço antes de apagar a referência local.
- `firestore.rules` agora permite deletes estritos para dados da própria conta, workspace pessoal e workspaces de casal em que o usuário é dono; regras publicadas em `zerou-26757`.
- Textos legais/docs atualizados para refletir que a exclusão automatizada já existe dentro do app autenticado.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — onboarding mais curto e fundação sem erro genérico

- **Questionário inicial compacto**: removido o logo persistente do app autenticado/onboarding e reduzido o espaço vertical do wizard; CTA fica visível sem arrastar na etapa inicial.
- **Causa do erro genérico encontrada**: `firestore.rules` bloqueava `onboardingGoal` e `onboardingChallenge`, embora o onboarding gravasse esses campos no perfil.
- **Regras publicadas**: `firestore.rules` agora permite os campos opcionais do questionário e foi publicado em `zerou-26757` com `firebase deploy --only firestore:rules`.
- **Fundação mais tolerante a rede fraca**: criação inicial não faz mais leitura bloqueante antes da escrita e usa timeout curto para não prender a tela em conexão ruim.
- **Mensagens menos genéricas**: removido fallback “Nao foi possivel concluir esta acao agora” dos caminhos de Auth/SharedSpace; onboarding usa fallback específico.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — boot resiliente em internet fraca e logos offline

- **Boot/Auth resiliente em rede fraca**: `AuthContext` salva o perfil localmente e usa esse cache como fallback depois de 1,8s se Firebase Auth/perfil ficarem presos em conexão “meio online”.
- **Perfil não some em erro de snapshot**: falha temporária do Firestore mantém o último perfil local em vez de deixar o usuário preso no carregamento.
- **Ações sensíveis protegidas**: quando a sessão está usando fallback local (`authFromCache`), telas de verificação/métodos de login ficam bloqueadas até Firebase confirmar a sessão real.
- **SVGs de bancos offline**: Workbox passou a precachear `svg`; logos em `public/bank-logos/` entram no service worker.
- Teste novo para cache de perfil. Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`.

## 2026-06-17 — correção crítica: app travando/escrita pendente, offline e zoom

- **Firestore travando** (escrita ficava "pendente" e só sincronizava após refresh): `experimentalAutoDetectLongPolling` ligado e `persistentMultipleTabManager` no cache — o transporte WebChannel travava em algumas redes/navegadores.
- **Escritas otimistas em todo o app** (`fireWrite` em finance/cards/shared): nenhuma mutação bloqueia mais a UI esperando o servidor (fim do spinner infinito). Dispara a escrita, responde na hora e o `onSnapshot` mostra o item (offline-first de verdade). Validação síncrona (Zod) continua surgindo pro usuário.
- **Metas/cofrinho offline**: removido `orderBy('createdAt')` das queries de goals/goalContributions (offline o serverTimestamp fica nulo e escondia o item recém-criado); ordenação no cliente.
- **Zoom / arrastar lateral**: travado o overflow-x (html/body/app-main) e corrigida a margem negativa do header de valor que estourava a largura no mobile; `viewport-fit=cover`.
- Detalhe em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test` (37/37), `npm run build`.

## 2026-06-17 — Redesign Sol, app mobile-nativo, cofrinho do casal e landing nova

- Direção visual "Sol" (areia + tangerina, DM Sans 800 nos números) aplicada no app inteiro.
- App mobile-nativo: nav inferior com FAB, header de valor nas telas de lançamento, seletores em bottom-sheet, categorias com ícone+cor, onboarding em questionário, empty states ilustrados.
- Despesa no cartão pelo fluxo de Despesa; novo cartão com header de limite; dashboard compacto.
- Espaço do casal: divisão flexível (igual/%/valor) + **cofrinho do casal** (meta compartilhada + contribuições por pessoa, opção de descontar de conta pessoal).
- Tela de **Metas** ligada ao questionário do onboarding.
- Landing reescrita (CSS 3D) com mockup do app e copy de dor (PAS); promovida para `/`.
- SVGs oficiais de ~24 bancos; cores tokenizadas (teste `noHardcodedColors` verde).
- Documentação reorganizada estilo plantão (`CLAUDE.md`, `CODEX.md`, `SESSAO.md`, `docs/`).
- Detalhe técnico completo em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test`, `npm run build`; regras Firestore publicadas.

## 2026-06-15 - Estado atual da main

### Projeto

- Zerou e um SaaS/PWA financeiro mobile-first para controle financeiro individual e organizacao a dois.
- Nome publico do produto: Zerou.
- Tagline oficial: "Controle individual. Organizacao a dois."
- Stack principal: React, TypeScript strict, Vite, Firebase Web SDK, Cloud Firestore, Firebase Auth, Vercel e PWA.
- O app esta em modo de lancamento gratuito. Nao ha cobranca ativa, checkout ativo ou pagina publica de planos.

### Fase 1 - Fundacao SaaS

- Criado o app React/TypeScript/Vite na raiz do repositorio.
- Configurado Firebase client-side por variaveis `VITE_`, sem `firebaseConfig` hardcoded.
- Preparado Firebase Auth com email/senha, Google, reset de senha e logout.
- Criadas rotas publicas e autenticadas com React Router.
- Implementado onboarding inicial com criacao de perfil, workspace pessoal e membership.
- Criado app shell autenticado com sidebar desktop e bottom navigation mobile.
- Implementado dashboard inicial pos-login.
- Implementado design system inicial com tokens semanticos.
- Implementados os seis temas: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Implementado modo `system`, persistencia em `localStorage` antes do primeiro render e sincronizacao do tema em `/users/{uid}`.
- Copiados assets oficiais da Zerou para `public/brand/`.
- Implementado PWA basico com manifest, service worker e icones oficiais.
- Criado `.env.example`, `.gitignore`, `firebase.json`, `firestore.rules`, `storage.rules` e `vercel.json`.
- Ajustado fallback SPA da Vercel para rotas como `/login`, `/register` e `/app/*`.

### Ajuste Spark/Firebase

- Removida a dependencia de Cloud Functions no fluxo ativo da fundacao para manter o app no plano Spark/free.
- Criacao de usuario, workspace pessoal e membership passou a ser feita client-side com regras Firestore restritivas.
- Publicadas Firestore Rules no projeto real `zerou-26757`.
- Corrigido erro inicial de onboarding causado por leitura protegida antes da fundacao existir.

### PWA e atualizacao automatica

- Implementado auto-refresh de versao inspirado no app Plantao.
- Service worker usa `skipWaiting`, `clientsClaim` e limpeza de caches antigos.
- Vercel recebeu headers sem cache para `sw.js` e `workbox-*.js`.
- O app verifica atualizacoes ao abrir, focar, voltar online, voltar de aba oculta e periodicamente.

### Fase 2 - Motor financeiro essencial

- Implementados tipos e contratos de `Account`, `Category`, `Transaction`, `Bill` e `RecurringRule`.
- Criados servicos Firestore client-side para contas, categorias, transacoes, contas a pagar e recorrencias.
- Persistencia de dinheiro em centavos inteiros.
- IDs client-side e `clientMutationId` para idempotencia de transacoes.
- Criado calculo puro de saldo com receita, despesa, transferencia, ajuste e soft delete.
- Dashboard financeiro com saldo total, disponivel livre v1, valor comprometido, proximos compromissos, transacoes recentes e acoes rapidas.
- Rotas adicionadas:
  - `/app/dashboard`
  - `/app/accounts`
  - `/app/transactions`
  - `/app/transactions/new`
  - `/app/transactions/:transactionId/edit`
  - `/app/bills`
  - `/app/recurring`
  - `/app/search`
- Cadastro rapido mobile de transacao com campos principais e avancado recolhido.
- Sync status visual baseado em `hasPendingWrites` do Firestore.

### Fase 3 - Cartoes e faturas

- Implementados tipos de `CreditCard`, `Invoice` e `InvoiceLedgerEntry`.
- Criado dominio puro de faturas em `src/domain/invoices/*`.
- Compra no cartao reconhece despesa sem reduzir saldo da conta imediatamente.
- Pagamento de fatura reduz saldo da conta uma unica vez.
- Suporte a fatura aberta/fechada, pagamento parcial, pagamento total, creditos, encargos, antecipacao e reconciliacao.
- Rotas adicionadas:
  - `/app/cards`
  - `/app/cards/:cardId`
  - `/app/cards/:cardId/invoices/:invoiceId`
- Ledger de fatura tratado como imutavel pelas regras.

### Fase 4 - Espaco compartilhado

- Implementado workspace do casal.
- Implementados convites com codigo amigavel `DUO-XXXX-XX`, hash SHA-256, validade, uso unico, revogacao e regeneracao.
- Geracao de QR code e link de convite no client sem persistir token bruto.
- Rota publica `/join/:code` preserva convite ate login/cadastro.
- Rota autenticada `/app/shared` com criacao de espaco do casal, convites, aceite, claims compartilhados, comentarios e settlements.
- Claims compartilhados nao expõem referencias pessoais de conta, cartao ou fatura.
- Criado calculo de balanco por membro e sugestao de acerto.
- Area compartilhada foi posteriormente simplificada para reduzir confusao no celular.

### Fase 5 - Billing Stripe custom

- Criado scaffold de `functions/` com Node 22, TypeScript strict, Firebase Functions v2, Firebase Admin, Stripe e Zod.
- Implementadas callable functions futuras:
  - `createCheckoutSession`
  - `createCustomerPortalSession`
- Implementado webhook Stripe com validacao de assinatura e `rawBody`.
- Criado processamento idempotente de `billingEvents`.
- Criado processor/retry de eventos.
- Criado script `functions/scripts/seedPlanCatalog.mjs`.
- Criados tipos e regras para `billingAccounts`, `subscriptions`, `billingEvents` e `planCatalog`.
- Decisao de produto posterior: billing fica suspenso. Zerou fica 100% gratuito por enquanto.
- Paginas e links publicos de planos foram removidos do fluxo ativo.

### Fase 6 - Lancamento

- Criada landing publica clara, mobile-first e mais direta.
- Tema Paper claro virou padrao visual publico e primeiro render.
- Landing recebeu mockup mobile com efeito/aspecto 3D leve.
- Funcionalidades passaram a aparecer no corpo da landing.
- Removidos links publicos soltos de planos, cookies e subprocessadores.
- Removido banner de cookies para nao bloquear cadastro/uso.
- Analytics fica desligado por padrao e so inicializa se `VITE_ENABLE_ANALYTICS=true`.
- Rotas publicas reais:
  - `/features`
  - `/security`
  - `/help`
  - `/contact`
  - `/privacy-center`
  - `/legal/terms`
  - `/legal/privacy`
- Rotas legadas redirecionam:
  - `/pricing`
  - `/legal/cookies`
  - `/legal/subprocessors`
- Criados textos juridicos operacionais em `docs/legal/TERMS.md` e `docs/legal/PRIVACY.md`.
- Privacidade e termos foram reforcados para o contexto brasileiro, LGPD, Marco Civil e CDC.
- Privacy Center virou pagina informativa, sem botoes publicos de protocolo.
- Copy publica removeu termos tecnicos como "billing", "checkout", "offline-first", "ledger" e "workspace".
- Mensagens de erro de validacao foram convertidas para texto humano, sem expor JSON, `too_small`, `invalid_format` ou payload tecnico.
- Onboarding autenticado virou modo foco, sem sidebar/bottom nav ate concluir fundacao.
- App shell passou a bloquear atalhos visuais para funcoes privadas antes da fundacao do usuario.

### Pos-Fase 6 - UX financeiro e contas

- Melhorada UX mobile do dashboard, navegacao inferior e fluxo inicial.
- Adicionadas sugestoes de instituicoes financeiras ao criar conta financeira.
- Busca de instituicao aceita nome, alias e acentos.
- Conta financeira sem vinculos agora e excluida fisicamente do Firestore.
- Se a conta financeira tiver lancamentos, contas a pagar ou recorrencias ligadas, a UI bloqueia a exclusao e orienta remover/alterar os vinculos.
- Saldo inicial sozinho nao impede a exclusao de uma conta financeira.
- Foram adicionadas marcas compactas locais por banco.
- Foi adicionada primeira leva de SVGs locais de bancos em `public/bank-logos/`:
  - Nubank
  - PicPay
  - Mercado Pago
  - Neon
  - Modal
  - Wise
  - Nomad
- Criado `scripts/generate-bank-logos.mjs` e script `npm run generate:bank-logos`.
- Bancos sem SVG disponivel continuam com marcador visual ate entrada de assets oficiais confiaveis.

### Documentacao e operacao

- Criados ou atualizados docs operacionais:
  - `README.md`
  - `ARCHITECTURE.md`
  - `SECURITY.md`
  - `PRIVACY.md`
  - `RUNBOOK.md`
  - `docs/PRODUCTION_CHECKLIST.md`
  - `docs/BILLING.md`
  - `docs/BOOTSTRAP_FIREBASE_STRIPE.md`
  - `docs/MANUAL_SETUP_REQUIRED.md`
  - `documentacao-v12.2/IMPLEMENTATION_STATUS.md`
  - `documentacao-v12.2/QA_SCENARIOS.md`
- Criado este `CHANGELOG.md`.
- Criado `HANDOFF-PARA-CLAUDE.md` para passar contexto para outro agente.

### Validacoes executadas

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run functions:build`
- `npm run test:functions`
- `npm audit --omit=dev`
- Deploy de Firestore Rules/Indexes no projeto `zerou-26757`
- Smoke tests em `https://zerou-five.vercel.app`

### Limitacoes conhecidas

- `npm run test:rules` depende de Java local. Neste computador, `java -version` falha com codigo `3221226505`, entao os emuladores ficam bloqueados ate corrigir Java/PATH.
- Bundle inicial ainda passa de 500 kB. Code splitting deve ser feito depois.
- Billing Stripe existe como scaffold futuro, mas nao esta ativo no produto.
- Cloud Functions nao devem ser ativadas sem decisao de produto, Blaze, secrets e checklist operacional.
- Revisao juridica profissional ainda e recomendada antes de escala publica maior.
- App Check, backups, alertas de custo, dominio final e emails oficiais ainda precisam de configuracao externa.
