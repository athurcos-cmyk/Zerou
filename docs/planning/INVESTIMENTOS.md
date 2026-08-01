# Feature: Investimentos

> Este plano é pra outra IA executar, sem o contexto desta conversa. Cada seção tem caminho de
> arquivo exato, nome de função/campo exato, e trecho de código de referência quando existe algo
> pra reaproveitar. Onde eu digo "reaproveita X", significa: abrir X primeiro, entender o padrão,
> replicar — não inventar um padrão novo se um já resolve o mesmo problema no projeto.

## Contexto

Muitos usuários da Granativa investem, e hoje não há lugar pra isso no app. `AccountType`
(`src/types/contracts.ts`) já inclui `'investment'` (ícone, label, sugestão de corretora em
`src/finance/bankInstitutions.ts`), mas sem comportamento especial — uma conta assim hoje entra no
Saldo total normalmente. É o problema #1 a resolver.

O projeto tem uma disciplina forte, documentada em `CLAUDE.md` e no histórico
(`docs/history/2026-07.md`): **nunca especular número financeiro que não é real**. "Fluxo de
Caixa" foi apagado por estimar receita futura pela média histórica; "Patrimônio Líquido" foi
descontinuado. Não há como o app saber quanto um investimento realmente rende (sem integração com
corretora), então essa mesma disciplina vale aqui — todo valor exibido é o que a pessoa mesma
declarou, nunca calculado por estimativa.

## Modelo de produto (decisões já fechadas com o dono, não reabrir)

1. **Dois níveis.** A pessoa cadastra uma **conta de investimento** (a corretora/banco — ex.:
   "XP", "Nubank Investimentos"), igual já cadastra conta corrente. Dentro dela, cadastra um ou
   mais **investimentos** (CDB, Tesouro Direto, Ações...), cada um com seu próprio valor investido
   e valor atual — porque um CDB e uma ação não se comportam igual.
2. **Aportar/Resgatar só pela tela de Investimentos**, nunca pelo fluxo genérico de Nova
   Transação — fisicamente impossível de outra forma (ver seção "Saldo total").
3. **Aporte/resgate ENTRAM na Análise padrão** (`/app/search`), como uma categoria própria por
   conta de investimento (ex.: donut mostra fatia "Investimento: XP") — é dinheiro saindo do que
   está livre pra gastar, a pessoa precisa ver isso na foto geral de "pra onde foi meu dinheiro".
4. **Rendimento = valor atual declarado − total aportado**, por investimento individual, via botão
   "Quanto rendeu desde a última vez?" — nunca estimado.
5. **Essa transação de aporte/resgate não pode ser excluída pelo Extrato comum** — desfazer é só
   resgatando de novo pela tela de Investimentos.
6. **Tutorial na primeira visita** à aba Investimentos, mesmo padrão dos tours já existentes
   (Análise, Categorias).
7. **Aviso permanente e visível**: a Granativa não se conecta com nenhuma corretora/banco.
8. **Tipos pré-definidos** de investimento: Tesouro Direto, CDB, LCI/LCA, Fundos, Ações, FIIs,
   Previdência Privada, Criptomoedas, Outro.
9. **Dashboard + gráfico X/Y próprios** no topo da aba Investimentos — totalmente separados do
   donut da Análise padrão (que é por categoria/mês, não série temporal).

## Por que `expense`/`income` com categoria sintética, e não `transfer`

`transfer` (`TransactionType`) é sempre `'internal'` em `transactionFlowByType`
(`src/finance/financeCalculations.ts:132`) — nunca aparece em soma de gasto/receita nem no donut.
Isso contradiz a decisão #3 acima. Em vez de criar um filtro/exceção nova só pra essa combinação,
o aporte usa `type: 'expense'` (resgate usa `type: 'income'`) — o mesmo tipo de qualquer
gasto/receita comum — com uma **categoria sintética própria por conta de investimento**. Toda a
Análise (donut, Resumo Anual, Tendência por categoria, Alertas de Orçamento) já sabe somar/agrupar
por `categoryId` — reaproveitar esse pipeline significa **zero mudança** em
`src/finance/spendingAnalysis.ts`, `src/finance/annualSummaryCalculations.ts`,
`src/finance/budgetAlertCache.ts`, `functions/src/budgetAlerts.ts`. A única coisa nova é: criar a
categoria certa, e impedir que a transação seja apagada pelo fluxo comum (seção própria abaixo).

## Modelo de dados

### Nível 1 — "Conta de investimento" = `Account` existente, `type: 'investment'`

Nenhum campo novo em `Account`. Como o aporte agora é `expense`/`income` (não `transfer`), essa
conta **nunca é debitada/creditada por transação nenhuma** — vira uma entidade puramente
organizacional (rótulo + agrupador de investimentos). `openingBalanceCents`/`currentBalanceCents`
ficam vestigiais (sempre `0`, nunca lidos pra exibição — a tela de Investimentos sempre soma os
`Investment` filhos ao vivo). **`validAccountCreate`/`validAccountUpdate` em `firestore.rules`
não precisam de nenhuma mudança.**

### Nível 2 — `Investment` (coleção NOVA `workspaces/{workspaceId}/investments/{investmentId}`)

