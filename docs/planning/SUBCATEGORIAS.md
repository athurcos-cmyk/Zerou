# Subcategorias — plano de implementação

Status: **implementado** (passos 1–8). Revisado com `/plan-eng-review` em 2026-07-29; entregue
até 30/07/2026 (ver "Ordem sugerida" no fim). ⚠️ O filtro da Vic só vale em produção depois do
**deploy manual da function** — `git push` não reimplanta.
Decisões tomadas pelo dono durante a revisão estão marcadas com `[D1]`…`[D13]`.

## O que é

Categoria principal agrupa subcategorias. `Casa` → `Energia`, `Água`, `Internet`.
A subcategoria herda **apenas a cor** do pai; nome e ícone são próprios.

## A decisão que define tudo: pai é só agrupamento `[D10]`

**Uma categoria que tem filhas deixa de ser selecionável.** Não dá pra lançar em `Casa`,
só em `Energia` ou `Água`.

O dono chegou nessa conclusão derrubando a recomendação inicial (pai selecionável), e o
argumento é sólido: se `Casa` tem R$ 1.000 lançados direto e `Energia` tem R$ 500, o "% da
Energia" não tem denominador óbvio — 50% de 1.000, ou 33% de 1.500? Dá pra resolver na
exibição, mas vira regra que precisa ser explicada. Regra que precisa de explicação confunde.

```
SELECIONÁVEL?                         Categoria sem filhas  →  SIM
                                      Categoria COM filhas  →  NÃO (virou grupo)
                                      Subcategoria          →  SIM (é folha)
```

### O campo `type` não é mais perguntado (30/07/2026)

O formulário tinha um seletor "Tipo" (Gasto / Receita / Ambos). O dono apontou que **não faz
sentido**: quem define se um lançamento é gasto ou receita é a **transação**, não a categoria.

O campo continua existindo no dado, porque é ele que **filtra a lista no momento do lançamento**
(Salário não deve aparecer numa despesa). Mas passou a ser inferido:

```
subcategoria              →  herda o tipo do PAI
editando                  →  mantém o que já estava
criando dentro de um lançamento →  o tipo da própria transação
criando na aba Categorias →  `both` (aparece em qualquer lançamento)
```

A herança do pai não é cosmética — ver o bug abaixo.

### Bug corrigido: pai voltava a ser selecionável `[D10]`

Achado em produção pelo dono. O seletor filtrava por **tipo** ANTES de perguntar quem era pai:

```
                    ERRADO                              CERTO
  todas ──filtra tipo──▶ recorte ──quem é pai?──▶   todas ──quem é pai?──▶ ids
                             ▲                             │
              filha some do recorte                        ▼
              pai vira "folha"                    recorte ──remove os ids──▶ selecionáveis
              e volta a ser SELECIONÁVEL
```

Com pai `both` e filha `expense`, a filha sumia do recorte de uma transação de **receita**, o pai
deixava de parecer pai e voltava a ser selecionável — furando a regra justamente onde ela mais
importa. `parentCategoryIds` agora calcula o parentesco na lista completa, e a herança de tipo
elimina a divergência na origem. Regressão travada em `categoryHierarchy.test.ts`.

Segundo bug do mesmo lote: a linha do seletor procurava a categoria escolhida só entre as
**selecionáveis**. Um lançamento antigo apontando pra uma categoria que virou pai depois exibia
"Selecione", como se a categoria tivesse sumido. Agora a exibição busca na lista completa — não é
mais oferecida, mas continua sendo mostrada.

## Modelo de dados: zero migração

`Category.parentCategoryId?: string` **já existe** (`src/types/contracts.ts:175`) e está morto —
zero usos no repo. `firestore.rules` **já aceita** o campo em `validCategoryCreate` (`hasOnly`)
e `validCategoryUpdate` (`affectedKeys`), com `validOptionalString(..., 120)` nos dois.

Consequência: **nenhuma coleção nova, nenhuma migração, nenhum deploy de regra** para o campo.
Falta só o teste — ver "Gap nas regras" abaixo.

