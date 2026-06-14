# Instruções operacionais obrigatórias

Você está trabalhando no repositório do **Zerou**. Execute somente a fase descrita neste arquivo.

Leia antes de editar:

1. `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`;
2. `CONTRATOS-CANONICOS.md`;
3. `BRAND-GUIDELINES.md`;
4. `THEME-SYSTEM.md`;
5. `PRODUCT-COPY-CANONICAL.md`;
6. `IMPLEMENTATION_STATUS.md`;
7. arquivos existentes do repositório;
8. `00-BOOTSTRAP-MANUAL.md` quando houver dependência externa.

Regras:

- não antecipar funcionalidades de fases futuras;
- não fingir que criou recurso externo;
- não substituir funcionalidade por mock permanente;
- não remover comportamento previamente validado;
- manter TypeScript strict;
- persistir dinheiro como inteiros em centavos;
- nunca confiar em autorização, plano ou entitlement enviados pelo frontend;
- usar **Zerou** como nome exibido ao usuário e nunca reintroduzir o nome provisório anterior;
- seguir a identidade de `BRAND-GUIDELINES.md` em toda superfície visual criada nesta fase;
- seguir `THEME-SYSTEM.md`: não hardcodar cores em componentes da interface autenticada e consumir somente tokens semânticos;
- corrigir erros encontrados dentro do escopo atual;
- atualizar `IMPLEMENTATION_STATUS.md` ao final;
- parar ao concluir o gate desta fase.


# Fase 3 — Cartões e faturas

## Pré-condição

A Fase 2 deve estar concluída e estável.

## Objetivo

Implementar o principal diferencial técnico do Zerou: cartões, ciclos de fatura e ledger imutável com pagamentos parciais, antecipações e correção de dupla contagem.

## Escopo permitido

### Módulo de domínio puro

Criar um módulo desacoplado da UI e do Firestore para calcular faturas a partir do ledger.

Sugestão:

```text
src/domain/invoices/
  calculateInvoice.ts
  invoiceTypes.ts
  invoiceInvariants.ts
  invoiceFixtures.ts
```

Regras:

- ledger é imutável;
- toda entrada possui `idempotencyKey`;
- mutações server-side críticas são idempotentes;
- agregados de Invoice são derivados do ledger;
- não confiar em agregados enviados pelo cliente;
- compra do cartão gera despesa;
- pagamento da fatura quita passivo e não gera segunda despesa.

### Casos obrigatórios

- cadastrar cartão;
- definir fechamento e vencimento;
- atribuir compra ao ciclo correto;
- fechar fatura;
- pagar total;
- pagar parcialmente;
- realizar múltiplos pagamentos;
- pagar antecipadamente;
- pagar acima do saldo;
- carregar crédito excedente;
- registrar estorno;
- registrar chargeback;
- registrar juros, multa, IOF e tarifa;
- parcelar compra;
- antecipar parcelas;
- conciliar fatura de forma básica.

### Functions sugeridas

```text
createCardPurchase()
closeInvoice()
recordInvoicePayment()
recordInvoiceCredit()
recordInvoiceFee()
anticipateInstallments()
reconcileInvoice()
```

Não permitir escrita direta do cliente no ledger.

### Telas

```text
/app/cards
/app/cards/:cardId
/app/cards/:cardId/invoices/:invoiceId
```

Na fatura, destacar:

- total de compras;
- pagamentos acumulados;
- créditos;
- tarifas;
- saldo pendente;
- status;
- timeline de ledger;
- ação pagar;
- ação antecipar;
- ação conciliar.

### Integração com dashboard

Adicionar faturas com vencimento no período ao cálculo de disponível livre v1.

## Fora do escopo

Não implementar:

- compartilhamento do casal;
- billing SaaS;
- integração bancária;
- admin;
- automações.

## Testes unitários obrigatórios do ledger

Cobrir ao menos:

```text
compras 1090,00
pagamentos 550,00
saldo 540,00
```

E também:

- pagamento parcial;
- dois pagamentos parciais;
- pagamento total;
- sobrepagamento;
- crédito excedente;
- estorno antes e depois do fechamento;
- chargeback;
- tarifa;
- juros;
- multa;
- IOF;
- parcelamento;
- antecipação de parcela;
- retry com mesma `idempotencyKey` não duplica entrada;
- compra e pagamento não viram duas despesas;
- saldo de conta reduz ao pagar fatura;
- despesa reconhecida continua sendo a compra.

### Segurança

- cliente não escreve ledger diretamente;
- usuário sem membership não lê cartão;
- usuário sem membership não lê invoice;
- cliente não altera agregados de Invoice.

### E2E

- criar cartão;
- registrar compras;
- abrir fatura;
- registrar pagamento parcial;
- verificar saldo pendente;
- registrar segundo pagamento;
- verificar atualização correta.

## Gate de qualidade

```text
testes unitários do ledger passam integralmente;
pagamento parcial não duplica despesa;
retry idempotente não duplica ledger;
fatura exibe compras, pagamentos e saldo pendente corretos.
```

## Entrega

Executar testes, corrigir, atualizar `IMPLEMENTATION_STATUS.md` e parar.
