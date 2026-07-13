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


# Fase 2 — Motor financeiro essencial

## Pré-condição

A Fase 1 deve estar concluída. Não iniciar se autenticação, workspace pessoal ou Security Rules básicas estiverem quebrados.

## Objetivo

Implementar o núcleo financeiro pessoal utilizável: contas, categorias, transações, dashboard, contas a pagar básicas, recorrências básicas, busca simples e offline-first sem duplicação.

## Escopo permitido

### Domínio

Implementar conforme `CONTRATOS-CANONICOS.md`:

```text
Account
Category
Transaction
Bill
RecurringRule
```

### Regras financeiras

- dinheiro como inteiro em centavos;
- IDs de mutação gerados de forma idempotente;
- transferências com origem e destino consistentes;
- ajustes explícitos;
- soft delete quando aplicável;
- saldo derivado corretamente;
- categorias padrão criadas idempotentemente;
- cliente não altera campos protegidos;
- validação Zod na borda apropriada.

### Telas

Implementar:

```text
/app/dashboard
/app/transactions
/app/transactions/new
/app/accounts
/app/bills
/app/recurring
/app/search
```

Cadastro rápido mobile:

1. valor;
2. tipo;
3. descrição;
4. categoria;
5. conta;
6. data;
7. avançado recolhido.

### Dashboard v1

Exibir:

- saldo total;
- disponível livre v1;
- valor comprometido;
- até três próximos compromissos;
- até cinco transações recentes;
- ações rápidas;
- estado de sincronização.

Cálculo v1:

```text
saldo disponível
- bills pendentes antes da próxima receita prevista
- recorrências previstas no período
= disponível livre v1
```

Preparar ponto de extensão para incluir faturas na Fase 3.

### Offline-first

- habilitar cache persistente atual do Firestore Web;
- usar Firestore como fila primária para escritas financeiras offline;
- não duplicar fila em Dexie;
- mostrar pending, synced e failed;
- preservar mutações após fechar e reabrir app;
- sincronizar ao reconectar sem duplicação;
- disponibilizar limpeza de cache local no logout quando solicitado.

Dexie pode ser adicionado somente para índice local explícito, sem armazenar uma segunda fila concorrente de transações.

### Security Rules

Cobrir accounts, categories, transactions, bills e recurring por membership ativa e campos protegidos.

## Fora do escopo

Não implementar:

- cartões e faturas;
- couple workspace funcional;
- billing;
- import OFX/CSV;
- automações;
- metas;
- provisões;
- relatórios avançados.

## Testes obrigatórios

### Domínio

- receita aumenta saldo;
- despesa reduz saldo;
- transferência não altera patrimônio consolidado;
- ajuste é explícito;
- exclusão lógica não duplica efeito;
- centavos são preservados sem erro de arredondamento.

### Segurança

- usuário A não lê transações de B;
- usuário A não escreve conta de B;
- frontend não altera `workspaceId`, `createdBy` ou campos protegidos.

### Offline

- criar transação offline;
- fechar app;
- reabrir;
- reconectar;
- sincronizar uma vez;
- não duplicar saldo;
- editar offline;
- exibir status correto.

### E2E

- criar conta;
- criar primeira conta financeira;
- cadastrar receita;
- cadastrar despesa;
- visualizar dashboard atualizado;
- criar bill;
- visualizar compromisso próximo.

## Gate de qualidade

```text
usuário registra uma transação offline, fecha o app, reabre,
reconecta e vê exatamente uma transação sincronizada com saldo correto;
dashboard mostra saldo, compromissos e disponível livre v1.
```

## Entrega

Executar testes, corrigir, atualizar `IMPLEMENTATION_STATUS.md` e parar.
