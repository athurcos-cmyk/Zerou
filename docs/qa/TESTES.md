# Testes e QA — Zerou

## Comandos

```bash
npm run typecheck     # TypeScript strict, sem emitir
npm test              # Vitest (unit + domínio + regras de cor)
npm run build         # build de produção (Vite)
npm run test:rules    # Firebase Rules Unit Testing (precisa de Java no PATH)
npm run test:e2e      # Playwright (precisa de runner configurado)
```

Antes de entregar: `npm run typecheck`, `npm test`, `npm run build`.

## O que os testes cobrem hoje

- **Unit/domínio** (`src/`): cálculos financeiros, saldos do casal (`src/domain/shared/calculateSharedBalances.test.ts`), etc.
- **`noHardcodedColors`** (`src/test/noHardcodedColors.test.ts`): falha se houver hex/rgba literal fora de `src/styles/themes.css` e `src/theme/palette.ts`. Exceção: `src/landing/`.
- **Regras** (`tests/firestore.rules.test.ts`, `tests/storage.rules.test.ts`): precisam do emulador (Java). Hoje ficam *skipped* sem ambiente.
- **E2E** (`tests/e2e/`): Playwright; exige runner próprio (não roda junto do `npm test`).

Rodar só os unitários estáveis: `npx vitest run src`.

## QA manual pendente (no celular)

Fluxos a validar fim a fim: cadastro, login (email + Google), onboarding (questionário), criar conta, lançar transação (receita/gasto/transferência e **gasto no cartão**), conta a pagar, recorrência, criar cartão + fatura + pagamento, **espaço do casal** (convite, divisão flexível, acerto) e **cofrinho** (guardar com e sem desconto de conta pessoal). Ver `../planning/TODOS.md`.

## Notas

- Dados em centavos inteiros — conferir formatação com `formatMoney()`.
- Não expor erro técnico: validar mensagens via `getUserFacingErrorMessage`.
- Cenários de sucesso/erro herdados ficam em `documentacao-v12.2/QA_SCENARIOS.md` (legado).