```
Category {
  id, workspaceId, name, type, icon, color, isDefault, isActive
  parentCategoryId?  ← ativado agora; ausente = categoria principal
}

Casa            { id: 'expense_home',  parentCategoryId: undefined, color: '#3B82C4' }
  └─ Energia    { id: 'cat_a1b2',      parentCategoryId: 'expense_home', color: '#3B82C4' }
  └─ Água       { id: 'cat_c3d4',      parentCategoryId: 'expense_home', color: '#3B82C4' }
                                                                        ↑ cor COPIADA [D4]
```

## Herança de cor: copiar ao gravar, propagar na edição `[D4]`

A filha guarda a cor no próprio documento. **O lado da leitura não muda em lugar nenhum** —
`resolveCategoryColor` e `CategoryMark` mantêm a assinatura atual, e eles são chamados de seis
telas (Extrato, Dashboard, Análise, Resumo Anual, seletor, Contas a Receber).

```
criar filha          →  color = cor do pai (copiada no createCategory)
editar cor do PAI    →  writeBatch: pai + TODAS as filhas, no mesmo commit atômico
editar nome do pai   →  nenhuma propagação
editar filha         →  nunca propaga pra cima
```

Offline: o batch é `fireWrite` (fire-and-forget), igual todo o resto — funciona na fila.

**Risco aceito**: é um segundo caminho de escrita. Se alguém adicionar outra forma de mudar
cor no futuro e esquecer de propagar, as filhas ficam pra trás. Mitigado por teste unitário.

## Profundidade: travada em 1 nível `[D2]`

Subcategoria não pode ter subcategoria. A trava é client-side, em três pontos:
1. Categoria que **tem filhas** não aparece como opção de pai.
2. Categoria não pode ser pai de si mesma.
3. Uma **filha** não aparece como opção de pai.

Sem isso, a agregação vira recursão e um ciclo (`A→B→A`) trava a tela.

## Análise: roll-up no donut + expansão na lista `[D1]`

**O donut mostra só categorias principais.** A expansão acontece na **lista de percentuais**,
não no donut — tocar numa linha abre as subcategorias com o **% relativo ao pai**.

Isso resolve a colisão de cor que a herança cria: se as filhas de Casa são todas azul-Casa,
5 fatias idênticas no donut seriam indistinguíveis. Com roll-up, o donut tem 1 fatia azul e a
lista expandida distingue pelo rótulo e ícone.

```
DONUT                       LISTA (colapsada)          LISTA (Casa expandida)
   ╭───────╮                Casa        R$ 800  40%    Casa        R$ 800  40%  ▼
  ╱ Casa    ╲               Alimentação R$ 600  30%      Energia   R$ 500  63%
 │  ███████  │              Transporte  R$ 400  20%      Água      R$ 200  25%
  ╲ (1 azul)╱               Lazer       R$ 200  10%      Casa·geral R$ 100  12%  ← [D11]
   ╰───────╯                                           Alimentação R$ 600  30%
                                                       ...
   % relativo ao TOTAL  ────────────────┘                 % relativo ao PAI ──┘
```

### O roll-up NÃO pode entrar em `spendingByCategoryForMonth`

Essa função tem **três** consumidores:

```
spendingByCategoryForMonth
  ├── SearchPage.tsx:280        → donut          ← roll-up SÓ aqui
  ├── BudgetAlertBanner.tsx:25  → orçamento      ← NÃO pode rolar (contaria dobrado)
  └── annualSummaryCalculations.ts:57 → Resumo Anual ← NÃO pode rolar
```

Se o roll-up entrasse dentro dela, um orçamento em `Casa` passaria a incluir Energia e Água
sozinho — que é exatamente a decisão adiada. Por isso é uma função **separada**
(`rollUpByParent`) aplicada só na chamada do donut. Travado por teste de regressão `[D9]`.

### Assinatura (implementada em `spendingAnalysis.ts`, 30/07/2026)

```ts
rollUpByParent(
  totals: ReadonlyMap<string, number>,   // saída de spendingByCategoryForMonth
  categoriesById: ReadonlyMap<string, Pick<Category, 'parentCategoryId'>>
): Map<string, CategoryRollUp>           // { totalCents, children: Map<id, cents> }
```

Devolve os dois níveis numa passada só — a lista renderiza colapsada e expandida sem
recalcular. Detalhes que só apareceram ao escrever:

- **A linha "· geral" usa o id do PRÓPRIO PAI como chave** dentro de `children`, em vez de um
  marcador tipo `casa::geral`. Não precisa de parsing e não colide com id de categoria real.
