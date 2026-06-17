# Brief — Zerou

## Estado atual

SaaS/PWA financeiro mobile-first (React 19 + Firebase Firestore + Vercel). Duas frentes: controle individual e organização a dois (casal). App em **lançamento gratuito** — sem cobrança, checkout ou página de planos ativa. Produção: https://zerou-five.vercel.app. Trabalho direto na `main`.

A interface segue a direção visual **"Sol"** (areia quente clara + tangerina `#EE5524`, números em DM Sans 800, corpo em Instrument Sans) e é **mobile-nativa**: nav inferior com FAB central, telas de lançamento com header de valor gigante colorido por tipo, seletores em **bottom-sheet** (conta, categoria, bandeira), categorias com ícone e cor editáveis, onboarding em questionário com barra de progresso, e empty states ilustrados. Detalhes em `docs/design/DESIGN.md`.

A landing pública (`/`) foi reescrita: hero com copy de dor ("Seu salário já chega devendo"), mockup do app em CSS num phone inclinado 3D, bento de recursos, seção do casal com o **cofrinho**, e CTA. Sempre clara (Paper), nunca dark.

## Leitura inicial

1. Leia este arquivo.
2. Use `docs/BUSCA_RAPIDA.md` para localizar contexto específico.
3. Não abra histórico mensal ou docs grandes sem uma busca `rg`/Grep antes.

## Stack

React 19 (TS strict), Vite, Firebase Web SDK (Auth + Firestore + Storage), Vercel, Vite PWA, React Router, React Hook Form, Zod, Zustand, Lucide React. Node >= 22.

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
- Fluxos client-side com Security Rules; sem Cloud Functions (Spark/free).
- **Offline-first**: Firestore com `persistentLocalCache` + `experimentalAutoDetectLongPolling` (`src/firebase/config.ts`). **Nunca bloquear a UI esperando ack do Firestore** — dispara a escrita (fire-and-forget + `.catch`) e deixa o `onSnapshot` refletir (badge pendente → sincronizado).
- Cores só em `src/styles/themes.css` (+ `src/theme/palette.ts`). Literais quebram o teste `noHardcodedColors` (exceção: `src/landing/`).
- Componentes-base de UX: `BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState`.
- Não expor erro técnico ao usuário; landing sempre clara.

## Firestore (coleções por workspace)

`workspaces/{id}/` → `accounts`, `categories`, `transactions`, `bills`, `recurring`, `goals`, `goalContributions`, `cards/{cardId}/invoices/{invoiceId}/ledger`, `members`, `sharedExpenseClaims`, `settlements`, `comments`, `invites`. Workspace pessoal = `personal_{uid}`; workspace do casal é separado, com membership ativa.

## Funcionalidades-chave do casal

- **Divisão de despesa** (claims): igual / porcentagem / valor; saldo "quem deve quanto" e acerto (settlement).
- **Cofrinho do casal**: meta compartilhada (`goals` no workspace do casal) + contribuições por pessoa (`goalContributions`). "Guardar" pode descontar de uma conta pessoal (vira despesa "Cofrinho" no workspace pessoal). Mostra total, juntado no mês e por pessoa.

## Deploy de regras

`npx firebase deploy --only firestore:rules --project zerou-26757` (só regras de segurança; não toca billing/functions/hosting).

## Fim de sessão

- `CHANGELOG.md`: resumo curto quando houver entrega relevante.
- Este `SESSAO.md`: só quando mudar estado atual, stack, fluxo, caminhos ou regra essencial. Não é diário.
- `docs/history/YYYY-MM.md`: detalhes que não cabem no changelog.
- `docs/planning/TODOS.md`: pendências.
- Regra completa de decisão em `CLAUDE.md`.
