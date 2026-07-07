# Brief — Granativa (ex-Zerou)

## Estado atual

SaaS/PWA financeiro mobile-first (React 19 + Firebase Firestore + Vercel). Duas frentes: controle individual e organização a dois (casal). App em **lançamento gratuito** — sem cobrança, checkout ou página de planos ativa. O projeto Firebase está no **Blaze**, mas o produto segue gratuito e sem Cloud Functions no fluxo principal. Produção: https://zerou-five.vercel.app (URL legada, ainda no Vercel como "zerou"). Trabalho direto na `main`.

**Rebrand completo**: app renomeado de "Zerou" → "Granix" → **Granativa** (grana + ativa). Logo: duas bolas sobrepostas (sólida laranja + outline escuro). Assets em `public/brand/granativa-*.png` — todos com transparência real (alpha channel). Logo horizontal usada no nav/footer/og:image (`granativa-logo-horizontal.png`); logo empilhada em auth/onboarding (`granativa-logo-primary.png`). Favicons: `favicon-16x16.png` e `favicon-32x32.png`. Version strings internas (`zerou-v12.2-*`, `zerou-cache`) e localStorage keys (`zerou.themeMode`, `zerou.themeId`) mantidas por retrocompatibilidade.

A interface segue a direção visual **"Sol"** (areia quente clara + tangerina `#EE5524`, números em DM Sans 800, corpo em Instrument Sans) e é **mobile-nativa**: nav inferior com FAB central (slot 2 = Extrato/Transações, slot 4 = Cartões, Casal no menu Mais + indicador de ponto ativo), telas de lançamento com header de valor gigante colorido por tipo, seletores em **bottom-sheet** (conta, categoria, bandeira), categorias com ícone e cor editáveis, onboarding em questionário com barra de progresso, e empty states ilustrados. Detalhes em `docs/design/DESIGN.md`.

Todas as páginas autenticadas têm agora **cabeçalho compacto** (eyebrow + título, sem parágrafo), **ícones de categoria** em tile colorido 36×36 (`CategoryMark`) nas listas de transações (Dashboard e TransactionsPage), **cards de conta** com gradiente escuro (`--gradient-slate`) e **formulários de cadastro colapsáveis** (Contas, Cartões, Compromissos).

A aba **Análise** (`/app/search`) exibe: KPI strip (gasto total, maior categoria, variação % vs. mês anterior com ícone trending); donut 200px interativo (Recharts — clique destaca fatia, centro mostra nome/valor/%) com legenda de **barras de progresso** por categoria; gráfico de barras (220px) entradas vs saídas dos últimos 6 meses com legenda própria; busca por texto (card oculto quando vazio).

**Cloud Functions** (`functions/src/`): quatro funções scheduled deployadas no codebase `billing` (`southamerica-east1`): `closeInvoicesDue` (meia-noite), `generateRecurrences` (6h), `sendDueReminders` (8h), `sendDailyLogReminder` (20h — lembrete diário via FCM para todos os usuários). Push via `sendPushToUser` (`push.ts`) com limpeza automática de tokens stale. VAPID key configurada no Vercel. Secrets Stripe como placeholder para deploy sem ativar billing.

O app autenticado não usa mais logo persistente no topo; o onboarding também fica sem bloco de marca para preservar altura útil no celular.

A landing pública (`/`) foi reescrita com Framer Motion: **hero claro** (branco → areia) com grade perspectiva CSS, stage (phone + badges flutuantes) que inclina em 3D com o mouse (`rotateX/Y` + `preserve-3d`, badges em Z-depths distintos), gloss de luz na tela do phone (`useMotionTemplate`), scroll parallax e stagger de entrada. Seções abaixo: stats band, bento com `TiltCard`, modo casal, steps, FAQ e CTA dark. Sempre clara (Paper), nunca dark. **Mobile-first**: hover effects (`whileHover`, estilos `:hover`) ativados apenas em `@media (hover: hover)` / `window.matchMedia` — sem efeito em touch. Stats band horizontal em todos os tamanhos (sem empilhar), botões hero full-width em `≤640px`, ghost "Entrar" oculto em `≤480px`.

## Leitura inicial

1. Leia este arquivo.
2. Use `docs/BUSCA_RAPIDA.md` para localizar contexto específico.
3. Não abra histórico mensal ou docs grandes sem uma busca `rg`/Grep antes.

## Stack

React 19 (TS strict), Vite, Firebase Web SDK (Auth + Firestore + Storage), Vercel, Vite PWA, React Router, React Hook Form, Zod, Zustand, Lucide React, **Recharts** (gráficos). Node >= 22.

## Onde procurar

| Assunto | Arquivo |
|---|---|
| Mapa geral | `docs/BUSCA_RAPIDA.md` |
| Histórico por mês | `docs/history/YYYY-MM.md` |
| Design/UI (Sol) | `docs/design/DESIGN.md` |
| Pendências | `docs/planning/TODOS.md` |
| Testes/QA | `docs/qa/TESTES.md` |
| Arquitetura | `docs/ARCHITECTURE.md` |
| Segurança/privacidade/operação | `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/RUNBOOK.md` |

## Convenções essenciais