- **Filha órfã** (pai fora do mapa) vira linha de primeiro nível com o próprio valor: perder o
  agrupamento é aceitável, sumir com o gasto não.
- **Filha negativa fica na expansão** (mês de estorno). Sem ela os valores mostrados não
  explicariam o total do pai — e o objetivo da expansão é exatamente esse.
- Teste `não perde nem inventa centavo` compara a soma da entrada com a da saída: é o que pega
  qualquer erro de bucketização.

### Orçamento em categoria que virou agrupamento

Caiu de lambuja com o roll-up e precisou de decisão: a linha da Análise agora mostra o total do
grupo, mas o `BudgetAlertBanner` mede só o gasto **direto**. Barra de orçamento na linha do pai
seriam dois números diferentes com o mesmo rótulo.

- A barra **sai** da linha do pai; no lugar, a expansão traz o aviso "conta só o que for lançado
  direto em Casa, não as subcategorias".
- O seletor de orçamentos passa a **listar só categorias folha** — limite em algo que não recebe
  lançamento não mede nada. Exceção: quem já tem orçamento continua listado mesmo virando pai,
  senão o limite antigo ficaria ativo e sem como remover.
- Somar filhas no orçamento continua sendo `[D1]`, em aberto.

### Guarda de NaN `[D8]`

`spendingByCategoryForMonth` **pode devolver valores negativos** (mês só de estorno — o
comentário em `spendingAnalysis.ts:139` avisa). Então o total do pai pode ser **zero**
(gastou 100 em Energia, estornou 100) mesmo sendo só a soma das filhas.

`filha ÷ pai × 100` com pai zero vira `Infinity`/`NaN` e imprime "NaN%" na tela.

**Regra**: total do pai zero ou negativo → esconde o %, mostra só o valor em reais.

Implementado como defesa em profundidade: a lista já filtra `totalCents > 0` antes de renderizar,
então a guarda não deveria ser alcançável hoje. Ela fica porque "NaN%" é erro que o usuário vê
antes da gente — e o filtro de cima é uma linha que qualquer refactor pode mexer.

### Pendente: `CategoryTrendSheet` não rola pro pai

A tendência por categoria monta a própria lista a partir do gasto cru
(`spendingByCategoryAcrossMonths`), não da prop `categories` — filtrar a prop só apagaria o nome
e deixaria o item lá como "Sem categoria". Então, hoje, abrir a tendência de uma categoria que
virou agrupamento mostra **só o gasto direto** nela, enquanto a Análise mostra o total do grupo:
mesmo nome, números diferentes. Não é regressão (nunca foi rolado), mas é divergência visível.
Resolver exige decidir o que "tendência de Casa" significa — provavelmente o total do grupo — e
rolar mês a mês lá dentro. Fora do escopo desta rodada.

## Histórico: a linha "Casa · geral" `[D11]`

Quando uma categoria que já tem lançamentos vira pai, esses lançamentos continuam apontando
pra ela. Eles aparecem na expansão como uma linha `Casa · geral`, tratada como se fosse mais
uma filha — então os % continuam somando 100%.

**Nenhum dado é tocado.** A linha só existe se houver gasto no pai.

### Recorrências e contas a pagar `[D13]`

`Bill.categoryId` e `RecurringRule.categoryId` também apontam pra categoria, e
`recordRecurringPayment` (`financeService.ts:1190`) e `payBill` (`financeService.ts:1060`)
criam transações **usando a categoria da regra**. Uma recorrência em `Casa` continuaria
gerando lançamento novo no pai todo mês.

- **Novas**: resolvido de graça — a BillsPage usa o **mesmo** `CategoryField`, então filtrar os
  pais do seletor impede recorrência/conta nova de apontar pra um pai.
- **Existentes**: **o app avisa, no momento certo, só quem precisa.** Ao criar a primeira
  subcategoria dentro de uma categoria que tem recorrência/conta apontando pra ela, aparece
  "Casa tem 3 recorrências apontando pra ela" com atalho pra Contas a Pagar. Não bloqueia e não
  escreve nada — a pessoa reaponta cada uma pra sub certa (as 3 de Casa vão pra 3 subs
  diferentes, então mover em massa erraria).
- **Os dados do próprio dono**: ele decidiu excluir e refazer as 13 recorrências na mão.

