# Zerou — Mudanças da v11 para v12

## Correções estruturais

- A especificação deixou de ordenar implementação integral em uma única execução.
- O trabalho foi dividido em seis prompts operacionais independentes.
- Cada fase possui escopo limitado, testes próprios, gate e parada obrigatória.
- `IMPLEMENTATION_STATUS.md` passou a ser o handoff explícito entre execuções.

## Billing

- A Firebase Stripe Extension deixou de ser implementação padrão.
- O billing agora usa adapter Stripe customizado com Cloud Functions.
- O webhook valida assinatura usando `rawBody`, registra evento idempotente, responde rapidamente e delega processamento assíncrono.
- Entitlements continuam server-side e nunca são confiados ao frontend.

## MVP

- Landing 3D removida do lançamento inicial.
- Apenas Paper e Obsidian permanecem no MVP.
- Painel admin completo, OCR, automações e organização financeira avançada foram movidos para pós-MVP.
- Contas a pagar e recorrências básicas permanecem no MVP porque são necessárias ao cálculo inicial de disponível livre.

## Contratos financeiros

- Valores monetários persistidos passaram a usar inteiros em centavos (`amountCents`, `limitCents`, etc.).
- Interfaces canônicas foram isoladas em `CONTRATOS-CANONICOS.md`.