Adicionar em `src/types/contracts.ts`, perto de `Account`:
```ts
export type InvestmentKind =
  | 'treasury'   // Tesouro Direto
  | 'cdb'        // CDB
  | 'lci_lca'    // LCI/LCA
  | 'funds'      // Fundos de investimento
  | 'stocks'     // Ações avulsas
  | 'reits'      // FIIs (Fundos Imobiliários)
  | 'pension'    // Previdência Privada (PGBL/VGBL)
  | 'crypto'     // Criptomoedas
  | 'other';

export interface Investment {
  id: string;
  workspaceId: string;
  /** FK pra Account com type === 'investment'. */
  investmentAccountId: string;
  name: string;                  // ex.: "Tesouro Selic 2029", "CDB Banco X 110% CDI"
  kind: InvestmentKind;
  /** Total líquido aportado (aportes − resgates), mantido incrementalmente via increment(). */
  contributedCents: number;
  /** Último valor real declarado pela pessoa — nunca calculado, sempre digitado por ela. */
  currentBalanceCents: number;
  isActive: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```

### Categoria sintética por conta de investimento

Adicionar em `Category` (`src/types/contracts.ts`):
```ts
/** Presente só em categorias auto-criadas junto com uma conta de investimento (ver
 * `createInvestmentAccount`). Marca a categoria como gerenciada pelo sistema — nunca deve
 * aparecer num seletor de categoria pra lançamento comum (ver `selectableCategories`). */
linkedInvestmentAccountId?: string;
```
Uma categoria por **conta de investimento** (não por investimento individual — quem tem 5 CDBs na
XP gera 1 fatia "Investimento: XP" no donut, não 5). Campos ao criar: `name: `Investimento:
${accountName}``, `type: 'both'` (serve pro aporte `expense` e pro resgate `income`), `icon:
'investment'` (reaproveita o mapeamento que já existe em `src/components/categoryIcons.tsx:41`,
`'investment': TrendingUp`), `isDefault: false`, `isActive: true`, `linkedInvestmentAccountId:
<id da Account recém-criada>`.

**Nunca aparece em seletor de categoria nenhum.** `selectableCategories`
(`src/finance/categoryHierarchy.ts`) já é o choke point que hoje esconde "categoria que virou
grupo pai" dos seletores (ver `docs/planning/SUBCATEGORIAS.md`) — adicionar mais uma condição:
```ts
// dentro do filtro que selectableCategories já aplica, adicionar:
!category.linkedInvestmentAccountId
```
Isso cobre de graça `src/components/CategoryField.tsx` (seletor de Nova Transação), o formulário
de Contas a Pagar/Recorrência (`src/pages/BillsPage.tsx`) e a criação de Orçamento
(`src/pages/SearchPage.tsx`) — todos já consomem `selectableCategories`. Confirmar isso lendo
`categoryHierarchy.ts` antes de implementar (o texto acima descreve a intenção, não o diff exato
linha a linha). Também não deve listar em `src/settings/CategoriesSettingsPage.tsx` — mesmo filtro
aplicado na leitura da lista dessa tela.

### Histórico de valor (coleção NOVA `workspaces/{workspaceId}/investmentValueUpdates/{id}`)

Fonte do gráfico X/Y da aba Investimentos (não do donut — esse já vem de graça da categoria
sintética). Mesmo padrão imutável de `GoalContribution`/`InvoiceLedgerEntry` (só `create`, nunca
`update`/`delete` pelo cliente):
```ts
export interface InvestmentValueUpdate {
  id: string;
  workspaceId: string;
  investmentId: string;
  balanceCents: number;            // valor declarado neste momento
  contributedCentsAtTime: number;  // total aportado no momento (reconstrói rendimento histórico)
  recordedAt: Timestamp;
  createdBy: string;
  createdAt?: Timestamp;
}
```
Um registro é criado em TRÊS momentos: (a) criação do investimento (ponto inicial, rendimento =
0), (b) cada aporte/resgate, (c) cada "Quanto rendeu desde a última vez?".

## `src/finance/financeSchemas.ts` — schemas novos

```ts
export const investmentKinds = [
  'treasury', 'cdb', 'lci_lca', 'funds', 'stocks', 'reits', 'pension', 'crypto', 'other'
] as const;

export const createInvestmentAccountSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres.').max(80)
});

export const createInvestmentSchema = z.object({
  investmentAccountId: z.string().trim().min(1),
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres.').max(80),
  kind: z.enum(investmentKinds),
  openingBalanceCents: moneyCentsSchema  // reaproveita o schema já existente no arquivo
});
```

## `src/finance/financeLabels.ts` — labels novos

```ts
export const investmentKindLabels: Record<InvestmentKind, string> = {
  treasury: 'Tesouro Direto',
  cdb: 'CDB',
  lci_lca: 'LCI/LCA',
  funds: 'Fundos de investimento',
  stocks: 'Ações',
  reits: 'FIIs',
  pension: 'Previdência Privada',
  crypto: 'Criptomoedas',
  other: 'Outro'
};
```

## `src/finance/financeService.ts` — funções novas

Reaproveitar os padrões já existentes no arquivo: `createAccount` (linha 104) pro batch de criar
conta+categoria, `contributeToGoalWithTransaction` (linha 1263) como molde EXATO pro aporte/
resgate, `reconcileAccountBalance` (linha 229) como referência de "pessoa declara um valor, app
grava a diferença".