### Por que NÃO apagar as recorrências de todo mundo

Avaliado e **descartado** em 2026-07-29. A ideia era zerar recorrências/contas de todos os
usuários e mandar um email explicando. Números reais na época: **9 usuários, só 3 com dados**
(um deles o próprio dono), então **2 pessoas afetadas** — uma delas com **23 recorrências
configuradas**, a usuária mais engajada por essa métrica.

Descartado porque a premissa não se sustenta: **nada quebra**. Recorrência apontando pra um
pai continua funcionando; a linha "geral" só aparece pra quem *também* decidir dividir aquela
categoria específica. Apagar 45 registros pra prevenir uma linha cosmética que talvez atinja
uma pessoa é desproporcional — e "apagamos seus dados por causa de uma atualização" é a pior
mensagem que um app de dinheiro pode mandar. O aviso pontual cobre o mesmo caso sem destruir
nada.

## Vic / WhatsApp `[D12]`

A lista de categorias vai pro modelo em `webhookHandler.ts:349`, montada de um snapshot que já
traz todas. **Filtrar as que têm filhas** custa quase nada e impede a Vic de casar/criar
lançamento numa categoria que o app não deixa escolher.

Exige **deploy de function** (`git push` não reimplanta).

**Implementado em 30/07/2026**: `functions/src/whatsapp/categorySelection.ts` —
`selectableCategoryOptions`, cópia da regra do app (Cloud Functions não importa `src/`), com 5
testes próprios. O filtro entra na hora de montar a lista, então cobre os dois caminhos de uma
vez: o prompt que vai pro modelo e o `resolveOrCreateCategory` (id de pai devolvido pelo modelo
não casa mais, e o lançamento fica sem categoria em vez de cair no pai).

⚠️ **Ainda não deployado** — enquanto `whatsappWebhook` não for reimplantado, a Vic em produção
continua oferecendo categoria-pai.

## Refatorações que vêm ANTES da feature

Duas, ambas no espírito "make the change easy, then make the easy change":

### 1. `useCategoryActions` `[D6]`

Existem **21 closures duplicadas** de criar/editar/excluir categoria em 4 arquivos
(BillsPage sozinha tem 12, de 4 instâncias do `CategoryField`). Adicionar `parentCategoryId`
significaria tocar nas 21 — e uma esquecida **não dá erro de compilação**, vira uma tela onde
subcategoria falha em silêncio.

### 2. `<CategoryForm>` compartilhado `[D7]`

A tela nova e a folha do seletor precisam do mesmo formulário (nome, 24 cores, 122 ícones,
campo de pai, excluir). Duplicar garante divergência — é a mesma classe de problema que criou
as 21 closures.

## Tela nova `[D5]`

Rota `/app/settings/categories`, no grupo **"Sua conta"** da nav (junto de Aparência, WhatsApp,
Segurança) — sidebar no desktop, tiles no menu mobile.

Organizar categoria é tarefa de configuração, feita de vez em quando; a nav principal fica só
com fluxo de dinheiro. **Descoberta** resolvida por um link "Gerenciar categorias" dentro do
seletor do lançamento.

**O seletor do lançamento NÃO sai** — requisito explícito do dono, pensando em quem abre o app
pela primeira vez e cai lá sem querer.

A tela explica o que são categorias e subcategorias (conteúdo e visual definidos no
`/frontend-design`, ainda não feito).

## Falha em produção — por caminho novo

| Caminho | Como falha | Tem teste? | Erro visível? |
|---|---|---|---|
| Propagação de cor | Batch falha offline → filhas com cor velha | a escrever | Não — silencioso |
| `rollUpByParent` | Pai com total 0 → `NaN%` | a escrever | Sim, na cara: "NaN%" |
| Guarda de exclusão | Client-side apenas; regra não conta filhas | a escrever | Só na UI |
| Trava de 1 nível | Ciclo `A→B→A` trava a tela | a escrever | Tela branca |
| Filha órfã | Pai sumiu por caminho não previsto | a escrever | Cor cai pro cinza |
| Filtro da Vic | Function não deployada → Vic escreve no pai | — | Não — silencioso |

**Gap crítico**: a propagação de cor falhando é silenciosa **e** sem teste hoje. É o primeiro
teste a escrever.

## Cobertura de teste planejada