- Dinheiro em centavos inteiros (`amountCents`), exibido por `formatMoney()`.
- Firestore (não RTDB). IDs client-side + `clientMutationId`.
- Fluxos client-side com Security Rules; sem Cloud Functions no fluxo principal, mesmo com o projeto Firebase no Blaze.
- **Offline-first**: Firestore com `persistentLocalCache` + `experimentalAutoDetectLongPolling` (`src/firebase/config.ts`). **Nunca bloquear a UI esperando ack do Firestore** — dispara a escrita (fire-and-forget + `.catch`) e deixa o `onSnapshot` refletir (badge pendente → sincronizado).
- **Boot em internet fraca**: `AuthContext` inicializa estado **sincronamente** do `localStorage` — se há perfil em cache, `loading=false` já na primeira renderização e o app abre instantaneamente. Firebase confirma a sessão em background (timeout de fallback: 500ms). Enquanto `authFromCache` estiver ativo, ações sensíveis de login/verificação ficam bloqueadas até Firebase confirmar a sessão real. Google Fonts são carregados de forma não-bloqueante (`preload + onload`) e cacheados pelo Workbox com `CacheFirst`.
- **`useFinanceData` (2026-07-07)**: `loading` só vira `false` quando as 5 coleções (contas/categorias/transações/contas a pagar/recorrências) já entregaram o primeiro snapshot — não na primeira que chegar. Evita o Dashboard piscar "R$ 0,00" se `categories`/`bills` resolverem do cache antes de `accounts`. `DashboardPage` espera `finance.loading || cardsData.loading` para "Disponível"/"Comprometido" (dependem de faturas); "Saldo total" continua instantâneo, só depende de `finance.loading`.
- **Conta recém-criada**: `ensurePersonalFoundation` pode liberar a UI antes do ack do servidor; hooks financeiros devem tratar `permission-denied`/`unavailable` transitórios com retry curto antes de mostrar erro final.
- **Listeners protegidos**: para coleções por workspace/membership, preferir `subscribeWithTransientRetry` (`src/firebase/firestoreRetry.ts`) em vez de tratar `onSnapshot` error como falha final imediata.
- **Higiene de custo Firestore**: antes de gravar preferências, seeds ou metadados automáticos, compare se algo mudou e/ou memorize a preparação por sessão. Evite writes invisíveis em refresh/login/troca de rota; no Blaze isso aparece rapidamente na cota diária.
- **Mobile iOS**: bottom sheets e formulários internos precisam de `min-width: 0`, contenção de `overflow-x` e controles segmentados fluidos; Safari pode permitir arrasto lateral em containers internos mesmo com `body` travado.
- **PWA offline**: SVGs também entram no precache do Workbox; logos de banco em `public/bank-logos/` devem funcionar offline após o service worker atualizar.
- **Exclusão de conta**: disponível em `/app/settings/security/login-methods`; exige digitar `EXCLUIR` e reautenticar. Remove perfil, workspace pessoal, dados financeiros/cartões/faturas, billing shell e espaços de casal criados pelo usuário. Parceiro em workspace de outra pessoa sai do espaço sem apagar o workspace do dono.
- Cores só em `src/styles/themes.css` (+ `src/theme/palette.ts`). Literais quebram o teste `noHardcodedColors` (exceção: `src/landing/`).
- Componentes-base de UX: `BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState`.
- Não expor erro técnico ao usuário; landing sempre clara.

## Cartões e faturas — comportamentos-chave

- **Fatura aberta** permanece `open` até o fechamento automático pela `closeInvoicesDue` (meia-noite do dia de fechamento). Qualquer pagamento em fatura aberta vira `advance_payment`. Os botões "Fechar fatura" e "Conciliar manualmente" foram removidos da `InvoicePage` — a automação cuida disso.
- **Antecipação de parcelas** (`InvoicePage`): painel detecta parcelas futuras do mesmo cartão, exibe por invoice com checkbox. Ao confirmar: `writeBatch` adiciona `installment_anticipation_credit` em cada fatura futura selecionada (reduz saldo delas) e `installment_anticipation` na fatura atual (debita o total). Fire-and-forget.
- **Comprometido** (Dashboard): faturas `closed` sempre entram; faturas `open` só se `referenceMonth <= mês atual`. Faturas futuras de parcelas não entram até chegarem no mês delas.

## Firestore (coleções por workspace)

`workspaces/{id}/` → `accounts`, `categories`, `transactions`, `bills`, `recurring`, `goals`, `goalContributions`, `cards/{cardId}/invoices/{invoiceId}/ledger`, `members`, `sharedExpenseClaims`, `settlements`, `comments`, `invites`. Workspace pessoal = `personal_{uid}`; workspace do casal é separado, com membership ativa.

## Funcionalidades-chave do casal

- **Modos do espaço** (`coupleMode` no workspace): `savings_only` (só cofrinho, padrão), `transparent` (despesas divididas visíveis, sem acerto formal), `balanced` (idem + barra proporcional de quem cobre mais no mês). Pode mudar a qualquer momento em "Gerenciar espaço".
- **Divisão de despesa** (claims, apenas nos modos transparent/balanced): igual / porcentagem / valor. Sem acerto de contas formal — o equilíbrio é visual/proporcional.
- **Cofrinho do casal**: meta compartilhada (`goals` no workspace do casal) + contribuições (`goalContributions`). "Guardar" pode descontar de uma conta pessoal (vira despesa "Cofrinho" no workspace pessoal); valida saldo disponível antes. Mostra total unificado e juntado no mês.

## Deploy de regras

`npx firebase deploy --only firestore:rules --project zerou-26757` (só regras de segurança; não toca billing/functions/hosting).

## Fim de sessão

- `CHANGELOG.md`: resumo curto quando houver entrega relevante.
- Este `SESSAO.md`: só quando mudar estado atual, stack, fluxo, caminhos ou regra essencial. Não é diário.
- `docs/history/YYYY-MM.md`: detalhes que não cabem no changelog.
- `docs/planning/TODOS.md`: pendências.
- Regra completa de decisão em `CLAUDE.md`.