```ts
/** Cria a conta de investimento (Account, type: 'investment') e a categoria sintética vinculada,
 * no mesmo batch. Espelha createAccount, mas sempre type: 'investment' e sem openingBalanceCents
 * (a conta nunca guarda saldo próprio — ver seção "Nível 1" do plano). */
export async function createInvestmentAccount(workspaceId: string, userId: string, input: { name: string }) {
  const parsed = createInvestmentAccountSchema.parse(input);
  const accountId = createId('acct');
  const categoryId = createId('cat');
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.set(documentRef(workspaceId, 'accounts', accountId), {
    id: accountId, workspaceId, name: parsed.name, type: 'investment' as const,
    openingBalanceCents: 0, currentBalanceCents: 0, isActive: true,
    createdBy: userId, createdAt: now, updatedAt: now
  });
  batch.set(documentRef(workspaceId, 'categories', categoryId), {
    id: categoryId, workspaceId, name: `Investimento: ${parsed.name}`, type: 'both' as const,
    icon: 'investment', isDefault: false, isActive: true,
    linkedInvestmentAccountId: accountId, createdAt: now, updatedAt: now
  });

  fireWrite(batch.commit());
  return { accountId, categoryId };
}

/** Cria um investimento dentro de uma conta de investimento. Sem transferência bancária — mesma
 * lógica de openingBalanceCents ao criar uma conta comum (pode ser um investimento que já
 * existia antes do app). contributedCents/currentBalanceCents nascem iguais. */
export function createInvestment(workspaceId: string, userId: string, input: {
  investmentAccountId: string; name: string; kind: InvestmentKind; openingBalanceCents: number;
}) {
  const parsed = createInvestmentSchema.parse(input);
  const investmentId = createId('inv');
  const updateId = createId('invupd');
  const now = serverTimestamp();
  const batch = writeBatch(getFirebaseDb());

  batch.set(documentRef(workspaceId, 'investments', investmentId), {
    id: investmentId, workspaceId, investmentAccountId: parsed.investmentAccountId,
    name: parsed.name, kind: parsed.kind,
    contributedCents: parsed.openingBalanceCents, currentBalanceCents: parsed.openingBalanceCents,
    isActive: true, createdBy: userId, createdAt: now, updatedAt: now
  });
  batch.set(documentRef(workspaceId, 'investmentValueUpdates', updateId), {
    id: updateId, workspaceId, investmentId,
    balanceCents: parsed.openingBalanceCents, contributedCentsAtTime: parsed.openingBalanceCents,
    recordedAt: now, createdBy: userId, createdAt: now
  });

  fireWrite(batch.commit());
  return investmentId;
}

/** Aportar (amountCents > 0) ou resgatar (amountCents < 0) num investimento, puxando/devolvendo
 * de uma conta bancária real. Espelha contributeToGoalWithTransaction (financeService.ts:1263):
 * cria a transação real + atualiza o contador incremental, no mesmo batch. */
export function contributeToInvestment(
  workspaceId: string,
  userId: string,
  investment: Pick<Investment, 'id' | 'name' | 'currentBalanceCents'>,
  categoryId: string,      // categoria sintética da conta de investimento dona deste investimento
  bankAccountId: string,   // conta de origem (aporte) ou destino (resgate)
  amountCents: number      // sinal: positivo = aporte, negativo = resgate
) {
  const isContribution = amountCents >= 0;
  const magnitudeCents = Math.abs(amountCents);
  const now = new Date();
  const monthKey = monthKeyFromDate(now);
  const txnId = createId('txn');
  const updateId = createId('invupd');
  const newContributedCents = investment.currentBalanceCents; // placeholder — ver nota abaixo

  const batch = writeBatch(getFirebaseDb());
  const type = isContribution ? ('expense' as const) : ('income' as const);

  batch.set(documentRef(workspaceId, 'transactions', txnId), omitUndefined({
    id: txnId, workspaceId, createdBy: userId, updatedBy: userId,
    type, amountCents: magnitudeCents,
    description: `${isContribution ? 'Aporte' : 'Resgate'}: ${investment.name}`,
    categoryId, accountId: bankAccountId,
    date: Timestamp.fromDate(now), competenceMonth: monthKey, cashMonth: monthKey,
    tags: ['investimento'], isRecurring: false, clientMutationId: txnId,
    syncStatus: 'synced', version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  }));
  // Efeito de saldo na conta bancária: reaproveita 100% sem mudança — transactionAccountEffects
  // já sabe debitar (expense) ou creditar (income) accountId.
  applyAccountEffectsToBatch(batch, workspaceId, transactionAccountEffects({
    type, amountCents: magnitudeCents, accountId: bankAccountId
  }));
  batch.update(documentRef(workspaceId, 'investments', investment.id), {
    contributedCents: increment(amountCents),
    currentBalanceCents: increment(amountCents),
    updatedAt: serverTimestamp()
  });
  batch.set(documentRef(workspaceId, 'investmentValueUpdates', updateId), omitUndefined({
    id: updateId, workspaceId, investmentId: investment.id,
    // newContributedCents/newBalance precisam ser calculados pelo CALLER (a UI já tem o valor
    // atual do investimento em memória via finance/contexto) e passados pra esta função, ou
    // lidos de volta depois do commit — ajustar a assinatura durante a implementação conforme o
    // que for mais simples: o ponto importante é que o registro de histórico reflita o valor
    // JÁ SOMADO ao aporte/resgate, não o valor de antes.
    recordedAt: serverTimestamp(), createdBy: userId, createdAt: serverTimestamp()
  }));

  fireWrite(batch.commit());
}

/** "Quanto rendeu desde a última vez?" — pessoa declara o valor atual real. NÃO cria transação
 * (não é dinheiro se movendo, é só uma declaração de valor) — por isso é impossível isto vazar
 * pra Análise, por construção. */
export function recordInvestmentValueUpdate(
  workspaceId: string,
  userId: string,
  investmentId: string,
  newBalanceCents: number,
  contributedCents: number  // valor atual de contributedCents, só pra gravar no histórico
) {
  const updateId = createId('invupd');
  const batch = writeBatch(getFirebaseDb());

  batch.update(documentRef(workspaceId, 'investments', investmentId), {
    currentBalanceCents: newBalanceCents,
    updatedAt: serverTimestamp()
  });
  batch.set(documentRef(workspaceId, 'investmentValueUpdates', updateId), {
    id: updateId, workspaceId, investmentId,
    balanceCents: newBalanceCents, contributedCentsAtTime: contributedCents,
    recordedAt: serverTimestamp(), createdBy: userId, createdAt: serverTimestamp()
  });

  fireWrite(batch.commit());
}
```
**Nota pra quem implementar**: o pseudo-código de `contributeToInvestment` acima tem um ponto em
aberto de propósito (`newContributedCents`) — decidir na hora se o `investmentValueUpdates` desse
evento grava o valor ANTES ou DEPOIS do aporte aplicado (recomendo DEPOIS, pra o gráfico já
refletir o degrau na hora certa), e ajustar a assinatura da função pra receber os valores já
somados (o caller, que já tem o investimento carregado via contexto, pode calcular
`investment.contributedCents + amountCents` antes de chamar).