26 caminhos novos, 0 cobertos hoje. Detalhe em
`~/.gstack/projects/athurcos-cmyk-Zerou/Thurcos-main-eng-review-test-plan-*.md`.

Seguindo a convenção do projeto (lógica de negócio ganha teste unitário pesado; wiring de
página se verifica ao vivo no browser), **não** há teste RTL proativo pra `CategoriesPage`.

Prioridade:
1. `rollUpByParent` — incl. negativos, pai zero, órfã, `NO_CATEGORY`
2. Propagação de cor — pai muda, só nome muda, sem filhas, filha nunca sobe
3. Trava de 1 nível e guarda de exclusão
4. **Regressão `[D9]`**: orçamento e Resumo Anual NÃO rolam pro pai
5. `parentCategoryId` no `categoryPayload` de `tests/firestore.rules.test.ts`

### Gap nas regras

`categoryPayload` (`tests/firestore.rules.test.ts:113`) **não inclui `parentCategoryId`** —
exatamente o buraco que a regra 2 do `CLAUDE.md` descreve: teste que não espelha o payload real
deixa passar regra desatualizada. A regra aceita o campo, mas nada prova isso.

## NÃO está no escopo

| Item | Por quê |
|---|---|
| **Orçamento no pai somando filhas** | Semântica de dupla contagem precisa de decisão de produto; `Budget.id === categoryId` é 1:1 hoje |
| **Vic criar subcategoria** | Ela só precisa parar de escrever no pai `[D12]`; criar hierarquia por mensagem é outra feature |
| **Roll-up no Resumo Anual** | Mesmo motivo do orçamento — mudaria número que hoje está certo |
| **Hierarquia de 3+ níveis** | `[D2]` — sem pedido real, e vira recursão + risco de ciclo |
| **Mover recorrências em massa** | `[D13]` — as 3 de Casa iriam pra 3 subs diferentes; destino único erraria 2 de 3 |
| **Validar nome duplicado** | TODO pré-existente (linha 26); subcategoria torna duplicata *legítima* ("Água" em Casa e em Mercado) — a decisão muda de natureza e merece rodada própria |
| **Redesenho visual da Análise** | TODO pré-existente (linha 27); drill-down cai no meio dele, mas juntar as duas coisas dobra o diff |

## Paralelização

```
Lane A: useCategoryActions → <CategoryForm>     (sequencial — mesmo módulo, components/)
Lane B: rollUpByParent + testes                 (independente — finance/, função pura)
Lane C: filtro de pais na Vic + deploy          (independente — functions/)

Lane A e B em paralelo. C a qualquer momento.
CategoriesPage e o seletor hierárquico dependem de A → vêm depois.
```

Conflito: nenhum. A toca `src/components/`, B toca `src/finance/`, C toca `functions/src/`.

## Ordem sugerida

1. ✅ Refactor: `useCategoryActions` (`[D6]`)
2. ✅ Refactor: `<CategoryForm>` (`[D7]`)
3. ✅ Modelo: `parentCategoryId` no create/update + propagação de cor + travas (`[D2]`, `[D3]`, `[D4]`)
4. ✅ Seletor: hierarquia + pai não-selecionável + link "Gerenciar categorias" (`[D10]`)
5. ✅ Tela nova (`[D5]`) — `/frontend-design` fica pra quando estiver tudo implementado (pedido do dono)
6. ✅ Análise: `rollUpByParent` + expansão na lista + guarda de NaN (`[D1]`, `[D8]`) — 30/07/2026
7. ✅ Testes de regressão (`[D9]`) + `parentCategoryId` nos testes de regra (feito no passo 3)
8. ✅ Vic: filtro de pais (`[D12]`) — ⚠️ **falta o deploy manual da function**

### Como o `[D9]` foi provado ao vivo (30/07/2026)

Teste unitário nas duas pontas (`spendingByCategoryForMonth` e `computeAnnualSummary`) + prova
na conta de teste: com orçamento de R$8.000 em `Casa` e `Casa · geral` = R$7.500, o banner do
Dashboard mostrou **"Limite próximo: Casa R$7.500,00 de R$8.000,00 (94%)"** enquanto a Análise
mostrava o grupo em R$15.501,44. Se o roll-up tivesse vazado pra fonte crua, o banner diria
"Orçamento estourado" com 194%.
