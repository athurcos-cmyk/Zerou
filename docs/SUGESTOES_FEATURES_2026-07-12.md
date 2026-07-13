# Sugestões de Features — Granativa (2026-07-12)

Documento com ideias de funcionalidades para o produto, priorizadas por relação
valor/esforço. Separado da análise de riscos e pontos fortes (`ANALISE_PROJETO_2026-07-12.md`).

---

## Alta prioridade

Funcionalidades que encaixam no produto atual com implementação rápida — dias, não semanas.

### 1. Bills automaticamente `overdue`

**Problema**: Contas a pagar (`Bill.status`) nunca viram `'overdue'` automaticamente.
Ficam "Pendente" pra sempre, mesmo com vencimento no passado. O cálculo do Comprometido
no Dashboard está correto (usa a data real, não o status), mas a lista de contas
(`BillsPage`) não tem indicação visual de atraso — uma conta vencida há 15 dias aparece
igual a uma que vence amanhã.

**Solução**: Um efeito client-side no `useFinanceData` ou na montagem da `BillsPage`
que, ao carregar as contas, atualiza `status: 'overdue'` via fire-and-forget para
documentos com `dueDate < now && status === 'pending'`.

**Por que é seguro**: A regra `validBillUpdate` já aceita `status in ['pending', 'paid',
'overdue', 'cancelled']`. Não precisa mudar regra nem deploy. É puramente client-side,
barato e sem risco de rejeição.

**Esforço**: ~30min. Um `useEffect` + fire-and-forget.

---

### 2. Meta com data-limite visível no card

**Problema**: `Goal` já tem campo `dueDate` opcional. A UI de metas (`GoalsPage`)
mostra nome, valor-alvo e barra de progresso, mas não mostra "faltam 45 dias" nem
destaca metas próximas do prazo. O deadline existe no dado mas é invisível pro usuário.

**Solução**: Adicionar abaixo da barra de progresso um texto "até 15 ago" ou "faltam
23 dias", com destaque visual (ex.: cor de alerta) quando estiver a menos de 7 dias
do prazo.

**Esforço**: Mais CSS que lógica. O campo `dueDate` já vem no objeto `Goal`. É
formatar a data com `formatFriendlyDate` e calcular a distância.

---

### 3. Filtro por status nos Compromissos

**Problema**: A tela de Compromissos (`BillsPage`) lista todas as contas em uma
lista só, sem distinção visual clara entre pendentes, pagas e (futuramente) em atraso.