**Excluir investimento**: `deleteInvestment(workspaceId, investmentId)` — se
`currentBalanceCents > 0`, a UI pede confirmação explícita antes de chamar ("Isso só apaga o
registro no app — não mexe em dinheiro real. Continuar?"); a função em si só faz
`deleteDoc`/`fireWrite`, sem lógica de devolução (diferente de `deleteGoalWithRefund`) — se a
pessoa quer o dinheiro de volta numa conta bancária, ela resgata primeiro pela sheet de Resgatar.

## Por que o aporte/resgate não pode ser excluído pelo Extrato comum

A escrita de `contributeToInvestment` é composta: transação + `increment` no `Investment`. Um
"excluir lançamento" genérico (o que já existe pra qualquer transação hoje) só reverteria o efeito
de saldo da conta bancária (via `transactionAccountEffects`, que só sabe que é um `expense`/
`income` comum) — **nunca saberia** que também precisa reverter `contributedCents`/
`currentBalanceCents` do investimento, porque esse efeito extra não é derivado do tipo da
transação, é específico desta feature. Deixar isso passar pelo caminho normal de exclusão
deixaria os dois sistemas fora de sincronia — a mesma classe de bug que o `CLAUDE.md` já
documentou duas vezes (campo/comportamento novo que a regra ou a UI não sabe tratar).

Fix, duas camadas:
1. **Cliente**: em `src/pages/TransactionsPage.tsx`, o botão/ação de excluir lançamento passa a
   checar `transaction.tags?.includes('investimento')` — se verdadeiro, esconder/desabilitar o
   botão e mostrar um texto no lugar ("Pra desfazer, resgate pela tela de Investimentos").
2. **Regra** (`firestore.rules`, defesa em profundidade — não confiar só na UI): na função que
   valida a atualização de transação (soft-delete via `deletedAt`, hoje provavelmente dentro de
   `validTransactionUpdate` — conferir o nome exato lendo o arquivo), adicionar:
   ```
   && !(request.resource.data.diff(resource.data).affectedKeys().hasAny(['deletedAt'])
        && resource.data.tags is list && resource.data.tags.hasAny(['investimento']))
   ```
   (ajustar sintaxe exata conforme o corpo real da função em `firestore.rules` — o ponto é: se a
   transação atual já tem a tag `'investimento'`, rejeitar qualquer tentativa de setar
   `deletedAt`.)

## Tutorial da aba Investimentos (mesmo padrão de Análise/Categorias)

Este projeto já tem um sistema de tour reutilizável — **copiar o padrão exato**, não inventar um
novo. Referência: `src/onboarding/AnalysisTour.tsx` + `src/onboarding/analysisTour.store.ts` (tour
da tela de Análise) e `src/onboarding/SlideTour.tsx` (carrossel genérico, já pronto e não muda).

**Novo arquivo `src/onboarding/investmentsTour.store.ts`** — cópia de
`src/onboarding/analysisTour.store.ts` trocando:
- `SEEN_KEY = 'zerou.investmentsTourSeen'` (mesma convenção `zerou.*TourSeen`)
- nome do hook: `useInvestmentsTour`
- nome da interface: `InvestmentsTourState`

**Novo arquivo `src/onboarding/InvestmentsTour.tsx`** — cópia de
`src/onboarding/AnalysisTour.tsx` trocando o array `slides` e os imports pro store novo. Sugestão
de conteúdo dos slides (ajustar copy na hora, manter o tom direto que os outros tours já usam):
```ts
const slides: TourSlide[] = [
  {
    icon: <TrendingUp size={26} aria-hidden="true" />,
    title: 'Seus investimentos, organizados',
    text: 'Cadastre a corretora ou banco onde você investe e, dentro dela, cada investimento — CDB, Tesouro, ações, o que for.'
  },
  {
    icon: <ArrowUpRight size={26} aria-hidden="true" />,
    title: 'Aportar e resgatar de verdade',
    text: 'Mandar dinheiro pra um investimento tira o valor de uma conta bancária de verdade — e aparece no seu Extrato e na sua Análise, como qualquer outro gasto.'
  },
  {
    icon: <AlertCircle size={26} aria-hidden="true" />,
    title: 'A Granativa não se conecta com sua corretora',
    text: 'Ninguém consegue saber quanto seu investimento rendeu sozinho. De vez em quando, digite o valor atual e o app calcula o rendimento pra você.'
  }
];
```
Igual `AnalysisTour`, abre sozinho na primeira visita **depois** do tour global
(`useWelcomeTour((s) => s.seen)` como guarda), e é reaberto por um botão "Como funciona" na
própria tela — copiar o padrão mais simples de
`src/settings/CategoriesSettingsPage.tsx:168` (botão avulso com ícone `HelpCircle`, sem menu de
"mais ações"), não o padrão de `SearchPage.tsx` (que usa uma sheet de ações porque já tinha várias
outras opções ali).

Montar `<InvestmentsTour />` uma vez dentro de `InvestmentsPage.tsx`, mesmo lugar que
`<AnalysisTour />` é montado em `SearchPage.tsx:1054` (perto do fim do JSX, fora do fluxo visual
normal).

## Saldo total — choke point necessário (higiene de lista, não mais "dinheiro")

Mesmo que a conta de investimento não guarde saldo de verdade, o documento existe em `accounts` e
não pode aparecer na lista "Contas" nem em seletor de conta pra lançamento comum.

Em `src/finance/useFinanceData.ts`, linha ~285, hoje:
```ts
const activeAccounts = useMemo(() => state.accounts.filter((account) => account.isActive), [state.accounts]);
```
Trocar por:
```ts
const activeAccounts = useMemo(
  () => state.accounts.filter((a) => a.isActive && a.type !== 'investment'),
  [state.accounts]
);
const investmentAccounts = useMemo(
  () => state.accounts.filter((a) => a.isActive && a.type === 'investment'),
  [state.accounts]
);
```
E no `return` do hook (mesmo arquivo, linhas ~312-319), manter `accounts: activeAccounts` (nome
inalterado — zero mudança nos ~20 consumidores existentes) e adicionar `investmentAccounts` ao
objeto retornado, pra `InvestmentsPage.tsx` consumir via `useFinanceContext()`.

Consequência automática (sem tocar em cada tela): Saldo total do Dashboard, saldo por dia do
Extrato, lista/total de `src/pages/AccountsPage.tsx`, seletores de conta em Nova Transação/Contas
a Pagar/Metas — todos herdam a exclusão porque todos já leem `finance.accounts`.

**Ajuste manual único**: `src/pages/AccountsPage.tsx` para de oferecer `'investment'` como opção
no `SelectField` de tipo do formulário "Nova conta" (`accountTypes.filter((t) => t !== 'investment')`)
— cadastrar conta de investimento passa a ser só pela aba nova.

Não é necessário nenhum ajuste de resolução de nome de conta no Extrato: como o aporte/resgate
usa `accountId` sempre apontando pra uma conta bancária comum (nunca pra uma conta de
investimento), `TransactionsPage.tsx` resolve o nome normalmente com o `finance.accounts` já
filtrado — nenhuma mudança necessária ali.

## Contas de investimento já existentes em produção

Como `'investment'` já era tipo selecionável antes desta feature, pode haver conta assim com
saldo de verdade em produção (criada pelo fluxo comum). Ao subir: some do Saldo total (choke
point acima) e aparece na aba nova como uma conta de investimento vazia, sem nenhum `Investment`
filho e sem categoria sintética (que só é criada pelo fluxo novo `createInvestmentAccount`). A
pessoa precisa recadastrar os investimentos dentro dela manualmente — não dá pra migrar
automaticamente um saldo solto num "investimento" sem nome/tipo/valor aportado conhecido. Avisar
o dono antes do deploy de regras, pra saber se há alguém real nessa situação.

## Análise de Investimentos (gráfico X/Y) — dentro da aba Investimentos, não em `/app/search`

O donut da Análise padrão já mostra aporte/resgate como categoria (seção acima) — isso responde
"quanto saiu pra investimento **este mês**". A Análise de Investimentos responde outra pergunta:
"como o valor total do portfólio andou **no tempo**" — pede série temporal, não proporção por
categoria. As duas coexistem, servem perguntas diferentes, vivem em telas diferentes (donut em
`/app/search`, gráfico X/Y só em `/app/investments`), leem fontes diferentes (donut lê
`transactions` por categoria, zero código novo; gráfico X/Y lê `investmentValueUpdates`,
específico desta feature).

**Novo arquivo `src/finance/investmentAnalysis.ts`** (mesma separação que
`src/finance/spendingAnalysis.ts` já tem de `financeCalculations.ts`):
```ts
export interface InvestmentValuePoint {
  date: string;              // YYYY-MM-DD, mesmo formato de toDateInputValue
  balanceCents: number;      // soma de balanceCents de todos os investimentos naquela data
  contributedCents: number;  // soma de contributedCentsAtTime
}

/** Agrega investmentValueUpdates de TODOS os investimentos ativos do workspace num só array de
 * pontos, ordenado por data crescente, um ponto por data com pelo menos um evento (sem
 * interpolar entre datas sem evento). */
export function buildInvestmentValueHistory(
  updates: InvestmentValueUpdate[]
): InvestmentValuePoint[]
```
Implementação: agrupar `updates` por `toDateInputValue(u.recordedAt)`, dentro de cada grupo pegar
o snapshot mais recente por `investmentId` (evita contar duas atualizações do mesmo investimento
no mesmo dia duas vezes), somar `balanceCents`/`contributedCentsAtTime` de todos os investimentos
ativos naquele ponto no tempo. Como cada investimento só existe a partir da sua própria
criação, um investimento criado depois de outro só entra na soma a partir do dia em que existe
(não precisa de tratamento especial — ele simplesmente não tem update antes de existir).

**Novo componente `src/finance/InvestmentHistoryChart.tsx`**: Recharts `AreaChart`/`LineChart`
com `type="stepAfter"` nas duas séries (nunca `type="monotone"` — degrau, nunca curva suavizada,
porque interpolar entre dois pontos reais seria inventar um valor que ninguém declarou). Duas
séries: "Valor atual" (`balanceCents`) e "Total aportado" (`contributedCents`). **Antes de
escrever este componente, carregar a skill `dataviz`** pra paleta/eixos/tooltip consistentes com
o resto do app. Só renderizar com ≥ 2 pontos; com menos, mostrar uma mensagem simples (ou
`EmptyState`) em vez de gráfico vazio.

## Dashboard da aba Investimentos

No topo de `InvestmentsPage.tsx`, antes da lista: três números — **Total investido** (soma de
`contributedCents` de todos os `Investment` ativos do workspace), **Valor atual** (soma de
`currentBalanceCents`), **Rendimento total** (diferença, em R$ e %, verde se positivo/vermelho se
negativo). Hero sóbrio `--gradient-slate` (é lista de itens, não entidade única — mesma razão de
`src/pages/CardsPage.tsx`, ver `docs/design/DESIGN.md`). O gráfico X/Y (seção acima) fica logo
abaixo desse cabeçalho.

## Aviso permanente

Texto fixo, sempre visível (toda vez que a tela abre, não um modal de "só na primeira vez" — isso
é o Tutorial, seção separada), estilo `text-muted`, mesmo tom do rodapé de
`src/finance/AccountReconcileSheet.tsx` ("A Granativa não conecta no seu banco..."):

> "A Granativa não se conecta com nenhuma corretora ou banco — todo valor aqui é o que você mesmo
> informa. Atualize de vez em quando pra acompanhar o rendimento real."

## Offline — os cinco pontos de escrita seguem fire-and-forget

Todos usam `fireWrite(...)` sem `await` bloqueando a UI, mesma garantia que qualquer escrita do
app já tem hoje (`CLAUDE.md`, REGRA PRINCIPAL offline-first):
- `createInvestmentAccount` — `fireWrite(batch.commit())`.
- `createInvestment` — `fireWrite(batch.commit())`.
- `contributeToInvestment` — `fireWrite(batch.commit())`.
- `recordInvestmentValueUpdate` — `fireWrite(batch.commit())`.
- `deleteInvestment` — `fireWrite(deleteDoc(...))`.

Nenhuma dessas funções deve ter `await` antes de fechar a sheet/formulário na UI — fechar e
limpar o form ANTES de chamar a escrita, exatamente como todo outro fluxo do app.

## `firestore.rules`

Adicionar perto de `validAccountCreate`/`validReceivableCreate` (ler o arquivo pra achar o
formato exato de `validExistingAccountReference`, `validShortText`, `validSignedMoneyCents` e
reaproveitar):

```
function validExistingInvestmentAccountReference(workspaceId, accountId) {
  return accountId is string
    && get(/databases/$(database)/documents/workspaces/$(workspaceId)/accounts/$(accountId)).data.type == 'investment';
}

function validInvestmentCreate(workspaceId, investmentId) {
  return isActiveMember(workspaceId)
    && request.resource.data.keys().hasOnly([
      'id', 'workspaceId', 'investmentAccountId', 'name', 'kind',
      'contributedCents', 'currentBalanceCents', 'isActive', 'createdBy', 'createdAt', 'updatedAt'
    ])
    && request.resource.data.id == investmentId
    && request.resource.data.workspaceId == workspaceId
    && validExistingInvestmentAccountReference(workspaceId, request.resource.data.investmentAccountId)
    && validShortText(request.resource.data.name, 2, 80)
    && request.resource.data.kind in ['treasury','cdb','lci_lca','funds','stocks','reits','pension','crypto','other']
    && validSignedMoneyCents(request.resource.data.contributedCents)
    && validSignedMoneyCents(request.resource.data.currentBalanceCents)
    && request.resource.data.isActive is bool
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.createdAt == request.time
    && request.resource.data.updatedAt == request.time;
}

function validInvestmentUpdate(workspaceId) {
  return isActiveMember(workspaceId)
    && request.resource.data.workspaceId == resource.data.workspaceId
    && request.resource.data.investmentAccountId == resource.data.investmentAccountId
    && request.resource.data.createdBy == resource.data.createdBy
    && request.resource.data.createdAt == resource.data.createdAt
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
      ['name', 'kind', 'contributedCents', 'currentBalanceCents', 'isActive', 'updatedAt']
    )
    && validSignedMoneyCents(request.resource.data.contributedCents)
    && validSignedMoneyCents(request.resource.data.currentBalanceCents)
    && request.resource.data.updatedAt == request.time;
}

function validInvestmentValueUpdateCreate(workspaceId) {
  return isActiveMember(workspaceId)
    && request.resource.data.keys().hasOnly([
      'id', 'workspaceId', 'investmentId', 'balanceCents', 'contributedCentsAtTime',
      'recordedAt', 'createdBy', 'createdAt'
    ])
    && request.resource.data.workspaceId == workspaceId
    && request.resource.data.investmentId is string
    && validSignedMoneyCents(request.resource.data.balanceCents)
    && validSignedMoneyCents(request.resource.data.contributedCentsAtTime)
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.createdAt == request.time;
}
```
E os matches, no bloco `match /workspaces/{workspaceId}` perto de `match /accounts/{accountId}`:
```
match /investments/{investmentId} {
  allow read: if isActiveMember(workspaceId);
  allow create: if validInvestmentCreate(workspaceId, investmentId);
  allow update: if validInvestmentUpdate(workspaceId);
  allow delete: if isActiveMember(workspaceId);
}

match /investmentValueUpdates/{updateId} {
  allow read: if isActiveMember(workspaceId);
  allow create: if validInvestmentValueUpdateCreate(workspaceId);
  allow update, delete: if false;
}
```

Além disso:
- `validCategoryCreate`/`validCategoryUpdate` (`firestore.rules`, perto de linha 396): adicionar
  `linkedInvestmentAccountId` opcional ao `hasOnly([...])`, com
  `(!request.resource.data.keys().hasAny(['linkedInvestmentAccountId']) ||
  validExistingInvestmentAccountReference(workspaceId, request.resource.data.linkedInvestmentAccountId))`.
- A função que hoje valida update/soft-delete de transação (achar o nome exato lendo o arquivo,
  provavelmente `validTransactionUpdate`) ganha a checagem descrita na seção "Por que o
  aporte/resgate não pode ser excluído".

`tests/firestore.rules.test.ts`: payloads novos pra `investments`/`investmentValueUpdates`/
categoria com `linkedInvestmentAccountId`; caso negativo de editar/apagar
`investmentValueUpdates` (deve falhar); caso negativo de `Investment` apontando pra uma conta que
não é `type: 'investment'` (deve falhar); caso negativo de excluir transação com
`tags: ['investimento']` (deve falhar). **`npm run test:rules` (via `scripts/with-java.mjs`) tem
que passar antes de considerar a mudança pronta** — REGRA PRINCIPAL do `CLAUDE.md`, campo/coleção
nova sempre no mesmo commit da regra correspondente.

## UI nova

- **Rota** `/app/investments` → `src/pages/InvestmentsPage.tsx`. Estrutura de cima pra baixo:
  aviso permanente → dashboard (3 números) → gráfico X/Y (`InvestmentHistoryChart`) → lista
  **agrupada por conta de investimento** (cada corretora expansível, mostrando os investimentos
  dentro: tipo com ícone (`investmentKindLabels`), valor atual, rendimento R$/%, botões
  **Aportar** / **Resgatar** / **Quanto rendeu desde a última vez?** / editar / excluir).
- "+ Nova conta de investimento" (chama `createInvestmentAccount`) e, dentro de cada conta, "+
  Novo investimento" (chama `createInvestment`, formulário: nome, tipo via `SelectField` com
  `investmentKindLabels`, valor inicial).
