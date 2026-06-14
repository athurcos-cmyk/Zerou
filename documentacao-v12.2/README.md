# Zerou v12.2 — Kit de execução por fases

Este pacote substitui o comando operacional monolítico da versão 11 e consolida a marca oficial **Zerou** no lugar do nome provisório anterior. A especificação continua abrangente, mas a implementação deve ocorrer em fases independentes, revisáveis e cumulativas.

## Ordem de uso

1. Leia `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`.
2. Leia `CONTRATOS-CANONICOS.md`.
3. Leia `BRAND-GUIDELINES.md`, `THEME-SYSTEM.md`, `BRAND-ASSET-INTEGRATION.md` e `PRODUCT-COPY-CANONICAL.md`.
4. Execute os passos humanos de `00-BOOTSTRAP-MANUAL.md` até onde for possível.
5. Entregue ao Codex apenas **um** arquivo de `prompts/` por vez, junto com:
   - `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`;
   - `CONTRATOS-CANONICOS.md`;
   - `BRAND-GUIDELINES.md`;
   - `THEME-SYSTEM.md`;
   - `PRODUCT-COPY-CANONICAL.md`;
   - o repositório atual;
   - `IMPLEMENTATION_STATUS.md` atualizado.
6. Revise a entrega e os testes antes de iniciar a fase seguinte.

## Prompts operacionais

| Ordem | Arquivo | Resultado esperado |
|---|---|---|
| 1 | `prompts/01-FUNDACAO-SAAS.md` | Base técnica, autenticação, workspaces e isolamento |
| 2 | `prompts/02-MOTOR-FINANCEIRO-ESSENCIAL.md` | Contas, transações, dashboard, offline e compromissos básicos |
| 3 | `prompts/03-CARTOES-E-FATURAS.md` | Ledger de cartão, faturas e pagamentos parciais |
| 4 | `prompts/04-ESPACO-COMPARTILHADO.md` | Convites, privacidade, claims e acertos do casal |
| 5 | `prompts/05-BILLING-STRIPE-CUSTOM.md` | Checkout, Portal, webhooks e entitlements server-side |
| 6 | `prompts/06-LANCAMENTO-LANDING-JURIDICO.md` | Landing estática, jurídico, privacidade e preparação de lançamento |

## Regra operacional

Cada prompt encerra a execução ao concluir seu gate de qualidade. O agente deve corrigir erros dentro da fase atual, atualizar `IMPLEMENTATION_STATUS.md` e parar. Ele não deve antecipar a próxima fase.

## O que foi removido do MVP

Os itens abaixo foram deslocados para `BACKLOG-POST-MVP.md`:

- landing page 3D;
- painel administrativo completo;
- automações avançadas;
- OCR;
- importações bancárias avançadas;
- organização financeira avançada além do necessário para o dashboard inicial.

## Temas configuráveis

A interface autenticada não utiliza cores fixas. Desde a Fase 1, implementar os seis temas oficiais por tokens semânticos:

```text
Paper | Sakura | Obsidian | Midnight | Aurora | Rose Gold
```

A preferência pertence ao usuário individual, suporta modo `system`, é aplicada antes do primeiro render e sincronizada no perfil. A fonte de verdade é `THEME-SYSTEM.md`.

## Stripe

A implementação padrão agora é uma integração Stripe customizada por adapter e Cloud Functions. A Firebase Extension não deve ser instalada nem usada como fonte de verdade do produto.

## Marca oficial

```text
Nome: Zerou
Tagline: Controle individual. Organização a dois.
Descritor curto: Finanças pessoais e a dois.
```

O pacote de imagens aprovado é distribuído separadamente como `zerou-brand-assets.zip`. A integração deve seguir `BRAND-ASSET-INTEGRATION.md`.

## Checklist de handoff

Antes de iniciar cada execução, revisar `HANDOFF-CHECKLIST.md`.
