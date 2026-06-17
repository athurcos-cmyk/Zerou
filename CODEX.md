# Zerou — instruções para Codex

Leia `SESSAO.md` primeiro. Para contexto adicional, use `docs/BUSCA_RAPIDA.md` e busque com `rg` antes de abrir documentos grandes.

## Rotas principais de contexto

- Estado atual: `SESSAO.md`
- Mudanças recentes: `CHANGELOG.md`
- Mapa de busca: `docs/BUSCA_RAPIDA.md`
- Histórico por mês: `docs/history/YYYY-MM.md`
- Design/UI (Sol): `docs/design/DESIGN.md`
- Pendências: `docs/planning/TODOS.md`
- Testes/QA: `docs/qa/TESTES.md`

## Regras essenciais

- Stack: React 19 + TypeScript strict + Vite + Firebase (Auth/Firestore/Storage) + Vercel. Node >= 22.
- Dinheiro sempre em centavos inteiros (`amountCents`).
- Firestore, não Realtime Database. IDs client-side + `clientMutationId`.
- Fluxos rodam client-side com Security Rules — sem Cloud Functions (plano Spark/free). Não ativar billing/Functions sem pedido explícito.
- Cores só via tokens em `src/styles/themes.css` (+ `src/theme/palette.ts`). Literais fora disso quebram o teste `noHardcodedColors` (exceção: `src/landing/`).
- Antes de mexer em UI, leia `docs/design/DESIGN.md`. Reutilize `BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState`.
- Landing/páginas públicas são sempre claras (Paper). Não expor erro técnico ao usuário.
- Não commitar `.env.local`/service account. Não hardcodar `firebaseConfig`.
- Validação: `npm run typecheck`, `npm test`, `npm run build`.
- Ao encerrar sessão relevante: atualize `CHANGELOG.md` (resumo curto). Detalhe grande vai pra `docs/history/YYYY-MM.md`. `SESSAO.md` só quando mudar estado/stack/fluxo/regra. Regra completa em `CLAUDE.md`.

Não carregar `docs/history/*.md` inteiro sem necessidade — existe para economizar contexto.