**Solução**: Chips de filtro "Todos / Pendentes / Em atraso / Pagos" no topo da lista,
igual à tela de Transações que já tem chips de tipo ("Tudo / Despesas / Receitas /
Transferências").

**Por que é fácil**: O componente `.chip`/`.chip--active` já existe em `global.css`
e é reutilizado em várias telas. É só adicionar os chips e um `filter` no array de
bills.

**Esforço**: ~1h. Componente já existe, lógica é um `.filter()`.

---

### 4. Atalho "Lançar despesa" a partir de um compromisso

**Problema**: Uma conta recorrente como "Aluguel todo dia 10" está cadastrada nos
Compromissos. No dia do pagamento, o usuário precisa ir em Transações → Nova transação
e preencher valor, descrição e categoria do zero — mesmo sendo dados que já estão no
compromisso.

**Solução**: Um botão "Lançar agora" no card do bill que navega para o formulário de
nova transação com `state` pré-preenchido: `{ description, amountCents, categoryId,
accountId }`. O formulário de transação (`NewTransactionPage`) já aceitaria esses
valores iniciais.

**Esforço**: ~2h. Navegação com state + aceitar `initialValues` no form.

---

## Média prioridade

Mais esforço de implementação, mas alto valor pro usuário.

### 5. Orçamento mensal por categoria

**Problema**: O usuário não tem como saber se está gastando demais numa categoria.
A Análise mostra quanto já foi gasto, mas não há referência do que seria "ok".

**Solução**: O usuário define "quero gastar no máximo R$ 500 em Restaurantes esse mês"
e vê uma barra de progresso (verde → amarela → vermelha) no Dashboard e na Análise.
Os dados de gasto por categoria **já existem** — a Análise calcula isso todo mês via
`spendingAnalysis.ts`.

**O que falta**:
- Uma coleção `budgets` no workspace (ou um mapa no perfil)
- UI de configuração (sheet com categoria + valor)
- Barras de progresso no Dashboard e na Análise
- Nova regra no Firestore (simples, similar a `validGoalCreate`)

**Esforço**: ~2-3 dias. Modelo de dados novo + UI + regra.

---

### 6. Exportar transações (CSV)

**Problema**: O app guarda todo o histórico financeiro do usuário, mas não tem como
tirar os dados de lá. Isso é essencial pra qualquer app financeiro (imposto de renda,
conferência, backup) e atende LGPD (direito à portabilidade de dados).

**Solução**: Um botão na Análise ou em Configurações que gera um arquivo CSV do mês
selecionado com data, tipo, descrição, categoria, valor, conta e tags.

**Por que é fácil**: Totalmente client-side — não consome cota do Firestore. Os dados
já estão em memória nos hooks. É `Array.map().join(',')` + `URL.createObjectURL()` +
`<a download>`. Nem precisa de biblioteca externa.

**Esforço**: ~3h. Botão + função `transactionsToCsv()` + download. Sem mudança de regra.

---

### 7. Tags personalizadas

**Problema**: `Transaction.tags` é `list` com validação `size() <= 8` na regra, mas
não existe UI de criar/gerenciar tags. O campo é preenchido programaticamente (`bill`,
`recorrente`, `meta`, `cofrinho`) mas o usuário não pode criar as próprias categorias
leves como "mercado", "viagem", "reembolsável".

**Solução**:
- Campo de tags no formulário de transação (chips + input de texto livre)
- Filtro por tag na busca de transações
- (Opcional) coleção `tags` no workspace pra gerenciar/renomear/colorir

**Esforço**: ~1-2 dias. Input de tags + filtro na busca. Se adicionar coleção, precisa
de regra nova.

---

### 8. Reconciliação "conferido"

**Problema**: Quem reconcilia extrato manualmente (prática comum no Brasil) precisa
conferir cada transação do app contra o extrato do banco. Hoje não tem como marcar
"já conferi essa".

**Solução**: Um checkbox ou toggle por transação: "confere com o banco".

**Implementação**:
- Campo opcional `reconciledAt: Timestamp` na transação
- Atualizar `validTransactionCreate` (opcional — `!keys().hasAny(['reconciledAt'])`)
  e `validTransactionUpdate` (permitir o campo no `hasOnly`) na regra
- Botão de check na linha da transação ou no sheet de edição
- Filtro "Não conferidos" na busca

**Esforço**: ~1 dia. Maior parte é a atualização de regra e teste.

---

## Baixa prioridade

Visão de longo prazo. Features transformadoras mas que exigem mais investimento.

### 9. Importação OFX/CSV bancário

**Problema**: Migrar de planilha/app exige digitar todas as transações históricas
uma por uma. Bancos brasileiros exportam extratos em OFX (Open Financial Exchange)
e CSV.

**Solução**: Um parser client-side que lê o arquivo, mapeia transações do banco pro
formato do app, mostra um preview e importa em lote. Cada banco tem seu dialeto de
OFX, então o parser precisa ser tolerante.

**Esforço**: ~1-2 semanas. Parser + UI de preview + import em lote + testes com
arquivos reais de 3-4 bancos.

---

### 10. Split de conta entre amigos (além do casal)

**Problema**: O app resolve divisão de gastos com o parceiro(a) via workspace do
casal. Mas dividir a conta do restaurante com amigos não exige (nem deveria exigir)
um espaço compartilhado permanente.

**Solução**: Um link compartilhável "R$ 150 no restaurante, R$ 75 cada" que não
exige workspace do casal. Usa o mesmo conceito de `sharedExpenseClaims` mas com um
token público temporário — a pessoa que recebe o link vê os detalhes e confirma sua
parte. Expande o uso do app pra dividir conta com qualquer pessoa.

**Esforço**: ~1 semana. Nova coleção ou extensão do modelo de claims + UI pública +
token/link temporário.

---

### 11. Modo escuro agendado

**Problema**: O app tem modo `system` (segue o dispositivo) e manual. Mas não tem
como agendar "claro de dia, escuro de noite" independente do sistema.

**Solução**: Uma terceira opção "Automático (horário)" que alterna entre Paper e o
tema escuro escolhido baseado no horário local (ex.: claro 6h-18h, escuro 18h-6h).

**Por que é fácil**: Já existe toda a infra de troca de tema via `data-theme` no
`<html>`. É só adicionar um `useEffect` que confere `new Date().getHours()` e aplica
o tema correspondente. Horários poderiam ser configuráveis.

**Esforço**: ~2h. localStorage + useEffect. Sem mudança de regra.

---

### 12. Widget "quanto posso gastar por dia"

**Problema**: O Dashboard mostra "Disponível: R$ 1.400" mas isso é abstrato. O que
significa em termos de decisão diária?

**Solução**: No Dashboard, pegar o "Disponível" e dividir pelos dias restantes até o
próximo recebimento. Dá um número concreto e motivador: "Você pode gastar ~R$ 47/dia
até o dia 5." Reaproveita a lógica de `nextPaydayFrom` que já existe. Se não houver
próximo recebimento definido, usa 30 dias.

**Esforço**: ~1h. É conteúdo novo na mesma tela, sem dados novos. Uma divisão e um
componente de texto. Sem mudança de regra.

---

*Sugestões geradas em 2026-07-12 a partir de leitura completa do código, regras,
documentação e changelog do projeto Granativa.*