- Sheet **Aportar/Resgatar** (`InvestmentContributeSheet.tsx`, espelha
  `src/finance/GoalContributeSheet.tsx`): toggle aportar/resgatar, `SelectField` de conta bancária
  (`finance.accounts`), campo de valor, chama `contributeToInvestment`.
- Sheet **"Quanto rendeu desde a última vez?"** (`InvestmentValueUpdateSheet.tsx`): mostra "Valor
  aportado: R$X" / "Última atualização: R$Y em DD/MM", campo pro valor de hoje, chama
  `recordInvestmentValueUpdate`, feedback pós-confirmação "Rendeu R$Z (W%)" / "teve uma perda de
  R$Z" (tom neutro, nunca alarmista).
- **Fora de escopo nesta fase**: tela de detalhe/histórico por investimento individual (o gráfico
  mostra só o agregado do portfólio). Fase 2 natural se houver demanda — mesma disciplina de
  escopo que "Contas a Receber Fase 1" já usou no projeto.

### Navegação

- `src/layout/AppShell.tsx`: `NavLink` "Investimentos" (ícone `TrendingUp` de `lucide-react`,
  import já usado no arquivo? conferir e importar se faltar) na sidebar desktop, logo abaixo de
  "Contas" (linha ~92); tile equivalente no grid "Ir para" do menu mobile (`BottomSheet`, mesma
  zona de Metas/Análise/Compartilhado, por volta da linha ~175-183) — **não** entra na barra fixa
  de 4 ícones do mobile (Início/Transações/FAB/Cartões/Menu).
