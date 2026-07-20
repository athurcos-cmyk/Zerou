# Testes e QA — Zerou

## Comandos

```bash
npm run typecheck     # TypeScript strict, sem emitir
npm test              # Vitest (unit + domínio + regras de cor)
npm run build         # build de produção (Vite)
npm run test:rules    # Firebase Rules Unit Testing (emulador; acha o Java via scripts/with-java.mjs)
npm run test:e2e      # Playwright (precisa de runner configurado)
```

Antes de entregar: `npm run typecheck`, `npm test`, `npm run build`. **Se tocou em `firestore.rules`, rode também `npm run test:rules`** — é a única defesa automática contra o padrão de bug descrito abaixo.

## O que os testes cobrem hoje

- **Unit/domínio** (`src/`): cálculos financeiros, saldos do casal (`src/domain/shared/calculateSharedBalances.test.ts`), lógica de cartão/fatura (`src/cards/cardDates.test.ts`, `src/cards/useCardsData.test.tsx`), payday/Comprometido (`src/finance/payday.test.ts`, `src/finance/financeCalculations.test.ts`), etc.
- **`noHardcodedColors`** (`src/test/noHardcodedColors.test.ts`): falha se houver hex/rgba literal fora de `src/styles/themes.css` e `src/theme/palette.ts`. Exceção: `src/landing/`.
- **Regras** (`tests/firestore.rules.test.ts`, `tests/storage.rules.test.ts`): rodam no emulador do Firestore, **52 testes (verdes desde 2026-07-10, cresceu de 43 conforme novas coleções ganharam cobertura — não hardcode este número, confira `npm run test:rules`)**. Ficaram meses sem rodar por causa de um Java quebrado nesta máquina, e **isso já custou 3 bugs reais** (categoria em 2026-06; `installment_anticipation_credit` faltando na regra desde a criação da feature de antecipar parcelas; `availableMode` em 2026-07-09). Ao voltarem a rodar, revelaram 5 testes que estavam errados havia tempo — inclusive um `expiresAt` hardcoded que virou bomba-relógio, e um seed que fazia o teste de "criar fundação" nunca exercitar a regra de create. Lição: um teste que não roda não é uma rede de segurança, é uma ilusão.
- **E2E** (`tests/e2e/`): Playwright; exige runner próprio (não roda junto do `npm test`).

Rodar só os unitários estáveis: `npx vitest run src`.

## QA manual feita (navegador desktop, 2026-07-09)

Sessão de auditoria completa em `granativa.com.br` com a conta de teste: ciclo de vida de transação (criar/editar/excluir + saldo), categoria nova, conta (multi-conta, transferência, bloqueio de exclusão com histórico), compromisso, recorrência (criar + registrar pagamento), cartão (compra simples/parcelada, pagamento de fatura, antecipação de parcelas, exclusão de compra antecipada), e Comprometido/Disponível em vários cenários de payday. 4 bugs reais encontrados e corrigidos — ver `../history/2026-07.md`. Testado em viewport desktop/tablet/mobile no navegador, **não em celular físico** — isso continua pendente abaixo.

## QA manual pendente (no celular físico)

Fluxos a validar fim a fim num aparelho real: cadastro, login (email + Google), onboarding (questionário), **espaço do casal** (convite, divisão flexível, acerto) e **cofrinho** (guardar com e sem desconto de conta pessoal). Ver `../planning/TODOS.md`.

## Notas

- Dados em centavos inteiros — conferir formatação com `formatMoney()`.
- Não expor erro técnico: validar mensagens via `getUserFacingErrorMessage`.