- `src/App.tsx`: nova rota `/app/investments` apontando pra `InvestmentsPage`.

## WhatsApp: nunca usa investimento (definitivo, sem revisão futura)

`functions/src/whatsapp/interpretMessage.ts` — o trecho que casa nome de conta na mensagem e o
fallback pra "conta principal" (`isPrimary`) precisam excluir `type === 'investment'` da query
Admin SDK de `accounts`. WhatsApp continua só lançamento rápido — filosofia já documentada
("WhatsApp só lança, app conversa", `SESSAO.md`).

## Vic do app: entra desligada nesta entrega, checkpoint marcado pra depois

`functions/src/ai/buildFinancialContext.ts` é compartilhado entre app e WhatsApp — **nenhuma
mudança nele nesta entrega**. Mesmo com o aporte/resgate aparecendo na Análise padrão (que a Vic
já pode enxergar hoje via o contexto normal de gastos), o total/rendimento consolidado de
investimentos não é mencionado especificamente em lugar nenhum do prompt/contexto. Consistente com
a regra já existente e mais rígida da Vic pra investimento ("nenhuma análise, só redirecionamento
pra profissional licenciado", `docs/ai/VIC.md`).

**Pendência a registrar em `docs/planning/TODOS.md` ao final desta entrega** (não implementar
agora): revisar se a Vic **do app** (nunca a do WhatsApp) deve ganhar consciência explícita do
total investido/rendimento como contexto pra conversas de decisão financeira grande — sem nunca
dar conselho/análise sobre o investimento em si (regra que não muda). Precisaria de um parâmetro
novo em `buildFinancialContext.ts` (ex.: `includeInvestments`, só `true` no caminho do app) pra
não afetar o WhatsApp.

## Arquivos principais a tocar

| Arquivo | Mudança |
|---|---|
| `src/types/contracts.ts` | `Investment`, `InvestmentKind`, `InvestmentValueUpdate`; `Category.linkedInvestmentAccountId` |
| `src/finance/financeSchemas.ts` | `investmentKinds`, `createInvestmentAccountSchema`, `createInvestmentSchema` |
| `src/finance/financeLabels.ts` | `investmentKindLabels` |
| `src/finance/categoryHierarchy.ts` | `selectableCategories` exclui `linkedInvestmentAccountId` |
| `src/finance/useFinanceData.ts` | choke point (`activeAccounts` exclui investimento) + `investmentAccounts`; nova subscrição de `investments`/`investmentValueUpdates` |
| `src/finance/financeService.ts` | `createInvestmentAccount`, `createInvestment`, `contributeToInvestment`, `recordInvestmentValueUpdate`, `deleteInvestment` |
| `src/finance/investmentAnalysis.ts` | novo, `buildInvestmentValueHistory` |
| `src/finance/InvestmentContributeSheet.tsx` | novo, espelha `GoalContributeSheet.tsx` |
| `src/finance/InvestmentValueUpdateSheet.tsx` | novo |
| `src/finance/InvestmentHistoryChart.tsx` | novo, Recharts `stepAfter` |
| `src/onboarding/investmentsTour.store.ts` | novo, cópia de `analysisTour.store.ts` |
| `src/onboarding/InvestmentsTour.tsx` | novo, cópia de `AnalysisTour.tsx` |
| `src/pages/InvestmentsPage.tsx` | novo — aviso + dashboard + gráfico + lista + tour |
| `src/pages/AccountsPage.tsx` | remove `'investment'` das opções do formulário |
| `src/pages/TransactionsPage.tsx` | esconde botão excluir quando `tags` inclui `'investimento'` |
| `src/settings/CategoriesSettingsPage.tsx` | lista de categorias exclui `linkedInvestmentAccountId` |
| `src/layout/AppShell.tsx`, `src/App.tsx` | nav + rota |
| `firestore.rules` | `validInvestmentCreate/Update`, `validInvestmentValueUpdateCreate`, `validCategoryCreate/Update` (+campo), função de update/soft-delete de transação (+bloqueio) |
| `tests/firestore.rules.test.ts` | payloads novos, casos negativos |
| `functions/src/whatsapp/interpretMessage.ts` | excluir `type === 'investment'` da query de contas |
| `docs/planning/TODOS.md` | item novo: revisar depois se a Vic do app ganha contexto de investimento |

## Ordem de implementação sugerida

1. **Tipos e schemas**: `contracts.ts`, `financeSchemas.ts`, `financeLabels.ts` — sem isso nada
   mais compila.
2. **`firestore.rules`** + `tests/firestore.rules.test.ts`, rodar `npm run test:rules` até
   ficar verde, ANTES de escrever qualquer service function — evita escrever código de cliente
   contra uma regra que ainda vai mudar.
3. **`financeService.ts`** (as 5 funções novas) + **`useFinanceData.ts`** (choke point +
   subscrições novas de `investments`/`investmentValueUpdates`).
4. **`categoryHierarchy.ts`** (exclusão da categoria sintética dos seletores) — testar que
   `selectableCategories` continua passando nos testes existentes.
5. **UI**: sheets (`InvestmentContributeSheet`, `InvestmentValueUpdateSheet`), depois
   `InvestmentsPage.tsx` juntando tudo (dashboard, gráfico, lista), depois nav
   (`AppShell.tsx`/`App.tsx`).
6. **Tutorial** (`investmentsTour.store.ts` + `InvestmentsTour.tsx`), montado dentro de
   `InvestmentsPage.tsx`.
7. **Ajustes finos**: `AccountsPage.tsx` (remove opção do formulário), `TransactionsPage.tsx`
   (esconde botão excluir), `CategoriesSettingsPage.tsx` (esconde categoria sintética).
8. **`functions/src/whatsapp/interpretMessage.ts`** (exclusão de contas de investimento) +
   `docs/planning/TODOS.md` (item da Vic).
9. **Verificação completa** (seção abaixo) antes de considerar pronto.

## Verificação

1. `npm run typecheck` · `npm test` · `npm run build`.
2. `npm run test:rules` (via `scripts/with-java.mjs`) — payloads novos passam; editar/excluir
   `investmentValueUpdates` falha; `Investment` apontando pra conta que não é `type: 'investment'`
   falha; excluir transação com `tags: ['investimento']` falha.
3. Testes unitários novos: rendimento (`currentBalanceCents − contributedCents`) em cenários
   (aporte simples, aporte + resgate parcial, resgate maior que aportado = lucro),
   `buildInvestmentValueHistory` com múltiplos investimentos e datas, `selectableCategories`
   escondendo a categoria vinculada.
4. Verificação ao vivo no navegador (dev server): cadastrar conta de investimento → cadastrar um
   investimento dentro dela → aportar de uma conta corrente real e conferir (a) saldo da corrente
   cai, (b) Saldo total do Dashboard cai igual (esperado — é gasto de verdade agora), (c)
   transação aparece no Extrato **sem botão de excluir**, (d) a Análise do mês
   (`/app/search`) mostra uma fatia nova "Investimento: {conta}" no donut com o valor certo.
   Depois, "Quanto rendeu desde a última vez?" com valor maior: número de rendimento bate no
   dashboard da aba, gráfico X/Y ganha um ponto novo, e a Análise do mês **não muda em nada**
   (nenhuma transação nova foi criada). Conferir que a categoria sintética não aparece em nenhum
   seletor de categoria normal (Nova Transação, Contas a Pagar, Orçamento) nem na lista de
   `CategoriesSettingsPage`. Conferir que investimento não aparece em seletor de conta nenhum fora
   da aba Investimentos. Abrir `/app/investments` pela primeira vez (localStorage limpo) e
   confirmar que o tutorial abre sozinho; reabrir pelo botão "Como funciona".
