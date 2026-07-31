# Changelog

Resumo das mudancas recentes. O historico detalhado por mes fica em `docs/history/`.

## 2026-07-31 — feat(admin): enviar push/email pro usuário e pra todos, com histórico

Pedido do dono: a mesma capacidade que já existe no admin de outro projeto dele (Plantão) — mandar
uma mensagem (push e/ou email) pra um usuário específico, ou pra todos de uma vez. Detalhe em
`docs/history/2026-07.md`. **Já deployado** (cliente + regra + as 2 functions novas).

- Nova aba "Mensagens" no admin (`AdminPage.tsx`): composer com chips de canal (Push/Email/Ambos —
  reaproveita a classe `.chip` já usada em `GoalContributeSheet`/`SearchPage`), seletor de
  destinatário (um usuário via `SelectField` com busca, ou todos), histórico paginado.
- **Broadcast pra "todos" abre confirmação com a contagem real de destinatários antes de
  disparar** — gap de segurança que o Plantão (a referência) não tem.
- Backend novo (`functions/src/admin/adminMessaging.ts`, codebase `billing`) reaproveita
  `sendPushToUser` (`push.ts`) e o provider de email Resend já existentes — **não** duplica infra
  no `functions-admin` (codebase separado, sem a secret do Resend).
- `sendPushToUser` passou a retornar `{ tokensFound, sent }` em vez de `void` (aditivo — os 3
  callers existentes ignoram o retorno).
- Histórico em `adminMessages/{id}`, regra copiada do padrão já existente de `whatsappPhoneIndex`
  (`allow read: if isAdmin(); allow write: if false`). 77/77 testes de regras verdes.
- Não verificado visualmente no browser — a rota `/admin` exige o email real do dono, sem
  credencial disponível pra login automatizado. Validado por typecheck, build e as 3 suítes de
  teste (503 cliente, 125 functions, 77 regras).

## 2026-07-30 (parte 3) — fix(push): nenhuma notificação chegava — dois bugs independentes

Relato do dono: *"nenhuma notificação está sendo enviada"*. Tudo indicava sucesso — as 5 functions
agendadas no ar, 5 tokens FCM válidos, e o log dizendo `{"sentUsers":3,"staleRemoved":0}` todo dia.
Detalhe em `docs/history/2026-07.md`. **Deployado** (commit `81750bf`): cliente na Vercel, mais
`firestore:indexes` e `functions:billing:sendBudgetAlerts`. ⚠️ O filtro `--only functions:<nome>`
falha — o projeto tem dois codebases, o certo é `functions:billing:<nome>`.

- **Causa raiz (mata 100% dos pushes, desde 14/07)**: `getRegistration('/firebase-messaging-sw.js')`
  casa por **escopo**, não por script — devolvia a registration do VitePWA (`/sw.js`, escopo `/`),
  nunca `undefined`. O SW do FCM **nunca era registrado**, e o `getToken` amarrava a inscrição de
  push ao service worker do Workbox, **que não tem listener de `push`**. O FCM aceitava o envio, o
  token nunca virava stale, e nada aparecia no aparelho.
- **Fix**: registrar em escopo próprio (`/firebase-cloud-messaging-push-scope`, o padrão do SDK).
  Dois SWs **não** coexistem no mesmo escopo — em `/` um substituiria o outro e o offline quebraria.
  Verificado ao vivo em produção: os dois passam a coexistir, `/sw.js` intacto.
- **Push com o app aberto também sumia**: sem `onMessage`, o SDK entrega na página e nada é exibido.
  Novo `listenForForegroundPush`, com a mesma `tag` do SW pra nunca duplicar.
- **Token órfão agora é apagado** ao trocar: o FCM aceita envio pra token morto, então a limpeza de
  stale nunca o removeria. `firestore.rules` não mudou (`write` já cobre delete).
- **Bug 2, independente — `sendBudgetAlerts` quebrava todo dia** com `FAILED_PRECONDITION`: faltava
  a exceção `budgets.isActive` (COLLECTION_GROUP) em `firestore.indexes.json`. Nenhum alerta de
  orçamento jamais saiu (`budgetAlertState` vazia). Mesmo bug de `whatsappLinkCodes.code`.
- **Bug 3, que só apareceria depois**: o link do push de orçamento era relativo (`/app/search`) e o
  FCM exige URL absoluta. Corrigido, e o loop ganhou `try/catch` por item.
- Trava: `src/pwa/notifications.test.ts` (novo), 4 dos 5 casos falham sem o fix. 501 + 125 + 74
  testes verdes.

## 2026-07-30 (parte 3) — fix(orçamento): categoria excluída ficava pra sempre na tela de limites

Achado pelo dono usando o app: ele excluiu uma categoria que tinha limite de gasto, criou uma
subcategoria em Alimentação no lugar, e a categoria velha continuou na tela de "definir limite" —
e apagar o limite **não** a removia de lá.

- **Duas causas somadas.** (1) A lista da tela de orçamentos vem das **categorias**, não dos
  orçamentos, e nunca filtrava `isActive` — por isso a linha ficava mesmo depois de apagar o
  limite. (2) `deleteCategory` não mexia no orçamento, então o limite sobrevivia à categoria.
- **Correção**: `deleteCategory` agora apaga o orçamento no **mesmo batch** (`Budget.id ===
  categoryId`), e a tela de limites só lista categoria ativa. `expenseCategories` continua sem
  filtrar `isActive` de propósito — o Resumo Anual e a tendência precisam da lista completa pra
  resolver o **nome** de uma categoria já excluída; quem filtra é quem oferece uma **ação**.
- **Guarda pro dado antigo**: `BudgetAlertBanner` ignora orçamento de categoria excluída. Sem isso,
  uma categoria apagada no meio do mês continuava alertando por causa dos lançamentos que já
  existiam — e não havia mais tela nenhuma pra remover esse limite. Varredura em produção
  confirmou **zero órfãos** hoje; a guarda é pra quem estiver nesse estado sem ter percebido.
- 503 testes verdes (+7), com a limpeza do orçamento provada por sabotagem.

## 2026-07-30 (parte 2) — feat(vic): criar subcategoria por mensagem, sem adivinhar

Pergunta do dono: *"como que ela vai saber quando for pra criar uma subcategoria?"* — ele levantou
perguntar antes (como no cartão) ou guardar ~3 mensagens de memória.

- **Memória foi descartada**: faria a Vic *inferir* o pai de uma mensagem anterior, e palpite errado
  cria dado no lugar errado em silêncio. O padrão do cartão é bom justamente porque **pergunta em
  vez de inferir**.
- **Explícito funciona direto**: "cria Energia dentro de Casa" cria a subcategoria sem passo extra
  (campo `newCategoryParentName`, com o prompt proibindo inferir pai por assunto ou por mensagem
  anterior).
- **Sem menção, a Vic cria como principal e OFERECE mover**, com a lista numerada das principais
  (validade de 3 min, mesmo mecanismo do cartão). Perguntar *antes* cobraria de toda criação o custo
  do caso raro — a maioria das categorias é principal. Aqui a categoria já existe e já funciona:
  **ignorar a oferta é uma resposta válida**.
- Nome de pai citado que não existe não vira silêncio: cria como principal e diz o motivo.
- Filha herda **cor e tipo** do pai, igual ao app; só as raízes podem ser pai (trava de 1 nível,
  provada por sabotagem). 122 testes das functions verdes.
- **Deployado** (`whatsappWebhook`, revisão `00060-6j4`), com o `--no-cpu-throttling` reaplicado e
  conferido — o Cloud Run reseta essa flag a cada deploy.
- **Ela também LANÇA em subcategoria** (pergunta do dono): subcategoria é folha, então já estava na
  lista; agora a lista mostra a **hierarquia** (`Casa > Água`), sem o que duas "Água" em ramos
  diferentes — legítimo com subcategorias — ficariam indistinguíveis pro modelo.
- **Porta dos fundos pro pai, achada ao responder essa pergunta e fechada**: "coloca na categoria
  Casa" com Casa já sendo agrupamento fazia o modelo não achar Casa na lista, pedir pra criar, e a
  criação devolver a Casa existente — **o lançamento caía no pai**, furando `[D10]`. Agora lança
  sem categoria e avisa o motivo.
- **Medida a lentidão que o dono notou** (`docs/COSTS.md` seção 8): **não é o prompt** — é cold
  start. Quente 2,2–3,2s, frio 4,8–6,2s, e a amostra mais lenta é de *antes* do prompt crescer.
  Matar isso custa ~US$60/mês (`minInstances: 1` com CPU sempre alocada). **Decisão do dono: não
  mexer** — hoje o uso cabe no free tier (R$ 0) e mesmo 10 usuários dariam ~US$5,60/mês; por volta
  de 60–70 usuários pesados a conta se inverte sozinha. Gatilho de revisão anotado nos TODOs.
- **As duas Vics cobram por caminhos diferentes** (dúvida do dono, documentado em `VIC.md` e
  `COSTS.md`): as duas rodam em Cloud Function, mas a do app é `onCall` — processa e só então
  responde, então CPU só é cobrada **durante a requisição** e o ocioso é de graça. O gargalo dela
  não é CPU, é **leitura**: ~250 documentos por mensagem pra montar o contexto.

## 2026-07-30 — feat(categorias): subcategorias, de ponta a ponta

Feature grande, planejada com `/plan-eng-review` e executada nos passos 1–7 de
`docs/planning/SUBCATEGORIAS.md` (decisões do dono marcadas `[D1]`…`[D13]` lá).

- **Modelo sem migração**: campo opcional `parentCategoryId`. Categoria sem ele continua sendo o
  que sempre foi — nenhum dado existente precisou mudar. Profundidade travada em **1 nível**
  (`[D2]`): três travas em `canBeParentOf`, incluindo a que passa desapercebido (mover uma
  categoria que JÁ tem filhas pra dentro de outra faria netas).
- **Pai é só agrupamento** (`[D10]`, decisão do dono): quem ganha subcategoria deixa de receber
  lançamento. É o que mantém o percentual da Análise sem ambiguidade. A regra vale só enquanto
  existe filha ativa — categoria sem filha continua selecionável, e obrigar todo mundo a criar
  hierarquia seria trabalho puro.
- **Cor herdada de verdade**: a filha copia a cor do pai na gravação, e editar a cor do pai
  propaga pras filhas num `writeBatch` (atômico e offline-first). O seletor de cor some do
  formulário quando há pai — interface que oferece controle sem efeito é interface que mente.
- **Campo "Tipo" removido** do formulário: quem define gasto ou receita é a transação. O dado
  continua existindo (é ele que filtra a lista no lançamento), mas agora é inferido — e
  subcategoria herda o do pai.
- **Tela `/app/settings/categories`**, com explicação do que são categorias e subcategorias e
  atalho "+" pra criar subcategoria direto na linha da principal. O seletor dentro do lançamento
  **não saiu** (pedido do dono, pensando em quem abre o app pela primeira vez).
- **Análise com drill-down** (`[D1]`): o donut mostra só categorias principais; tocar na **linha
  da lista** (não no donut) abre as subcategorias com o % relativo ao pai. Lançamentos feitos na
  categoria antes de ela virar agrupamento aparecem como `Casa · geral`, então os percentuais
  fecham 100%.
- **O roll-up NÃO vazou** pro orçamento nem pro Resumo Anual (`[D9]`) — a mesma função alimenta as
  três telas e só a Análise quer agrupamento. Travado por teste nas duas pontas e provado ao vivo:
  com limite de R$8.000 em Casa, o banner disse "94%" (gasto direto) enquanto a Análise mostrava o
  grupo em R$15.501,44.
- **Dois bugs achados pelo dono em produção e corrigidos**: o pai voltava a ser selecionável num
  recorte por tipo que escondia a filha, e um lançamento antigo apontando pra categoria que virou
  pai exibia "Selecione", como se ela tivesse sumido.
- **Excluir categoria continua sendo exclusão lógica** (`isActive: false`, documento fica) —
  comportamento antigo, confirmado nos testes do dono e agora documentado: ela some dos seletores,
  mas o ícone, a cor e o nome nos lançamentos antigos ficam pra sempre; excluir a única
  subcategoria devolve o pai pra lista; e o gasto de uma subcategoria excluída continua somando no
  pai na Análise. O histórico não muda de forma quando a pessoa reorganiza o presente.
- **A Vic também respeita a regra** (`[D12]`): a lista de categorias que vai pro modelo no
  WhatsApp agora exclui as que viraram agrupamento (`selectableCategoryOptions`, cópia da regra
  do app porque Cloud Functions não importa `src/`). O filtro entra na montagem da lista, então
  cobre o prompt e a resolução do id de uma vez. **Deployado** (`whatsappWebhook`), com o
  `--no-cpu-throttling` reaplicado depois, como manda o `docs/RUNBOOK.md`.
- **Tutorial ao entrar na tela** (pedido do dono): 5 slides no `SlideTour` — o que é categoria,
  o que é subcategoria, **o que muda quando ela vira agrupamento** (o único efeito da tela que
  aparece em OUTRA tela: a principal some da lista na hora de lançar), como isso aparece na
  Análise, e onde ficam os dois botões de criar. Abre sozinho na primeira visita e volta pelo
  botão "Como funciona". O texto fixo do topo encolheu pra não dizer a mesma coisa duas vezes.
- 496 testes do app + 117 das functions verdes.

## 2026-07-29 (parte 9) — fix(whatsapp): pedido sobre CATEGORIA caía na mensagem de "editar lançamento"

Achado nos logs do deploy da parte 8: uma mensagem real do dono, `"Vic exclua uma categoria pra mim"`, foi classificada `out_of_scope` com `suggestedScreen: "transacoes"` — e a resposta falava de **"editar, corrigir ou excluir um lançamento"**. Destino certo, texto errado.

- **Causa**: o enum `OutOfScopeScreen` não tinha valor pra categoria, e o prompt não tinha regra pra esse pedido. O modelo chutou `transacoes` (o mais próximo) e caiu num texto que responde outra coisa.
- **Novo valor `categorias`**, sincronizado nos **três** pontos que o compilador não cobre sozinho: o tipo, a lista `validScreens` (valor fora dela cai calado em `geral`) e a linha do schema no prompt. Mais uma regra de classificação distinguindo "mudar a categoria de um lançamento" (→ `transacoes`) de "mexer na categoria em si" (→ `categorias`).
- **A mensagem ensina o caminho, não só a aba** — este é o único caso que precisa disso, porque **não existe tela "Categorias"**: editar/excluir vive dentro do seletor (`CategoryField`), atrás do botão "Editar categorias". Mandar só "vai em Transações" faria a pessoa chegar lá e não achar nada. O texto também lembra que **criar** categoria a Vic faz por mensagem.
- **Trava verificada**: o `switch` de `outOfScopeMessage` não tem `default`, então valor novo sem mensagem quebra o build — confirmado removendo o `case` e vendo o `tsc` falhar (TS2366).
- 112 testes das functions + 452 do app verdes. Deployado.

## 2026-07-29 (parte 8) — fix(vic): a Vic do WhatsApp estava presa nos 36 ícones e 12 cores antigos

Pergunta do dono depois das partes 6 e 7 ("veja como a Vic responde a isso, pois sei que ela cria categorias também") — e era um **quarto ponto de sincronia** que ninguém tinha lembrado.

- **O problema**: Cloud Functions não importa `src/` do app, então `functions/src/whatsapp/categoryPalette.ts` é uma cópia manual dos ícones e cores. Ela ficou em **36 ícones / 12 cores** enquanto o app foi pra 122 / 24. A cópia alimenta **três** pontos do caminho da Vic: o prompt que lista as chaves válidas (`interpretMessage`), a validação da resposta do modelo, e a gravação (`createCategoryFromMessage`). Resultado: categoria criada pela Vic saía com o conjunto antigo — **em silêncio**, porque nada falha, só degrada. Mesma família dos incidentes de enum do `CLAUDE.md`.
- **Espelho atualizado** pros 122 ícones e 24 cores, gerado a partir dos arquivos do app (não digitado à mão). Custo medido antes de decidir: a lista de ícones vai no prompt de toda mensagem do WhatsApp, +671 chars (~168 tokens) — centavos por ano na DeepSeek, então valeu incluir tudo em vez de curar um subconjunto.
- **Trava anti-drift nova**: `src/theme/categoryPaletteSync.test.ts` compara o espelho com a fonte do app (ícones, cores e cor padrão, ordem inclusa — a ordem das cores importa porque a cor de categoria nova sai por rotação no índice) e roda no `npm test`. **Verificado que falha de verdade**: removi uma chave do espelho e o teste quebrou.
- **A Vic do app não é afetada** — ela é 100% consultiva (regra 15 do prompt: não cria, edita nem exclui nada). Só o WhatsApp cria categoria.
- ⚠️ **Pendente de deploy**: `git push` não reimplanta Cloud Functions. Enquanto `whatsappWebhook` não for reimplantado, a Vic continua com o conjunto antigo em produção.

## 2026-07-29 (parte 7) — design(categorias): paleta em ordem de cor + folha própria pra escolher ícone

Dois acertos pedidos pelo dono depois de ver a parte 6 no celular.

- **A paleta não estava ordenada de verdade** — as 12 cores novas foram só acrescentadas no fim, então a grade lia como mosaico. Agora percorre o círculo cromático (vermelho → laranja → amarelo → verde → azul → roxo → rosa) e fecha nos neutros. Isso exigiu **separar as duas responsabilidades do array**: `categoryColors` é a ordem de exibição (livre pra reordenar) e a nova `hashPaletteColors` (privada, congelada nas 12 originais) alimenta o sorteio de `resolveCategoryColor` — sem essa separação, reordenar a paleta repintaria toda categoria sem cor escolhida.
- **Escolher ícone virou uma folha dedicada** ("Escolher ícone", com a contagem no subtítulo); o formulário voltou a ter uma linha `.select-row` mostrando o ícone atual e o grupo dele. Duas tentativas anteriores falharam pelo mesmo motivo — **esconder conteúdo**: primeiro uma grade rolável dentro do sheet (rolagem dentro de rolagem não revela o tamanho do conteúdo: "não dá pra saber se tem ou não"), depois um trilho de chips por grupo (dependia da pessoa adivinhar que dava pra arrastar de lado, aposta ruim numa tela que se abre raramente). Numa folha própria, os 122 ícones vivem numa rolagem só, com rótulo de grupo `sticky`.
- Verificado ao vivo em 375px: paleta em degradê, folha abrindo com "122 ícones", grupos com rótulo grudando no topo, e selecionar um ícone de Transporte fechando a folha e atualizando preview e rótulo da linha. `typecheck` + `test` (449) + `build` verdes.

## 2026-07-29 (parte 6) — feat(categorias): 24 cores, 122 ícones agrupados, e as embutidas voltaram a ser excluíveis

Pedido do dono (mais cor e mais ícone) somado a dois bugs relatados no mesmo fôlego.

- **Cores: 12 → 24** (`categoryColors`, `palette.ts`), ordenadas como espectro pra grade virar degradê navegável. As 12 originais **não mudaram de posição** de propósito: `resolveCategoryColor` faz hash sobre esse array pra colorir categoria sem cor escolhida, então reordenar trocaria a cor de categorias que já existem.
- **Ícones: 36 → 122**, agora em **11 grupos temáticos** (`categoryIconGroups` — fonte única, o mapa plano `categoryIcons` é derivado dela, impossível dessincronizar). Grade plana com 122 itens viraria rolagem cega; cada grupo tem rótulo sticky e a rolagem vive no contêiner. **Nenhuma chave antiga foi renomeada ou removida** (conferido por diff contra o HEAD: 36 chaves antigas, 0 perdidas, 0 duplicadas entre grupos) — chave de ícone fica gravada em `Category.icon`, mudá-la apagaria o ícone de categorias existentes.
- **Bug visual corrigido**: no modo "Editar categorias", lápis e lixeira eram dois ícones absolutos ancorados no **mesmo canto** do tile (`0.4rem` vs `-0.35rem`) e se sobrepunham. A lixeira saiu do tile; excluir vive no formulário de edição — que é onde já deveria estar, já que o sistema não põe ação destrutiva a um toque em lista rolável.
- **Categorias embutidas voltaram a ser excluíveis**: `isDefault` bloqueava a exclusão sem explicar por quê, e a pessoa ficava com categorias que nunca usa entupindo a lista. Agora todas podem ser excluídas, **com confirmação que diz a consequência** (antes a exclusão era um toque só, sem confirmação nenhuma). Seguro: a exclusão é lógica e `ensureDefaultCategories` não recria a categoria, porque o documento continua existindo.
- **`resolveCategoryColor` estava duplicada** em `palette.ts` e `categoryIcons.tsx` — apesar do comentário na primeira dizer "fonte única". Agora `categoryIcons` reexporta a de `palette`.
- **`firestore.rules` não muda**: `icon` e `color` são validados como string de até 40 chars (`validOptionalString`), não como enum — conferido antes de crescer as listas, conforme a REGRA PRINCIPAL do `CLAUDE.md`.
- Verificado ao vivo em 375px: paleta de 24 em 4 linhas, grupos de ícone rolando com rótulo, tile sem sobreposição, "Excluir categoria" presente em Alimentação (embutida), confirmação explicando a consequência e cancelar mantendo o formulário aberto. `typecheck` + `test` (449) + `build` verdes.

## 2026-07-29 (parte 5) — fix(ux): o "Salvando…" parou de piscar a cada lançamento

O dono notou o badge aparecendo ao salvar uma transação. Causa: `SyncStatusBadge` reflete `metadata.hasPendingWrites` — a escrita está no cache local mas o servidor ainda não confirmou. Como o app é fire-and-forget por regra, a linha aparece na lista **antes** do ack; online isso dura frações de segundo, então o aviso só piscava, bem no instante em que a UI deveria transmitir confiança.

- **Não foi removido, foi atrasado**: o aviso de `pending` só entra na tela depois de **1,2s**. Online ninguém vê; offline ou em rede ruim ele aparece e fica até sincronizar, que é quando é legítimo. `failed` continua imediato — erro não se esconde.
- **Por que não apagar de vez**: o badge é usado em 10 pontos (Transações, Contas, Metas, Cartões, Contas a Pagar/Receber, Dashboard) e é o **único sinal visível** de "isto ainda não está no servidor". Num app cujo padrão offline-first engole o erro de propósito — e que já teve duas features quebradas em silêncio por semanas por causa disso — remover o indicador de sincronia anda na direção contrária do aprendizado.
- 5 testes novos (`SyncStatusBadge.test.tsx`, com timer falso): segura antes do prazo, mostra depois, cancela se sincronizar antes, e falha aparece na hora. `typecheck` + `test` (449) + `build` verdes. 100% client-side.

## 2026-07-29 (parte 4) — feat(transações): o cabeçalho do dia virou SALDO, não resumo de gasto

Decisão do dono, olhando o resultado da parte 3: **qualquer** resumo de fluxo esbarra em "o que conta como gasto?". No dia 23, com dois pagamentos de fatura (R$ 1.000) mais uma compra de tênis no cartão (R$ 1.000), nem "gasto R$ 1.000" nem "gasto R$ 2.000" respondiam bem — a pergunta é que estava errada. Agora o cabeçalho mostra o **saldo no fim daquele dia**: mesma pergunta todo dia, resposta que não depende da natureza do lançamento, e lido de cima pra baixo vira a trajetória do dinheiro ("nesse dia eu tinha tanto").

- **`balanceByDayEnd`** (`financeCalculations.ts`, substitui `dayFlowTotals`): parte do `currentTotalBalance` — a **mesma fonte** do "Saldo total" do Dashboard — e anda pra trás desfazendo o efeito de cada lançamento via `transactionAccountEffects`. Ao chegar no primeiro lançamento de um dia, tudo mais recente já foi desfeito, então o acumulado é o saldo no fim daquele dia. Só é correto porque a lista é contígua e ordenada do mais recente pro mais antigo; ignora efeito em conta que não existe mais, igual `calculateAccountBalances`.
- **Sai da lista SEM filtro** (`activeTransactions`): saldo é fato do dia, não do filtro — "Despesas" não pode mudar quanto a pessoa tinha. Por isso também deixou de sumir na busca, o que era obrigatório enquanto era um total.
- **Compra no cartão não mexe no saldo; pagamento de fatura mexe** — é a realidade (comprar fiado não tira do banco), e é o que desfaz a ambiguidade original. Efeito colateral esperado: dois dias seguidos podem mostrar o mesmo saldo, quando no dia só houve compra no cartão.
- **Rótulo "saldo do dia"**, único em todos os dias. Uma versão intermediária alternava "saldo agora" (hoje) e "no fim do dia" (passado) pra deixar claro que não é o saldo atual da pessoa — descartada pelo dono: dois rótulos pro mesmo número confundem mais do que resolvem. O texto "saldo no fim do dia" foi tentado e **não cabe**: medido no cabeçalho real, faltavam 6px a 375px com data de outro ano e valor de 6 dígitos.
- Verificado ao vivo em 375px contra o banco: o cabeçalho do dia mais recente mostra **R$ 4.001,44**, exatamente a soma de `currentBalanceCents` que o Dashboard usa; o dia 23 fecha em R$ 4.000,00 com os R$ 15.500 de compras no cartão do dia 24 sem mover nada. 6 testes novos; `typecheck` + `test` (444) + `build` verdes. 100% client-side.

## 2026-07-29 (parte 3) — design(transações): o resumo do dia parou de mentir e de se disfarçar de transação

Passada de `/frontend-design` na tela de Transações (mobile), a partir de um incômodo do dono com o total por dia. A avaliação achou que o número não era só barulhento — **estava errado em dois sentidos**:

1. **Contradizia as linhas logo abaixo dele.** O cálculo só contava `income`/`expense`/`card_purchase`; `adjustment`, `refund` e `reimbursement` ficavam de fora. Um dia com `+R$ 1,44`, `−R$ 1,44`, `+R$ 1,44` na tela exibia **"−R$ 1,44"** no cabeçalho. Somar com o dedo não fechava.
2. **`adjustment`/`refund`/`reimbursement` apareciam pretos e sem sinal** nas linhas, sem dar pra saber se creditavam ou debitavam.

E, como design: o total era **vermelho peso 800**, igual ao valor de cada linha, empilhado logo acima dele — o resumo se disfarçava de transação. Pior, como todo dia tem gasto, o vermelho era constante e portanto não informava nada.

- **`transactionFlowByType` + `dayFlowTotals`** (`financeCalculations.ts`, novos): classificam cada tipo em `spent`/`received`/`internal`, com a direção derivada da mesma leitura que `transactionAccountEffects` usa pra mover o saldo — não de uma regra paralela. `card_payment` e `transfer` são **internos** (contar o pagamento da fatura somaria de novo a compra já contada no dia dela). `satisfies Record<TransactionType, …>` faz um tipo novo no enum sem entrada aqui virar **erro de compilação**.
- **Resumo rotulado**: "gasto R$ 27,26" (`--text-secondary`, peso 700, rótulo micro em maiúscula) em vez de um número cru; "recebido" em verde quando o dia entrou mais do que saiu. Compra parcelada conta pelo **valor cheio** (decisão do dono — foi o que se comprometeu naquele dia).
- **Linha colorida entra na conta, linha neutra não**: transferência e pagamento de fatura ficam neutros e fora do total; ajuste/estorno/reembolso passam a verde com `+`.
- Verificado ao vivo em 375px: o dia que exibia "−R$ 1,44" agora mostra "recebido R$ 2,88" e bate com as linhas; um dia com dois pagamentos de fatura + uma compra de R$ 1.000 mostra "gasto R$ 1.000,00", igual à única linha vermelha. 6 testes novos; `typecheck` + `test` (444) + `build` verdes. 100% client-side. Regras visuais registradas em `docs/design/DESIGN.md`.

## 2026-07-29 (parte 2) — fix: a ordem do dia agora vale de verdade (o meio-dia de enfeite era a causa real)

O fix da parte 1 (abaixo) resolvia só empate exato — e **não corrigia o caso do dono**. Investigando os dados reais dele (script somente leitura), apareceu a causa de verdade: **o app grava data de duas formas diferentes** e ninguém tinha percebido.

- **Formulário do app** → `date` = **12:00:00** fixo (`fromDateInputValue`), hora sem significado nenhum.
- **WhatsApp/Vic ao vivo** → `date` = o **instante real** da mensagem.

Num dia que mistura as duas origens, o meio-dia de enfeite compete com hora de verdade e a ordem sai errada — não por empate, mas por horas diferentes pelo motivo errado. Caso real de 25/07: "Fotos no shopping" foi lançada às **20:41** pelo app e caía **atrás** de três despesas do WhatsApp das 12:16/13:45/14:08. Dos 7 dias com 2+ lançamentos na conta do dono, **4 eram mistos** (23, 24, 25 e 28/07) e nenhum era corrigido pela parte 1.

- **`compareByDateDesc` refeito em dois níveis**: primeiro o **dia** do `date`, só depois o instante dentro do dia. O dia precisa mandar sozinho porque a lista é agrupada por dia percorrendo a ordenação — sem isso, um lançamento retroativo (cujo `createdAt` é de outro dia) saltaria pra fora do seu grupo e o **mesmo cabeçalho de dia apareceria duas vezes** na tela. Dentro do dia vale a hora real do `date`; quando ela é o sentinela meio-dia, vale o `createdAt`.
- **`fromDateInputValueForWrite`** (novo): lançar com data = **hoje** passa a gravar a hora real, mesma convenção que o WhatsApp já usava — sem campo novo pra preencher. Data passada continua no meio-dia (não dá pra inventar hora que ninguém informou) e cai no desempate por `createdAt`.
- **`resolveEditedDate`** (novo): editar um lançamento sem mexer no dia **preserva o timestamp original** — antes, editar a descrição de uma despesa vinda do WhatsApp reancorava ela no meio-dia, apagando a hora real e jogando ela pra outro lugar da lista.
- Decisão do dono: lançamento retroativo (sem hora real) fica **no topo do seu dia**, na ordem em que foi digitado.
- **Verificado contra os dados reais de produção** rodando a função de verdade sobre a conta do dono: 25/07 corrigido, e **0 cabeçalhos de dia repetidos** em 13 grupos. Confirmado no dev server que lançamento novo grava a hora real (`15:14:36`, não `12:00`). 10 testes novos em `financeDates.test.ts`; `typecheck` + `test` (438) + `build` verdes. 100% client-side.
- De brinde, achado no caminho: `scripts/dumpTransactionsForOwner.mjs` tinha `arthurzika3@gmail.com` (a conta do Claude Code, que não existe no banco) como email padrão — respondia "Dono não encontrado" e parecia quebrado. Corrigido pra `a.thurcos@gmail.com`, a conta real do dono em produção.

## 2026-07-29 — fix(transações): ordem dentro do mesmo dia respeita a hora real do lançamento

O dono notou: gasto de R$16 lançado primeiro, R$10 lançado depois — mas o de R$10 aparecia embaixo. Causa: `Transaction.date` só grava o **dia** (o formulário sempre grava meio-dia, `fromDateInputValue`), então duas transações do mesmo dia empatam nesse campo e a ordem exibida virava a ordem arbitrária de chegada do snapshot do Firestore, não a ordem real do lançamento.

- Novo `compareByDateDesc` (`financeDates.ts`): ordena por `date` desc, desempatando por `createdAt` (hora real do registro, já gravado em toda transação) quando a data é igual.
- Aplicado no Extrato (`TransactionsPage.tsx`) e nas "transações recentes" do Dashboard (`financeCalculations.ts`), que tinha o mesmo bug pelo mesmo motivo.
- Verificado ao vivo na conta de teste: lançou A e depois B no mesmo dia — B passou a aparecer acima de A. `typecheck` + `test` (260 de `src/finance`) + `build` verdes. 100% client-side, sem mudança em regras/functions.
- **Insuficiente** — ver a parte 2 acima, que achou a causa real.

## 2026-07-28 — análise: categoria com orçamento mostra os DOIS % (fatia do total + % do limite)

Refinamento do anterior, a pedido do dono: em vez de trocar um % pelo outro, a linha de uma categoria orçada mostra **os dois** — a **fatia do total** (cinza, junto do valor, contexto do donut) e o **% do limite usado** ("63% lim.", colorido pelo status, junto da barra de progresso). Cada número no seu contexto, sem apertar a linha. Só `SearchPage.tsx`. Verificado ao vivo.

## 2026-07-28 — fix(análise): categoria com orçamento mostra % do LIMITE, não a fatia do total

O dono achou confuso: limite de R$100 em "Guloseimas", gastou R$62, e a Análise dizia "5%". Aquele 5% era a fatia da categoria no gasto **total** (62/1394), não o quanto do **limite** foi usado. Agora, quando a categoria tem orçamento, o % mostra "quanto do limite já usei" (62,86/100 = **63%**), em negrito e colorido pelo status (verde < 80%, âmbar 80-99%, vermelho ≥ 100%) — casando com a barra de limite. Sem orçamento, segue mostrando a fatia do total (contexto do donut) em cinza. Só `SearchPage.tsx`. Verificado ao vivo.

## 2026-07-28 — perf(análise): donut de categorias refeito em SVG puro (fim do travamento no celular)

O donut "Por categoria" era Recharts (`PieChart`) dentro de `ResponsiveContainer` — a animação de "formação" em JS + o ResizeObserver do container demoravam pra carregar e engasgavam no celular (relatado pelo dono). Refeito em **SVG puro** (arcos via `stroke-dasharray`): render instantâneo, sem ResizeObserver, com entrada suave em CSS (fade+scale, GPU, respeita `prefers-reduced-motion`) no lugar do sweep em JS.

- Mantém tudo: clique pra selecionar categoria, esmaecer as outras, label central (categoria/total).
- Removidos os imports Recharts do donut (`PieChart`/`Pie`/`Cell`) e o `DonutTooltip` morto; as barras do histórico mensal seguem em Recharts.
- Só `SearchPage.tsx` + `global.css`. Verificado ao vivo (mobile, multi-categoria). `test` (428) + `build` verdes.

## 2026-07-28 — fix: parcelada excluída também some de "Compras parceladas em andamento"

Continuação do fix de exclusão anterior (que cobriu o donut/categorias via `signedCharge`). O card "Compras parceladas em andamento" da Análise usa outra função — `ongoingInstallmentPurchases` — que somava as parcelas `purchase` do ledger e **ignorava o `purchase_reversal`**. Resultado: uma parcelada errada excluída continuava aparecendo enquanto a fatura daquele mês tivesse outra parcela mantendo o saldo devedor > 0 (o único caso que sumia era a fatura zerar por completo). Achado pelo dono ("as que coloquei errado e excluí vão continuar?"). Confirmado nos dados reais dele: **5 parceladas excluídas** ainda lingering (Mercado Livre, Dr Consulta, Game, 2× Limite convertido), cada uma com a versão recadastrada certa ao lado.

- `ongoingInstallmentPurchases`: uma compra com qualquer estorno (`purchase_reversal`/`anticipation_credit_reversal` — só existem por exclusão) é marcada como removida e não aparece. A recadastrada certa tem `sourceTransactionId` novo, sem estorno, então continua normalmente.
- Teste de regressão (excluída some, recadastrada fica). `test` (428) + `build` verdes. 100% client-side.

## 2026-07-28 — design(análise): cards de "Recorrentes previstas" e "Parcelas em andamento" no sistema Sol

Passada visual nos dois cards de lista da Análise, pra ficarem no nível do resto do app — reusando componentes existentes, sem inventar padrão novo:
- **Total no cabeçalho** das recorrências previstas (badge com a soma prevista do mês) — o card não tinha âncora de valor.
- **Chip de ícone colorido por categoria** (`CategoryMark`, o mesmo das transações do Dashboard) em cada linha dos dois cards (`list-row--with-icon`): a categoria vira reconhecível de relance em vez de só texto. Parcelas resolvem a categoria da compra via `txnCategoryById`.
- O expansor "Ver todas as N recorrências" já existente segue funcionando. Só `SearchPage.tsx`. Verificado ao vivo (mobile), `typecheck`/`test` (427)/`build` verdes.

## 2026-07-28 — fix: compra de cartão excluída some da Análise + expansor nas recorrências previstas

Bug (achado pelo dono): uma compra no cartão excluída continuava aparecendo na Análise pra sempre. Causa: `signedCharge` (`spendingAnalysis.ts`) não reconhecia os lançamentos de estorno que a Cloud Function `reverseCardPurchaseOnDelete` cria ao excluir — `purchase_reversal` (crédito) e `anticipation_credit_reversal` (débito) — então o estorno não abatia a compra. Mesma classe de drift de enum que o `CLAUDE.md` marca como o bug nº 1 do projeto (3ª ocorrência). Planejado com `/plan-eng-review`, revisado com `/code-review`.

- **`signedCharge`**: `purchase_reversal` → crédito (−), `anticipation_credit_reversal` → débito (+). `isSinglePurchaseLedgerEntry` passou a ignorar também o `purchase_reversal` de compra **à vista** — senão, no regime de competência, excluir uma à vista deixava um crédito fantasma no mês da fatura (a compra some pela transação, mas o estorno continuava pesando no ledger).
- **`calculateInvoice.ts`** (mirror client): fechado o gap gêmeo — `anticipation_credit_reversal` faltava lá também (divergia de `invoiceTotals.ts`, a fonte da verdade da Cloud Function).
- **Trava anti-regressão**: teste que percorre os 15 tipos de ledger e garante que `signedCharge` e `calculateInvoice` concordam; a lista de tipos é **exaustiva por construção** (`satisfies Record<InvoiceLedgerEntryType, true>` → um tipo novo no enum sem entrar na lista vira erro de compilação). Mais 3 testes de regressão das exclusões (parcelada, à vista sem fantasma, antecipada).
- **Expansor** na lista "Contas recorrentes previstas" da Análise: colapsa em 5 com "Ver todas as N recorrências", espelhando o expansor de categorias.
- `typecheck` + `test` (427) + `build` verdes. 100% client-side (sem deploy de regras/functions). Detalhe em `docs/history/2026-07.md`.

## 2026-07-28 — feat: Análise em regime de competência (compra à vista no cartão conta no mês da compra)

O dono notou que gastos à vista no cartão feitos em julho apareciam só na Análise de agosto. Não era bug: a Análise usava **regime de caixa** (gasto do cartão pelo mês da fatura). Como o cartão dele **fecha dia 2**, quase tudo caía na fatura do mês seguinte — um atraso sistemático de ~1 mês entre "quando gastei" e "onde aparece". Decisão do dono: mudar pra **regime de competência**.

- **`spendingAnalysis.ts`**: compra **à vista** no cartão passa a contar pela **data da compra** (via a transação `card_purchase`, no `cashMonth`), como uma despesa comum. Compra **parcelada** continua 1 parcela por fatura (pelo ledger). Tarifas/juros/IOF/estorno/antecipação seguem pela fatura. Novo `installmentPurchaseIds(invoices)` separa à vista de parcelado de forma robusta (por `installmentTotal > 1` **ou** ocorrência do mesmo `sourceTransactionId` em >1 fatura — cobre dado antigo sem o campo). Sem dupla contagem: à vista entra só pela transação; a parcela única no ledger é ignorada.
- Propaga pra tudo que usa `spendingByCategoryForMonth`/`monthlyTotals`: donut e histórico da Análise, tendência por categoria, orçamentos, Resumo Anual e "Resumo de gastos" do Dashboard. Trade-off aceito: a Análise deixa de bater 1:1 com a fatura no mês corrente (é sobre comportamento de gasto, não sobre o extrato).
- Verificado nos dados reais do dono: R$ 1.103,18 em compras à vista de julho (Fatura, Cinema, 2×99) migraram de agosto pra julho — exatamente o valor inteiro da fatura de agosto. 4 testes de regressão novos (inclui o caso real: 99 de 26/07 → conta em julho, não agosto). `typecheck` + `test` (409) + `build` verdes.
- Detalhe e a discussão conceitual em `docs/history/2026-07.md`.

## 2026-07-28 — feat: "Acertar saldo com o banco" (+ auditoria da divergência fixa de 1,44)

O dono relatava uma diferença **fixa de R$ 1,44** entre o saldo do app e o do banco, corrigida sempre na mão com uma receita de ajuste. Code review completo do pipeline de dinheiro (efeitos de saldo, edição/exclusão, parcelas, totais de fatura, antecipação, parse, porta do WhatsApp) + diagnóstico com script só-leitura (`scripts/reconcileAccountBalances.mjs`): **0 divergência interna em 6 contas** — o `currentBalanceCents` bate exatamente com `abertura + soma dos lançamentos`. Conclusão: **não é bug de cálculo**; o 1,44 é externo (mais provável: rendimento automático do Nubank, que credita centavos que ninguém lança).

Em vez de mexer em código correto, virou uma feature que automatiza o costume do dono:
- **`reconcileAccountBalance`** (`financeService.ts`): leva a conta ao saldo real informado criando UM lançamento de acerto pela diferença. Direção vem do **tipo** (a regra exige `amountCents >= 0`): banco maior → `adjustment` (credita), banco menor → `expense` (debita). Sem diferença, não grava nada. Fire-and-forget, offline-first. **Sem mudança em `firestore.rules`** (os tipos já eram aceitos).
- **`AccountReconcileSheet`** (novo, `src/finance/`): sheet na tela de Contas (ícone balança em cada card) com prévia ao vivo — digita o saldo do banco e vê a diferença exata + o que vai acontecer, antes de confirmar. Estilos `.reconcile-diff`/`.reconcile-current` (só tokens, tema-aware).
- Verificado ao vivo no navegador (conta de teste): +1,44 levou o saldo de 4.000,00 → 4.001,44 com a mensagem de acerto; direções crédito/débito/"já bate" conferidas; 0 erro no console.
- Testes: `reconcileAccountBalance` (crédito/débito/no-op) — 405 cliente verdes. `typecheck` + `build` ok.
- Detalhe e a auditoria completa em `docs/history/2026-07.md`.

## 2026-07-28 — Vic: WhatsApp redireciona toda pergunta pro app, Vic vê a Projeção, prompt atualizado, WhatsApp ganha data retroativa

Rodada de trabalho na Vic (tudo em functions, deployado):
- **WhatsApp não responde mais pergunta nenhuma** (geral ou sobre os dados) — redireciona pra Vic do app, que tem histórico de conversa e continua o papo. O WhatsApp fica só pra lançar. `answerFinancialQuestion.ts` deletado; `question` agora vira `questionRedirectMessage()` no handler. As perguntas amplas/decisões já iam pro app; agora as rápidas também.
- **Data retroativa no WhatsApp**: "gastei 40 no mercado dia 20" / "ontem" / "20/07" registra na data citada (ao meio-dia BRT). `interpretMessage` extrai `occurredOn` (validado <= hoje); `webhookHandler` usa em todos os lançamentos, inclusive após o "qual cartão/conta?" (guardado em `pendingAction.occurredOnISO`). Sem data citada, continua sendo hoje.
- **Vic do app vê a Projeção do próximo mês**: `buildFinancialContext` ganhou a seção PROJEÇÃO (salário previsto + sobra/rombo), lida do `users/{uid}`.
- **Prompt da Vic do app atualizado** ao modelo novo: fora Disponível/"livre para gastar"/"modo de cálculo/data-limite"; COMPROMETIDO descrito como contas fixas + fatura do ciclo atual.
- `typecheck` + `test` (112 functions, +3) verdes. Detalhe em `docs/ai/VIC.md` e `docs/whatsapp/WHATSAPP.md`.

## 2026-07-28 — fix: Comprometido conta só o ciclo atual da fatura, não todas as parcelas futuras

Correção de requisito do dono logo após o refactor abaixo: "o comprometido não é faturas no plural, é apenas em aberto e a que está pra ser paga, não todas que existem". O modelo anterior somava **todas** as faturas com saldo devedor — o que fazia uma compra parcelada em 10x jogar os R$3.000 inteiros no Comprometido de uma vez (10 faturas de R$300). Agora, **por cartão**, conta as `closed`/`overdue`/`partial` (já "pra pagar") + só a `open` de vencimento mais próximo (o ciclo que acumula agora); as faturas `open` de meses futuros ficam de fora até chegarem.

- `financeCalculations.ts`: novo helper `selectCurrentCycleInvoices` (agrupa por cartão, mantém as fechadas + a aberta mais próxima). `buildFinancialContext.ts` (Vic/WhatsApp) espelha a mesma regra.
- Testes novos: "10x não soma todas de uma vez — só a parcela do ciclo atual" (cliente + functions); cartões diferentes contados independentemente. `test` (402 cliente + 109 functions) verde.
- Functions reimplantadas (`financialAssistantChat` + `whatsappWebhook`).

## 2026-07-27 — refactor: Comprometido simples ("conta tudo") + remove Disponível e o modo de recebimento

Decisão de produto do dono: o corte por data do Comprometido (dois modos, payday, janela de dias, data do salário) confundia todo mundo e era a raiz da pendência aberta. Voltou pro modelo simples **"recorrências/fixas + contas a pagar pendentes + faturas de cartão em aberto"**, sem corte por data. O **Disponível** foi removido (a Projeção do próximo mês já dá a visão de "quanto sobra"). Planejado e discutido em plan mode.

O ponto central — **não duplicar recorrência paga no cartão**: a recorrência sempre conta como linha (aparece antes de registrar), e a fatura conta só o que **não** é recorrência — a cobrança de recorrência já lançada no cartão é **descontada** do saldo devedor da fatura. Assim uma assinatura de R$120 no cartão mostra R$120 antes E depois de registrar, nunca R$240. Compra avulsa no cartão conta pela fatura normal; conta avulsa paga no cartão já era limpa (vira "paga", migra pra fatura).

- **Núcleo** (`financeCalculations.ts`): `buildUpcomingCommitments` sem `cutoff` — conta todas as recorrências ativas (cartão e conta) + bills pendentes + faturas em aberto `max(0, outstanding − cobranças-de-recorrência)`. Removidos `resolveCommittedCutoff`/`findNextIncomeDate`; `DashboardSummary` perdeu `freeToSpendCents`/`committedCutoff*`/`nextIncomeAt`. `calculateNextMonthProjection` usa o mesmo committed.
- **Marcação** (`cardService.ts`/`financeService.ts`): `recordRecurringPayment` passa a estampar `recurringId` na compra do cartão (via `addCardPurchaseToBatch`) — é o que habilita o desconto. `firestore.rules` já aceitava `recurringId` (sem mudança de regra; teste novo trava isso).
- **Removidos**: card Disponível, `AvailableModeSheet`, `PaydaySettingsPage` + rota/nav "Recebimento", o passo "Quando você recebe?" do onboarding (4→3 passos), `availableMode.ts`, `payday.ts`, campos de tipo/serviço (`payday`/`committedWindowDays`/`availableMode`). Mantidos `projectedSalaryCents`/projeção.
- **Vic/WhatsApp** (`buildFinancialContext.ts`): mesmo modelo (sem cutoff, com desconto de recorrência na fatura); `committedCutoff.ts` deletado. **Deployado** (`financialAssistantChat` + `whatsappWebhook`, codebase `billing`, só as duas pra não estourar quota do Cloud Run).
- **Layout do Dashboard** (`/frontend-design`, dentro do sistema Sol): com o Disponível fora, o resumo virou hero de largura cheia "Saldo total" (`--gradient-brand`) + Comprometido como barra-stat horizontal (rótulo/explicação à esquerda, valor à direita, acento âmbar). Verificado ao vivo desktop (1280) e mobile (375) sem overflow.
- **Sheet "Projeção do próximo mês"** (`/frontend-design`): a prévia ao vivo da sobra virou um chip que acende verde (`--success-soft`, ↗ "Sobra prevista") ou vermelho (`--danger-soft`, ↘ "Rombo previsto") com o valor em DM Sans 800, em vez de uma linha cinza; input com foco mais intencional (anel `--action-primary-soft`, "R$" em tangerina). Ambos os casos verificados ao vivo.
- **Fix: sheet da projeção cortava o conteúdo à esquerda** (bug pré-existente, achado pelo dono): o `<input>` de fonte gigante tem largura intrínseca de ~20 caracteres (~400px) e o `.projection-input-wrap` era um item de grid (`min-width: auto`) que não encolhia — estourava o corpo da sheet (335px) e era cortado por `overflow-x: hidden`. Resolvido com `min-width: 0` no wrap (o clássico destravamento de flex/grid). Verificado ao vivo (vazio e com valor grande, sem overflow).
- `typecheck`/`test` (400 cliente + 109 functions) verdes, `test:rules` (71) e `noHardcodedColors` verdes, `build` ok. Detalhe em `docs/history/2026-07.md`.

## 2026-07-27 — investigação: "até o próximo recebimento" tem corte errado quando conta vence depois do pagamento (sem código mudado)

Testando em produção a mudança de ontem, o dono viu Comprometido R$ 0,00 em "até o próximo recebimento" e um valor bem menor que o esperado no Conservador. Investigado ao vivo na conta real (script read-only, apagado depois): **achado real confirmado** — o corte de "até o próximo recebimento" é a data exata do próximo pagamento; como as contas do dono vencem alguns dias *depois* de receber (padrão comum, não é caso raro dele), nada cai antes do corte e o número zera. Não resolve só empurrar o corte pra mais paydays à frente — o mesmo atraso se repete todo ciclo. Precisa de redesenho, registrado em `docs/planning/TODOS.md`. O número "menor que o esperado" no Conservador, por outro lado, era **acurado** — o erro estava numa investigação minha com o caminho errado de subcoleção no Firestore (faturas ficam em `cards/{id}/invoices`, não `invoices` direto), corrigido e conferido bater exato com a tela. Detalhe completo, incluindo os dois erros de investigação e como foram corrigidos, em `docs/history/2026-07.md`.

## 2026-07-26 — fix: reverte default do Comprometido pra "até o recebimento" + corrige atraso de fixo no cartão

Sessão de design (`/office-hours`) com a dona, horas depois da mudança abaixo ("conservador" como default): investigando a fundo por que ela sentia que o Comprometido "nunca esvazia", achamos a causa técnica real — `conservative` usa uma **janela rolante** (`now + N dias`) que nunca esvazia de verdade, porque a ocorrência do mês seguinte de qualquer conta fixa mensal já entra na janela no instante em que a atual é paga. Isso trava o Disponível perto de zero/negativo pra qualquer pessoa sem reserva acima de ~1 mês de custo fixo — não é cálculo errado, é a mecânica da janela não combinando com a forma como as pessoas sentem alívio depois de pagar as contas. `until_payday` (o default antigo) não tem esse problema — o corte é uma data fixa, drena de verdade ao longo do ciclo. A rede de segurança que "conservador como default" tentava dar não se perde: `calculateNextMonthProjection` (Projeção do próximo mês) já força conservador sempre, isolado.

No mesmo mergulho, achamos um segundo problema real: fixo pago no cartão (Netflix, Cinemark etc.) contava como comprometido pela data da COBRANÇA (`nextOccurrenceAt`), não pela data real de vencimento da fatura que essa cobrança vai gerar — até ~1 mês adiantado. Mesma conta que compra avulsa no cartão já usa (`resolveInvoiceCycle`) agora também se aplica à recorrência.

- `defaultAvailableMode` (`availableMode.ts`): volta pra `'until_payday'`. Zero impacto pra quem nunca configurou recebimento (cai na mesma janela); só corrige quem já tem payday configurado.
- `buildUpcomingCommitments` (`financeCalculations.ts`): recorrência com `cardId` agora projeta o vencimento real via `resolveInvoiceCycle`, em vez de usar a data da cobrança direto. Recorrência paga por conta (`accountId`) não muda.
- `typecheck`/`test` (428, +4 novos) limpos, `build` ok. Verificado ao vivo: troca de modo em Configurações > Recebimento funciona, Dashboard renderiza sem regressão.
- Detalhe completo da investigação (incluindo o exemplo do Cinemark e por que não duplica) em `docs/history/2026-07.md`.

## 2026-07-26 — refactor: tira a escolha forçada de "Comprometido" (conservador vs. até o recebimento)

Pedido da dona (`/plan-ceo-review`): "esses dois ainda muito confuso... nenhum usuário está entendendo." O mini tutorial que forçava essa escolha no primeiro acesso ao Dashboard foi removido — agora todo mundo usa o modo **conservador** por padrão (mesma leitura que a Projeção do próximo mês já força sempre), sem perguntar nada. "Até o próximo recebimento" continua existindo, só que discreto em Configurações > Recebimento — ninguém que já escolheu explicitamente antes é afetado.

- `defaultAvailableMode` (`availableMode.ts`): `'until_payday'` → `'conservative'`.
- `DashboardPage.tsx`: removida a lógica de auto-abertura do tutorial (`shouldAutoOpenTutorial`, `hasChosenAvailableMode`, `tutorialDismissed`) — a sheet só abre por toque explícito (legenda de Disponível/Comprometido).
- `typecheck`/`test` (424) limpos, 3 testes que dependiam do default antigo atualizados. Verificado ao vivo: Dashboard e Configurações > Recebimento renderizam normal, sem regressão.

## 2026-07-25 — feat: card "Projeção do próximo mês" — salário previsto manual, isolado do saldo real

Pedido da dona: hoje, pra saber quanto vai sobrar no mês que vem, ela faz um "hack" (lança uma transação de receita falsa com o salário esperado só pra simular no Disponível). Feature nova substitui isso: ela declara um "salário previsto" (nunca 0, editável quando quiser) e o Dashboard mostra `sobra = salário previsto − Comprometido (modo conservador, forçado)`, sem tocar em transação, saldo ou Disponível reais nenhum. Planejado com `/plan-eng-review`.

Diferente da extinta "Fluxo de Caixa" (removida 2026-07-18 por especular receita futura pela MÉDIA histórica) — aqui o número é 100% declarado pela pessoa, nunca estimado; por isso o nome mudou, pra não confundir com a feature perigosa que foi apagada de propósito.

- Campo novo `projectedSalaryCents` no perfil (`users/{uid}`) — pessoal, nunca relacionado ao workspace do casal. `firestore.rules` valida `> 0` no servidor, não só no client.
- `calculateNextMonthProjection` (`financeCalculations.ts`) reaproveita `resolveCommittedCutoff`/`buildUpcomingCommitments` já existentes, sempre forçando modo conservador — ignora o `AvailableMode` real do perfil de propósito.
- Card novo no Dashboard + sheet pra editar/remover (`NextMonthProjectionSheet.tsx`), mesmo padrão de `AvailableModeSheet.tsx`.
- `npm run test:rules` (69/69), `typecheck`/`test` (421) limpos. Deploy de `firestore.rules` autorizado e feito; verificado ao vivo no navegador (definir, ver a sobra recalcular, editar, remover — Disponível/Comprometido reais nunca mudaram). Detalhe: `docs/history/2026-07.md`.

**Refinamentos no mesmo dia, pedido da dona:**
- **Visual** (`/frontend-design:frontend-design`): card sai do `surface surface-pad` genérico pra um tratamento próprio — borda tracejada (sinaliza "simulação", diferente do cartão sólido de Saldo/Disponível/Comprometido), ícone `Telescope` em círculo colorido (verde/vermelho conforme sobra/rombo), tira-fórmula com ícones (`Wallet`/`Scale`), CTA vazio convidativo. Sheet ganhou input grande (DM Sans 800, mesmo tratamento numérico do resto do app) e **prévia ao vivo** da sobra enquanto digita.
- **Toggle "contar meu saldo atual"**: campo novo `projectionIncludesBalance` (perfil) — opcional, desligado por padrão (comportamento que a dona já gostou, preservado). Quando ligado, soma o saldo total real (não é estimativa — dinheiro já confirmado hoje) na sobra prevista. `firestore.rules`: `onlyProjectedSalaryChanged` renomeada pra `onlyProjectionSettingsChanged`, cobrindo os dois campos. `test:rules` (70/70), `test` (423) limpos, verificado ao vivo (toggle liga/desliga, prévia soma certo, Disponível real nunca muda).

## 2026-07-25 — fix: Dashboard travava Saldo total/Resumo de gastos/Transações recentes esperando cartão sincronizar, mesmo sem precisar dele

Achado pelo dono: lançou transações pela Vic no WhatsApp com o app fechado, abriu o app depois e a tela inicial inteira (até o Saldo total) ficou presa na versão antiga até ele entrar na aba Transações. Causa: `DashboardPage.tsx` tinha uma única trava de cache (`isCommittedLoading` = finanças **e** cartões/faturas) decidindo quando trocar do cache local pro dado ao vivo — mas Saldo total, Resumo de gastos e Transações recentes (`calculateDashboardSummary`) nunca dependeram de cartão nenhum. Quando cartões/faturas demoram mais que finanças pra sincronizar (comum num boot frio), a tela inteira ficava refém do card mais lento. Corrigido com uma trava separada (`financeCache`, só `finance.loading`) pras três seções que não usam cartão; "Disponível"/"Comprometido"/"Próximos compromissos" continuam na trava combinada (genuinamente precisam de fatura). `npm run typecheck`/`test` (415) limpos, verificado ao vivo no navegador.

## 2026-07-25 — fix: Vic (app + WhatsApp) parada por descontinuação de modelo da DeepSeek; consolidação do intent `out_of_scope` no WhatsApp

- **Vic não respondia nem no app nem no WhatsApp**: a DeepSeek descontinuou o modelo `deepseek-chat` em 2026-07-24 15:59 UTC — toda chamada de IA passou a falhar com erro 400. Corrigido migrando pra `deepseek-v4-flash` (`deepseekClient.ts`). Achado só depois de investigar por que o WhatsApp não respondia (causa inicial suspeitada — recriação do número do bot na Meta — era real mas separada; corrigida antes, expôs o problema de verdade).
- **Bug de log encontrado no caminho**: `logger.error(str, { message: err.message })` do `firebase-functions` sempre sobrescreve `message` com um stack trace sintético — o erro real da DeepSeek estava sendo silenciosamente descartado dos logs. Corrigido em `webhookHandler.ts`/`metaClient.ts`.
- **WhatsApp: 4 intents negativos viram 1** (`advanced_card_action`/`unsupported_action`/`bill_management_action`/`advisory_decision` → `out_of_scope` + campo `suggestedScreen`) — o prompt do classificador só crescia a cada edge case novo descoberto, e qualquer pedido não enumerado caía no "não entendi" genérico mesmo quando o bot entendeu perfeitamente. Agora a lista do que a Vic FAZ é curta e estável; qualquer outro pedido claro vira redirecionamento pra tela certa do app. `question` também foi restringido a consulta pontual/autocontida — pergunta de análise mais aberta/comparativa agora redireciona pro app (aba Assistente, que guarda histórico) em vez de arriscar responder errado uma pergunta de acompanhamento.
- 124 testes (functions) passando, deploy feito e verificado ao vivo pelo WhatsApp real. Detalhe completo em `docs/history/2026-07.md`, `docs/whatsapp/WHATSAPP.md` e `docs/ai/VIC.md`.

## 2026-07-24 — chore: Patrimônio Líquido descontinuado — código removido

Desde 16/07 a feature estava desativada mas com o código intacto ("talvez no futuro faremos"). Decisão do dono hoje: descontinuar de vez, não é mais "talvez".

- Excluídos `src/pages/NetWorthPage.tsx`, `src/finance/netWorthCalculations.ts` e `netWorthCalculations.test.ts`.
- `src/App.tsx`: a rota `/app/net-worth` **continua existindo**, só como redirect pro Dashboard (link antigo salvo/favoritado não quebra) — comentário atualizado pra não sugerir mais que dá pra "religar".
- `src/layout/AppShell.tsx`: removidos os dois comentários-placeholder que marcavam onde os links de navegação ficariam se a feature voltasse.
- `docs/planning/TODOS.md`: removido o item "passo a passo pra religar" (não se aplica mais — não tem mais código pra religar); `docs/BUSCA_RAPIDA.md` também limpo dessa entrada.
- `npm run typecheck`, `npm test` (415) e `npm run build` limpos. Verificado ao vivo: `/app/net-worth` continua redirecionando pro Dashboard sem erro.

## 2026-07-24 — feat: aviso honesto quando Disponível/Comprometido podem estar desatualizados por falta de conexão

Continuação do fix de "Limite disponível ao vivo". Planejado com `/plan-eng-review` — cheguei a desenhar uma versão que escreve o ajuste otimista direto no documento da fatura (igual o saldo de conta já faz), mas `firestore.rules` **bloqueia isso de propósito** (`validInvoiceUpdate` exige que todos os totais da fatura permaneçam idênticos numa escrita do cliente — só a Cloud Function pode mudá-los). Forçar essa regra a abrir uma exceção replicaria a classificação débito/crédito/pagamento/tarifa numa 3ª linguagem (Rules), o oposto do que estávamos tentando evitar. Descartado por segurança.

- **Solução adotada, bem mais simples**: em vez de calcular o valor certo (exigiria carregar o ledger, custo que Dashboard/Cartões evitam de propósito), avisar quando ele pode estar errado. `hasPendingCardLedgerActivity()` (`financeCalculations.ts`) checa se existe uma transação `card_purchase`/`card_payment` com `localSyncStatus: 'pending'` em `finance.transactions` (já carregado no boot, zero leitura nova) — esse campo é o próprio Firestore dizendo "não cheguei no servidor ainda".
- Aviso novo em `DashboardPage.tsx` (perto de Disponível/Comprometido) e `CardsPage.tsx` (perto da lista): *"Uma compra no cartão ainda não sincronizou — conecte-se à internet para atualizar [...]"* — texto explícito pedindo conexão, não só "desatualizado".
- **Limite documentado**: crédito/tarifa lançados direto na fatura não criam transação (`addLedgerOnlyEntry`), ficam fora dessa detecção — ação rara, mesmo comportamento de hoje nesse caso raro, não uma regressão.
- **Bug próprio corrigido antes de commitar** (achado numa caçada por mais lugares que precisavam do mesmo aviso): a primeira versão excluía transações com `deletedAt` — o que também excluía, sem querer, o caso de **excluir** uma compra offline (`softDeleteTransaction` marca `deletedAt` via `batch.update`, igualmente `pending` até sincronizar, e é essa escrita que dispara a outra Cloud Function relevante, `reverseCardPurchaseOnDelete`). Removida a exclusão — o aviso agora cobre criar E excluir compra/pagamento offline.
- 8 testes em `financeCalculations.test.ts`. `npm run typecheck`, `npm test` (427) e `npm run build` limpos. Verificado ao vivo sem falso positivo (nada sincronizando, aviso não aparece); a reprodução exata do aviso aparecendo esbarrou numa limitação de teste (rede bloqueada no navegador não pega uma conexão de streaming já aberta do Firestore) — lógica coberta por teste determinístico em vez disso. 100% client-side, zero mudança de regra/function.

## 2026-07-24 — fix: "Limite disponível"/"Fatura atual" atualizam na hora após lançar compra no cartão (inclusive offline)

Planejado com `/plan-eng-review`. O dono notou que o limite demorava alguns segundos pra atualizar depois de lançar uma compra e perguntou se funcionava offline — não funcionava: o valor ficava congelado (errado) enquanto a compra não sincronizasse.

- **Causa**: os totais da fatura (`outstandingBalanceCents` e cia) só são recalculados por uma Cloud Function (`invoiceLedgerEntryTrigger.ts`) que roda **no servidor**, depois que a escrita chega lá — offline, ela nunca roda; online, ainda leva um round-trip real.
- **Achado que resolveu sem duplicar nada de novo**: essa Cloud Function é um "porto" documentado de `src/domain/invoices/calculateInvoice.ts` — o app **já tem** a mesma lógica pura, já tratada como fonte da verdade, só nunca usada pra exibir um total "ao vivo". `CardDetailPage`/`InvoicePage`/Análise já carregam o ledger inteiro do cartão via `useInvoiceLedger` quando abrem — o dado que faltava já estava na memória, sem leitura nova.
- **Fix** (`useInvoiceLedger.ts`): `mergeInvoicesWithLedger` passou a recalcular `outstandingBalanceCents`/`purchasesTotalCents`/etc. e `status` com `calculateInvoice()` sobre o ledger já carregado, em vez de confiar só no campo persistido. Um lugar só de mudança — as 3 telas que já chamam essa função (Cartão, Fatura, Análise) herdam o total ao vivo automaticamente. `CardDetailPage.tsx` ajustado pra usar essa versão em vez de `cardsData.invoices` cru.
- 4 testes de regressão novos em `useInvoiceLedger.test.tsx` (lançamento pendente reflete na hora mesmo com campo persistido em zero — simula offline/latência; não regride o caso já sincronizado; desconta pagamento pendente; não mistura lançamentos de outra fatura).
- `npm run typecheck`, `npm test` (420) e `npm run build` limpos. Verificado ao vivo: lançar uma compra de R$75,00 mostrou o novo total (R$125,00) **imediatamente** na tela do cartão, e continuou igual 4s depois quando a Cloud Function de verdade processou — sem divergência. 100% client-side, zero mudança de regra/function. **Fora do escopo, deliberado**: Dashboard "Disponível"/"Comprometido" continuam usando o total persistido (não carregam o ledger inteiro no boot, de propósito) — ver `docs/planning/TODOS.md`. Detalhe (por que a Cloud Function existe, por que duplicar do jeito ingênuo era arriscado, a decisão de usar ledger filtrado): `docs/history/2026-07.md`.

## 2026-07-24 — fix: rede lenta não volta a mostrar "sem dados" depois de 2,5s + mensagem honesta pra quem está offline de verdade

Continuação direta da auditoria offline-first de hoje: o dono perguntou "e se a rede for lenta (wifi ruim, 5G fraco), não em vez de offline?" — achado um buraco real que sobrevivia mesmo depois dos fixes anteriores.

- **Causa**: todos os hooks de dados (`useFinanceData`, `useCardsData`, `useMonthlyTransactions`, `useGoalsData`, `useGoalContributions`, `useSharedWorkspaceData`, `useCoupleSavings`) tinham um timeout de 2,5s que — se a resposta real não chegasse a tempo — forçava `loading: false` mesmo sem dado nenhum (em `useFinanceData.ts` isso chegava a injetar um array `[]` como se fosse resposta real). Numa rede genuinamente lenta (não offline — o retry do Firestore nunca desiste), isso fazia a tela voltar a mostrar "sem dados" depois de 2,5s, até a resposta atrasada finalmente chegar e corrigir sozinha.
- **Fix**: removido o timeout que forçava resolução falsa nos 7 hooks de assunto único acima — `loading` agora só resolve com uma resposta de verdade (sucesso ou erro), nunca por decurso de tempo. Os dois timeouts que agregam MÚLTIPLOS itens (`useCardsData.ts` fatura-por-cartão, `useInvoiceLedger.ts` lançamento-por-fatura) foram mantidos — eles não injetam dado falso, só evitam que UM item travado prenda os outros já resolvidos.
- **Mensagem honesta pra quem está genuinamente offline sem cache** (`src/finance/useIsOnline.ts`, novo + `LoadingState.tsx`): como o `loading` agora pode durar indefinidamente se não houver conexão nenhuma, um spinner "carregando" pra sempre seria desonesto pra quem abriu o app pela 1ª vez em modo avião. `LoadingState` passou a checar `navigator.onLine` e mostrar "Você está offline" em vez de fingir que os dados estão a caminho. Dado já cacheado antes continua aparecendo na hora, com ou sem rede — isso só afeta quem nunca teve nada cacheado.
- `SearchPage.tsx` teve seu `isOnline` local (duplicado) trocado pelo hook novo compartilhado.
- Teste de regressão atualizado em `useMonthlyTransactions.test.tsx` (comprovadamente falha com o comportamento antigo) + 4 testes novos em `LoadingState.test.tsx` (inclusive reação a evento `online`/`offline` em tempo real).
- `npm run typecheck`, `npm test` (416) e `npm run build` limpos. 100% client-side, zero mudança de regra/function. Detalhe (raciocínio completo, por que o timeout original existia, o que foi tentado e não deu certo pra testar offline no navegador): `docs/history/2026-07.md`.

## 2026-07-24 — fix: auditoria offline-first — 8 telas + fatura mostravam "sem dados" falso durante o carregamento

Auditoria completa pedida pelo dono depois dos incidentes de hoje ("queria ter certeza que funciona de verdade"). Confirmado: config do Firestore, escritas fire-and-forget e app-shell (Service Worker) já estavam corretos. Achado real: a mesma classe de bug corrigida hoje de manhã na Análise (mostrar "sem dados" em vez de "carregando" enquanto uma leitura sob demanda ainda está em voo) existia em mais 8 telas.

- **Componente novo** `src/components/LoadingState.tsx`: placeholder "Carregando seus dados…" reutilizável (mesma casca visual do `EmptyState`, pra não pular layout).
- **`useInvoiceLedger.ts` ganhou `loading`/`error`**: antes só devolvia o array de lançamentos, sem jeito de saber se ainda estava carregando — a Fatura não tinha como se corrigir sem isso. Retorno virou `{ entries, loading, error }`; os 3 consumidores (`SearchPage`, `CardDetailPage`, `InvoicePage`) e os 9 testes do hook atualizados. **Não adiciona nenhuma leitura nova** — mesmas assinaturas de sempre, só passou a rastrear se já resolveram (confirmado com diff linha a linha); a arquitetura de carregar o ledger só sob demanda (Cartão/Fatura/Análise abertos, nunca no boot) continua 100% intacta, documentada em `docs/COSTS.md`.
- **8 telas corrigidas** (mesmo padrão: checar `.loading` antes de decidir "vazio"): `TransactionsPage.tsx`, `ReceivablesPage.tsx`, `AccountsPage.tsx`, `BillsPage.tsx` (Recorrentes + Compromissos), `CardsPage.tsx`, `CardDetailPage.tsx`, `InvoicePage.tsx`, `SharedSpacePage.tsx`, `shared/CoupleSavingsSection.tsx`.
- `npm run typecheck`, `npm test` (412) e `npm run build` limpos. Verificado ao vivo: pegou o `LoadingState` real em ação em Contas (Nubank R$4.000,00 aparecendo depois de "Carregando…" em vez de "Nenhuma conta cadastrada" falso) e checado sem regressão em Transações, Contas a Pagar, Cartões, Cartão/Fatura individual, Espaço do Casal, Contas a Receber. 100% client-side, zero mudança de regra/function. Detalhe (o que foi auditado e confirmado OK, achados por arquivo, o que não deu pra testar): `docs/history/2026-07.md`.

## 2026-07-24 — fix: valor de "Contas recorrentes" cortado no card da Análise no mobile

Achado testando a tela de Análise em viewport mobile: o card "Contas recorrentes" (mês futuro) cortava valores como "~R$ 2.188,87" com reticências (`~R$ 2...`) numa coluna estreita de 2 colunas.

- `MetricCard` já tinha a prop `long` pra esse caso (usada em "Maior categoria") — reduz a fonte e quebra linha em vez de cortar. Só faltava aplicar em "Contas recorrentes". Uma linha.
- `npm run typecheck` e `npm test` (412) limpos. Verificado ao vivo em viewport mobile (375px).

## 2026-07-24 — fix: crash "FIRESTORE INTERNAL ASSERTION FAILED" em produção (persistência corrompida)

Achado ao vivo por relato de usuária: tela cheia "Algo deu errado" com um dump técnico do SDK do Firestore, travando o app até recarregar manualmente.

- **Causa**: `persistentMultipleTabManager` (config antiga do Firestore) coordena abas via chaves no `localStorage` (`firestore_clients_*`/`firestore_targets_*`) que só se limpam com um "fechar aba" limpo — coisa que um PWA no celular quase nunca faz (o sistema mata o app sem avisar). Essas chaves acumulavam pra sempre até estourar a quota do `localStorage`, e a partir daí o próprio SDK do Firestore trava com `INTERNAL ASSERTION FAILED: Unexpected state` (bug conhecido do `firebase-js-sdk`, issue 8305 no GitHub). Conecta com o RC3 do fix de boot/cache de mais cedo hoje, que já tinha achado o `localStorage` desse app perto da quota.
- **Fix da causa** (`src/firebase/config.ts`): trocado `persistentMultipleTabManager` por `persistentSingleTabManager` — elimina a coordenação via `localStorage` que causava o acúmulo. Custo: perde persistência offline numa segunda aba do MESMO navegador aberta ao mesmo tempo (não afeta uso em aparelhos diferentes, ex. celular + computador).
- **Rede de segurança pra quem já está com o `localStorage` sujo** (`src/firebase/firestoreRecovery.ts`, novo + `AppErrorBoundary.tsx`): reconhece esse erro específico, limpa o cache local corrompido (IndexedDB + chaves `firestore_*` do `localStorage`) e recarrega sozinho — sem exigir clique manual — com guarda de sessão pra nunca entrar em loop se o erro persistir. `userFacingError.ts` ganhou o fragmento técnico na lista de textos que nunca aparecem crus pro usuário.
- `npm run typecheck`, `npm test` (412) e `npm run build` limpos. 100% client-side, zero mudança de regra/function. Detalhe (issues do GitHub citadas, evidência da investigação): `docs/history/2026-07.md`.

## 2026-07-24 — fix: gráfico da Análise "não carregava" ao abrir (mesma causa do fix de boot/cache, tela diferente)

Achado via `/investigate` a partir de relato de usuárias ("o gráfico não carrega, só aparece depois que clico em algo").

- **Causa raiz**: `SearchPage.tsx` nunca checava se `finance`/`cardsData`/`analysis` (dados de transações, cartões e faturas) ainda estavam carregando — só olhava se o total calculado era maior que zero. Enquanto o boot/rede demorava (ou uma leitura falhava), a tela mostrava a mesma UI de "nenhum gasto neste mês" que mostraria pra um mês genuinamente vazio, sem spinner nem erro. Reproduzido ao vivo limpando o cache do Firestore (simulando abertura fria): o donut e o histórico mensal ficaram presos em "R$ 0" por tempo indeterminado — só voltavam ao normal ao trocar de tela e navegar de volta (o que reassina as queries do zero). O Dashboard já tinha esse mesmo problema corrigido no dia anterior (`605737d`, RC2) — a Análise nunca ganhou o mesmo tratamento.
- **Fix**: novo estado `isLoadingChartData` (`finance.loading || cardsData.loading || analysis.loading`) distingue "carregando" de "vazio de verdade" nas duas seções de gráfico (donut "Por categoria" e barras "Histórico mensal") — mostra um placeholder de carregamento em vez do EmptyState enquanto os dados não resolveram. Erro de leitura (`finance.error || cardsData.error || analysis.error`) agora também aparece como banner, igual o Dashboard já faz pra cartões.
- `npm run typecheck`, `npm test` (412) e `npm run build` limpos. 100% client-side, zero mudança de regra/function.

## 2026-07-24 — fix: app não mostra mais "sem dados" ao abrir (4 correções no boot/cache)

- **4 causas raiz encontradas com `/investigate`** (4 agentes em paralelo) para o problema "abre o app, parece que não tem dado nenhum, depois pisca e aparece".
- **RC1**: `initializeFirestore` com fallback silencioso → sem IndexedDB, sem offline. Agora tenta `persistentSingleTabManager` antes de desistir da persistência; loga aviso em dev. Sem offline = cold start em toda abertura.
- **RC2**: Dashboard descartava o `cachedView` quando o boot timeout (2.5s) disparava antes dos dados chegarem → mostrava "Comece em poucos minutos" mesmo pra quem tem dados. Agora o cache cobre também o pós-timeout: se `loading=false` mas dados ainda vazios e cache existe, continua mostrando o cache em vez de zerar.
- **RC3**: Cache do dashboard (10-20 KB) falhava silenciosamente ao estourar quota do localStorage → cache nunca mais era salvo. Agora grava um mini cache (~150 bytes, só números) como fallback; na leitura, tenta o mini se o completo não existe.
- **RC4**: `persistentLocalCache` sem `cacheSizeBytes` → IndexedDB podia crescer até ser expulso pelo browser. Agora limitado a 100 MB.
- `npm test` (412), `typecheck`, `build` limpos. Detalhe: `docs/history/2026-07.md`.

## 2026-07-24 — fix: tema escolhido persiste ao fechar e reabrir o app

- **Causa**: `hasLocalOverride` (flag que impede o Firestore de sobrescrever a escolha local de tema) só existia em memória (Zustand) — resetava pra `false` a cada boot. Na reabertura, o perfil vindo do Firestore (ou do `profileCache`) sobrescrevia o localStorage, revertendo o tema.
- **Fix**: `hasLocalOverride` agora persiste no localStorage (`zerou.themeOverridden`). Uma vez que o usuário escolhe um tema neste dispositivo, o Firestore nunca mais sobrescreve — a escolha local é definitiva. No logout, o flag é limpo.
- `npm test` (408), `typecheck` limpo.

## 2026-07-24 — fix+feat: botão "Pago" em recorrência vencida + totais em Contas a Pagar

- **Label "Registrar" → "Pago"**: recorrência que já venceu ou vence hoje agora mostra "Pago" (igual contas avulsas), em vez de "Registrar". "Pagar adiantado" (≤7 dias) e "Em dia" (+7 dias) continuam iguais.
- **Totais por seção**: headings "Recorrentes" e "Compromissos" agora mostram a soma em R$ além da contagem (ex.: "Recorrentes · 5 · R$ 450,00"). O total de compromissos respeita o filtro ativo (Em aberto/Vencidas/Pagas/Todas).
- `npm test` (408), `typecheck` limpo.

## 2026-07-24 — fix: histórico de faturas no cartão agora vai da mais antiga pra mais recente

- `subscribeInvoices` (`cardService.ts`) usava `orderBy('referenceMonth', 'desc')` — a fatura mais distante no futuro (ex.: set 2027) aparecia primeiro, obrigando a rolar até o fim pra ver o histórico. Trocado pra `asc`: ordem cronológica (ago 2026 → set 2027).
- Os lançamentos dentro da fatura (`subscribeInvoiceLedger`) continuam em `desc` (mais recente primeiro), que é o comportamento esperado ali.
- `npm test` (408), `typecheck` limpo.

## 2026-07-23 — fix: "Compras"/"Créditos" da fatura ficavam inflados pra sempre depois de excluir uma compra no cartão

Achado pelo dono testando ao vivo: excluir uma compra no cartão fechava "Valor a pagar" certo (zerava), mas "Compras"/"Créditos" no resumo da fatura continuavam contando a compra excluída pra sempre — a linha sumia da lista, o resumo não.

- **Causa raiz**: excluir uma compra dispara `reverseCardPurchaseOnDelete` (Cloud Function), que cria um estorno (`purchase_reversal`) no próprio ledger — imutável, não dá pra apagar — pra cancelar a compra matematicamente. `anticipatedAwayEntryIds` (`anticipation.ts`) já sabia esconder esse PAR (compra + estorno) da exibição, mas o filtro de órfão em `useInvoiceLedger.ts` escondia os dois lançamentos ANTES dessa função rodar — nunca chegavam a ser pareados, e os totais brutos do servidor (`purchasesTotalCents`/`creditsTotalCents`, mantidos incrementalmente, nunca recalculados do zero) ficavam inflados pra sempre.
- **Fix**: o filtro de órfão só esconde um lançamento quando **não há** estorno correspondente no ledger; havendo, os dois ficam visíveis pra `anticipatedAwayEntryIds` esconder o par. `InvoicePage.tsx` passou a descontar `purchase_reversal` (antes só `installment_anticipation_credit`) do total de "Créditos" exibido.
- 2 testes de regressão novos, cada um comprovadamente falha sem o fix. Verificado ao vivo criando e excluindo uma compra de R$150 — "Compras" volta certinho, sem sobra em "Créditos"; de brinde, o fix limpou retroativamente um resíduo de R$130 que já existia de exclusões de teste anteriores nesta mesma sessão. `npm test` (408), `typecheck` limpo. 100% client-side, zero mudança de regra/function. Detalhe: `docs/history/2026-07.md`.

## 2026-07-23 — fix: categoria errada no Resumo Anual + ordem de compras na fatura

Duas queixas reais investigadas com `/investigate`.

- **Resumo Anual mostrava texto técnico no lugar do nome da categoria** (`annualSummaryCalculations.ts`): usuária relatou "erro relacionado a categoria" sem conseguir descrever onde. Achado: (1) categoria vazia aparecia como `__none__` em vez de "Sem categoria"; (2) mais grave, compra parcelada categorizada aparecia com o **id cru da transação** (`txn_...`) no lugar do nome — a função recebia um resolvedor "fake" (`(id) => id`) em vez do resolvedor de verdade que liga parcela → transação-mãe → categoria (mesmo padrão que a Análise principal já usava certo). Corrigido; 2 testes de regressão novos, cada um comprovadamente falha sem o fix.
- **Compras no cartão não vinham em ordem do mais recente pro mais antigo na fatura**: a query do ledger (`subscribeInvoiceLedger`, `cardService.ts`) ordenava `asc` (mais antigo primeiro) e nada reordenava depois — afeta qualquer compra, avulsa ou parcelada. Trocado pra `desc`. Teste de regressão novo.
- Ambos verificados ao vivo criando dados de teste reais (compra sem categoria, compra parcelada categorizada, 3 compras avulsas em datas diferentes) e depois removidos. `typecheck` limpo, 406 testes. 100% client-side, zero mudança de regra/function.

## 2026-07-23 — design: Cartão, Fatura e Cartões ganham o mesmo hero visual do Dashboard

O dono achou as telas de cartão de crédito "feias, poludas, pouco sofisticadas" perto do Dashboard. Pesquisa de referência (Copilot Money, Monarch Money, Monzo) + auditoria do próprio design system apontaram pro mesmo diagnóstico: tudo era `surface` branco sem hierarquia, descumprindo uma regra que o `docs/design/DESIGN.md` já mandava ("header de valor gigante colorido por contexto") mas nunca tinha sido aplicada. Três telas, uma de cada vez, cada uma aprovada antes de seguir pra próxima.

- **`CardDetailPage.tsx`**: "Limite disponível" ganhou o hero com gradiente de marca (mesmo tratamento do Dashboard); botão de excluir virou `.icon-button` circular; "Lançar compra parcelada" deixou de ser um botão solto entre cards e virou uma linha dentro do histórico de faturas.
- **`InvoicePage.tsx`**: "Valor a pagar" ganhou o mesmo hero gradiente; botão "Voltar" virou ícone circular; **bug de brinde corrigido** — o badge de status mostrava sempre verde ("Aberta", "Vencida", tudo igual), agora mapeia pra âmbar/vermelho/verde de verdade. Lista "Compras" (podia chegar a 10+ linhas numa compra parcelada antecipada) ganhou colapso em 5 linhas com "Ver todas" e um campo de busca por nome (só aparece com mais de 8 compras).
- **`CardsPage.tsx`** (lista de cartões): diferente das duas de cima (uma entidade só), aqui é lista — hero cheio em cada linha ficaria pesado com 2+ cartões. Reaproveitada a receita que o app já usa em `AccountsPage.tsx` (`.account-card-hero`): gradiente sóbrio (`--gradient-slate`) em vez do vívido, com rodapé branco mostrando a fatura em aberto só quando existe.
- 100% CSS/JSX — zero mudança em `firestore.rules`, Cloud Functions ou lógica de cálculo. `typecheck`, `npm test` (403) e `build` verdes em cada entrega; verificado ao vivo em 2 temas (claro/escuro) e mobile 375px.
- Análise (`SearchPage.tsx`) tinha o mesmo problema e chegou a ser explorada por engano antes de o dono apontar a tela certa — pesquisa/plano ficaram represados, não implementados. Ver `docs/planning/TODOS.md`.

## 2026-07-23 — fix+feat: 4 pendências de cartão (editar compra/limite, categoria e data em compra em andamento) + bug crítico de limite fantasma

Quatro queixas reais de usuárias em cartão de crédito, planejadas em 6 rodadas de auditoria antes de codar.

- **Editar compra no cartão** (nunca existia — só dava pra excluir e relançar): agora dá pra editar descrição/categoria. Valor foi implementado primeiro (soft-delete + recriação das parcelas) mas **removido de propósito** depois: editar o valor de uma parcela numa fatura já paga reabria saldo devedor nela — bug real, achado ao vivo. Igual na vida real, mudou o valor ou a data? Exclui e lança de novo; descrição/categoria são só metadado de exibição e nunca tocam o ledger.
- **Editar limite/nome do cartão**: novo botão na página do cartão, zero mudança de regra.
- **Compra parcelada em andamento**: ganhou campo de categoria (faltava na UI) e a data corrigida — antes toda compra lançada por esse fluxo caía sempre no dia 1º do mês, ignorando a data informada.
- **Bug crítico achado e corrigido**: excluir/editar uma compra com parcela já antecipada podia dobrar um crédito na fatura futura em vez de cancelar (`reverseCardPurchaseOnDelete`), e — achado só depois, testando com múltiplas parcelas antecipadas de uma vez — os ids de estorno podiam colidir por truncamento de string, deixando limite usado fantasma na fatura. Os dois corrigidos e deployados; reproduzido o cenário relatado do zero pra confirmar.
- Extrato ganhou um subtítulo ("10x de R$ 100,00") na linha de compra parcelada — só clareza visual, a Análise já calculava por parcela.
- `npm test` (401), `npm --prefix functions test` (121), `npm run test:rules` (68) — todos verdes. Detalhe completo: `docs/history/2026-07.md`.

## 2026-07-22 — fix: Vic (app e WhatsApp) não tenta mais executar ação nenhuma via chat

Achado testando ao vivo a feature de cartão como forma de pagamento (item abaixo): pedir pra Vic "cadastrar uma conta fixa" não tinha tratamento nenhum — nem no app, nem no WhatsApp.

- WhatsApp ganha o intent `bill_management_action`: pedido de CRIAR conta a pagar/recorrência/conta fixa/assinatura é reconhecido e redirecionado pro app (aba *Contas a Pagar*) — antes não existia nenhuma regra cobrindo isso, e o risco real era o DeepSeek forçar a classificação em `expense`/`card_purchase` e criar uma transação avulsa comum no lugar de uma conta a pagar de verdade.
- Vic do app (100% consultiva, sem tools/function-calling, nunca escreve no Firestore) ganha regra 12 explícita no `SYSTEM_PROMPT`: nunca finge executar criar/editar/excluir nada — aponta a tela certa do app em vez de deixar ambíguo se algo foi salvo.
- Comentário da seção COMPROMETIDO no `SYSTEM_PROMPT` corrigido (ainda dizia "próximos 30 dias", desatualizado desde o fix do item abaixo).
- Sem teste automatizado novo (classificação de intent é 100% guiada por prompt/LLM, sem parser determinístico — mesma limitação dos outros intents baseados em DeepSeek). `npm --prefix functions run build`/`test` (114) limpos.
- Detalhe completo: `docs/ai/VIC.md`, `docs/whatsapp/WHATSAPP.md`.

## 2026-07-22 — feat: cartão de crédito como forma de pagamento em Contas a Pagar + datas editáveis + fix da Vic

Pedido do dono: assinatura/conta fixa paga no cartão (o caso mais comum — Netflix, plano de saúde) não tinha como ser registrada como realmente acontece — "Conta de pagamento" só listava contas bancárias. Junto, duas queixas: não dava pra corrigir a data de uma recorrência depois de criada, e conta avulsa não tinha edição nenhuma além de "Pago"/"Cancelar". Aproveitado pra revisar a lógica Disponível/Comprometido, que achou uma divergência real entre a Vic e o Dashboard.

- Planejado com `/plan-eng-review` (achado: import circular entre `financeService`/`cardService`, corrigido extraindo `src/finance/accountBatchEffects.ts`; 2 achados de DRY corrigidos com `resolvePaymentMethod.ts`/`accountOrCardOptions.ts`). Entregue em 3 commits independentes por raio de impacto.
- **Vic**: calculava "Comprometido" com janela fixa de 30 dias, ignorando o modo (conservador/até o recebimento) que o Dashboard já usa — portado `resolveCommittedCutoff` pra `functions/src/shared/committedCutoff.ts`; verificado ao vivo que Vic e Dashboard agora batem (`R$ 22.190,00` nos dois). Dashboard também ganhou o nome do modo na legenda do "Comprometido".
- **Datas editáveis**: sheet de editar recorrência ganhou campo de vencimento (reancora o dia do mês automaticamente ao corrigir); nova `updateBill` + sheet completo de editar conta avulsa (antes só existiam os botões "Pago"/"Cancelar").
- **Cartão como pagamento**: `Bill`/`RecurringRule` ganham `cardId` opcional (avulsa também `installments` — recorrência nunca parcela); os 3 seletores de "conta de pagamento" em `BillsPage.tsx` passam a listar cartões ativos (rótulo renomeado pra "Conta ou cartão"); `payBill`/`recordRecurringPayment` criam a compra na fatura no mesmo batch que marca a conta como paga (atômico, sem duplicar). `firestore.rules` + `test:rules` (65/65 no emulador).
- Verificado ao vivo de ponta a ponta na conta de teste: recorrência e avulsa parcelada (3x) pagas no cartão, fatura somando certo mês a mês, Vic relatando o mesmo "Comprometido" do Dashboard.
- Deploy autorizado pelo dono e feito: `firestore:rules` e `functions:billing:financialAssistantChat`.
- Detalhe completo: `docs/history/2026-07.md`.

## 2026-07-22 — rename: assistente de IA "Grazi" → "Vic"

Pedido do dono: renomear a assistente de IA do app. Passou primeiro por "Vitória", depois por decisão de última hora no mesmo dia virou "Vic".

- Trocado em todo lugar onde o nome aparece: `SYSTEM_PROMPT` da IA (`financialAssistant.ts`, `answerFinancialQuestion.ts`), UI (`AssistantPage.tsx`, `OnboardingAnswersSettingsPage.tsx`, `AccountsPage.tsx`), Termos de Uso/Política de Privacidade (`LegalPages.tsx`, seções 8, 9, 13, 16), comentários em `functions/src/` e `src/`, e docs vivos (`CLAUDE.md`, `SESSAO.md`, `docs/BUSCA_RAPIDA.md`, `docs/COSTS.md`, `docs/planning/TODOS.md`, `docs/whatsapp/WHATSAPP.md`).
- Doc canônico da feature renomeado: `docs/ai/GRAZI.md` → `docs/ai/VIC.md`.
- **Sem risco de Firestore**: confirmado que "Grazi" nunca foi um campo/coleção/valor de enum persistido — é só texto (prompt, UI, comentário), então a regra do projeto sobre enum novo em payload do Firestore não se aplica aqui.
- **Deliberadamente não tocado**: registros históricos datados (`CHANGELOG.md` anterior, `docs/history/2026-07.md`, auditorias de segurança de 19/07 incl. `05-grazi.md`/`review-05-grazi.md` com achados `GRAZI-1..8` referenciados por ID em 4 outros documentos, docs de auditoria visual, a menção única em `docs/RUNBOOK.md`, e os itens já concluídos em `docs/planning/TODOS.md`) — mesma lógica de não reescrever um commit antigo.
- Validado: `npm run typecheck`/`test` (377), `npm --prefix functions run build`/`test` (97), `npm run build`, e checagem visual dos Termos de Uso e da página do Assistente no build de produção.
- **Pendente**: deploy manual das Cloud Functions (`npx firebase deploy --only functions --project zerou-26757`) — o `SYSTEM_PROMPT` novo só entra no ar depois disso; `git push` não reimplanta functions.

## 2026-07-22 — fix: layout quebrado em Safari antigo (iPhone 8 Plus e outros < 16.4)

Relato: amiga do dono viu o site inteiro quebrado no Safari de um iPhone 8 Plus (menu lateral de desktop sempre visível, cards e texto cortados na borda da tela), enquanto iPhones mais novos (12, 16) funcionavam normal.

- Causa: o Tailwind v4 compila **todos** os breakpoints responsivos com a sintaxe moderna de media query "range" (`@media (width<=900px)`), suportada só a partir do Safari 16.4/Chrome 104/Firefox 63. Em navegadores mais antigos o bloco `@media` inteiro é descartado como inválido — nenhuma regra responsiva é aplicada, então o app renderiza só a versão "base" (larga), cortando tudo que passa da tela.
- Fix em `vite.config.ts`: `build.cssTarget: ['safari13', 'ios13']` (+ `cssMinify: 'lightningcss'` explícito) faz o Lightning CSS — já o minificador de CSS padrão do Vite em produção — reescrever a sintaxe moderna de volta pro clássico `min-width`/`max-width` no build final. Nenhuma classe Tailwind ou CSS autoral mudou.
- `package.json` ganhou `browserslist` (`Safari >= 13`, `iOS >= 13`) pra manter o `autoprefixer` alinhado ao mesmo piso de compatibilidade.
- Verificado: `dist/assets/index-*.css` sem nenhuma ocorrência de `width<=`/`width>=` após o build; `npm run typecheck` e `npm test` (377 testes) limpos; conferido visualmente via preview do build de produção em viewport 414×896 (largura do iPhone 8 Plus) sem regressão.

## 2026-07-22 — feat: tour de boas-vindas da tela de Análise

Pedido do dono: um tutorial na primeira vez que a pessoa abre a Análise, igual o que já existe no Dashboard, explicando como a tela funciona e quais ações dá pra fazer.

- `SlideTour.tsx` (novo): o carrossel de slides do `WelcomeTour` (global) foi extraído num componente reusável — mesmo visual (`.welcome-tour*`, já existente), zero CSS novo. `WelcomeTour.tsx` virou um wrapper fino em cima dele.
- `AnalysisTour.tsx` + `analysisTour.store.ts` (novos, mesmo padrão do tour global): 4 slides — navegação por mês/comparação, gasto por categoria, histórico mensal, e o menu "Mais ações". Abre sozinho na primeira visita à Análise, só depois que o tour global já foi visto (`useWelcomeTour().seen`) pra não empilhar dois modais. "Já viu" fica no localStorage (`zerou.analysisTourSeen`), por aparelho.
- Reabrível a qualquer momento pelo item "Como funciona a Análise" no sheet "Mais ações".
- `npm run typecheck`/`test` limpos (377 testes, sem regressão no `WelcomeTour` do Dashboard). Verificado ao vivo: abre sozinho na primeira visita, navega entre os 4 slides, fecha e marca como visto, reabre pelo menu.

## 2026-07-22 — design: cabeçalho da Análise ganha "Mais ações" (menos ícones crípticos)

Pedido do dono: os 4 ícones soltos no topo de Análise (Tendência, Resumo anual, Exportar CSV, Buscar) não tinham como saber o que faziam sem tocar, e um deles (o orçamento por categoria, numa seção mais abaixo) tinha o mesmo problema.

- Os 4 ícones do cabeçalho e o de "Orçamentos por categoria" viraram um único botão "⋮ Mais ações", que abre um sheet com ícone + título + descrição por opção — mesmo padrão `.sheet-option` já usado em `SelectField`.
- Novo modificador `.page-heading-row--icon-trailing`: no mobile, um cabeçalho cujo lado direito é só um ícone agora fica na mesma linha do título, em vez de quebrar pra linha própria (a regra genérica de empilhar no mobile é pensada pra botões de texto largos, não pra um ícone sozinho — sem o modificador sobrava uma linha inteira vazia no topo da tela).
- Escopo só em `SearchPage.tsx`; a classe nova não afeta nenhuma outra página.

## 2026-07-22 — feat: mensagens do bot do WhatsApp redesenhadas (emoji, negrito, listas)

Pedido do dono: deixar as mensagens da Grazi no WhatsApp mais bonitas e coerentes. Detalhes em `docs/whatsapp/WHATSAPP.md`.

- Convenção de emoji fixada num único módulo novo (`messageFormat.ts`) em vez de espalhada: 💸 despesa · 💰 receita · 🔄 transferência · 💳 cartão · 🏷️ categoria · 🏦 conta.
- Confirmações de despesa/receita agora mostram categoria **e** conta usada; transferência mostra a rota (`Nubank → Itaú`) quando os dois nomes estão disponíveis sem leitura extra.
- Prompts de escolha (cartão/conta/transferência) e a mensagem de "não entendi" ganharam o mesmo formato visual (negrito na pergunta, lista numerada, instrução em itálico).
- Nenhuma mudança de lógica — só como as mensagens são construídas. 10 testes novos (`messageFormat.test.ts`), suite de functions 87→97.

## 2026-07-22 — design: menu mobile reorganizado (grade compacta em vez de lista empilhada)

Pedido do dono: "Sua conta" virou um bloco único empilhado, sem cabê-lo na tela sem arrastar.

- "Sua conta" virou grade de tiles (mesmo padrão de "Ir para") em vez de lista vertical de 6 linhas — cabe em 2 linhas.
- "Sair" saiu da grade: vira uma barra fina separada por um divisor, em vermelho (`--danger`), sempre visível no fim do menu.
- O menu inteiro passou a caber na tela sem precisar rolar (verificado em viewport mobile 375×812).

## 2026-07-22 — fix: navegador fechado durante a exclusão abria "logado" e inerte

Continuação direta do fix abaixo, com o caso que ele **não** cobria, achado pelo dono ao vivo: logado nos dois aparelhos, **navegador do PC fechado**, conta excluída no celular. Ao reabrir, o PC subia como se estivesse logado, mas nada funcionava — nenhuma transação, nenhum workspace no Firestore. Detalhes em `docs/history/2026-07.md`.

- **Por que escapou.** O fix anterior agia no caminho de **sucesso** do `onSnapshot` do perfil (`!snapshot.exists()` vindo do servidor). Com o navegador fechado, ao reabrir o token já não vale: o listener **não diz "não existe", ele é rejeitado** com `permission-denied`. E o handler de erro fazia `applyProfile(readCachedProfile(uid))` em silêncio — **ressuscitando o perfil do cache local**, o que fazia o app parecer logado enquanto toda escrita batia na regra.
- **Fix:** o mesmo `handleProfileUnavailable` agora está nos **dois** caminhos do listener. No de erro, só reage a `permission-denied`/`unauthenticated`; `unavailable` (offline) fica **de propósito** de fora, senão quem está sem internet seria deslogado.
- **Tela dedicada** (`AccountDeletedScreen`), pedida pelo dono: em vez de redirecionar em silêncio, explica "Esta conta foi excluída" com um botão "Voltar ao início". Fica **acima das `Routes`**, porque os guards mandariam pro `/login` — e o problema não é falta de login, é que a conta não existe mais. O botão usa `location.assign('/')` (reload completo) pra não sobrar estado da sessão morta.
- 377 testes client (+2 na tela nova). Verificado que a sessão válida **não** dispara a tela.

## 2026-07-22 — fix: excluir conta num aparelho agora desloga os outros (e não vira onboarding)

Dois bugs do mesmo cenário, achados pelo dono ao vivo: conta logada no celular **e** no computador, exclusão feita no celular. Detalhes em `docs/history/2026-07.md`.

- **O outro aparelho ia pro ONBOARDING em vez do landing.** O guard não consegue distinguir dois estados idênticos: "conta excluída" e "usuário novo sem onboarding" são ambos *autenticado, sem perfil*. O único desempate era a flag `isDeletingAccount` — Zustand **em memória**, que só existe no aparelho que exclui. Pior: parado no onboarding, se a pessoa concluísse, `ensurePersonalFoundation` **recriava** `users/{uid}` (conta fantasma), porque o ID token segue criptograficamente válido e as regras do Firestore não têm como saber que o usuário do Auth não existe mais.
- **Fix:** quando o **servidor** confirma que o perfil sumiu, o `AuthContext` chama `isAccountStillValid()`, que força `getIdToken(true)`. Falhou → conta excluída/revogada → logout + landing. Sucesso → usuário novo mesmo → onboarding. Age só em snapshot do servidor (do cache seria falso negativo offline) e **falha de rede não conta como conta excluída** — deslogar quem só está sem internet seria pior que o bug.
- **A conta não era excluída do Firebase Auth.** `forceLogoutAllDevices()` rodava **antes** do `deleteUser()`: revogar os refresh tokens faz o backend rejeitar o token em uso (anterior ao `validSince`) numa operação sensível como `deleteUser` — os dados sumiam e a conta do Auth sobrevivia. E ele nem cumpria o objetivo, já que revogar não derruba o ID token dos outros aparelhos (válido por ~1h — era por isso que o computador continuava logado). **Removido do fluxo** (autorizado pelo dono); a Cloud Function continua existindo, só não é mais chamada.
- 375 testes client (+5 cobrindo a lógica do token, inclusive o falso positivo de offline). Verificado ao vivo que a sessão existente **não** é deslogada por engano.

## 2026-07-21 — fix (privacidade): push agendado vazava dado financeiro pra quem saiu do casal

As functions agendadas rodam com Admin SDK, que **ignora o `firestore.rules`** — então a garantia da regra `isActiveMember` precisa existir **em código**, e não existia. Detalhes em `docs/history/2026-07.md`.

- **O vazamento.** `leavePartnerWorkspace` marca o membro como `removed` (não apaga o documento), mas o `createdBy`/`ownerUserId` gravado nos dados continua apontando pra ele. Quem saía de um espaço de casal **seguia recebendo push com descrição e valor** de contas/orçamentos de um espaço que não pode nem abrir — contra a regra explícita do `CLAUDE.md` ("dados financeiros pessoais não vazam para o espaço do casal").
- **Corrigido** em `sendDueReminders`, `sendBudgetAlerts` e `closeInvoicesDue`: só notifica se `members/{uid}.status == 'active'`. No `sendBudgetAlerts` a checagem vem **antes** da consulta de gastos do mês, então também economiza leitura de quem saiu.
- **DRY:** já existia `verifyWorkspaceMembership` (callable da Grazi) fazendo a mesma checagem, com contrato diferente (lança `HttpsError`). Em vez de deixar **duas implementações da mesma checagem de segurança**, extraída a fonte única `readMembershipStatus` (`shared/activeMember.ts`); o callable virou wrapper que traduz o status em erro (preservando as duas mensagens distintas) e as agendadas usam `createActiveMemberCheck`, com cache por execução.
- **Cuidado verificado antes de mexer:** o workspace **pessoal** também tem `members/{uid}` ativo, então a checagem **não** desliga a notificação de quem usa o app sozinho — tem teste cobrindo os dois lados. 87 testes functions (+6). Deployado.

## 2026-07-21 — feat: frequência Quinzenal + 3 correções na edição de recorrência

Auditoria do botão "Editar" das recorrentes, pedida pelo dono. Achou 2 bugs reais e 1 gap. **Exige deploy de `firestore.rules`** (feito). Detalhes em `docs/history/2026-07.md`.

- **Quinzenal (`biweekly`).** Valor novo de enum, sincronizado nos **9 pontos no mesmo commit** como manda a REGRA PRINCIPAL: `recurringFrequencies`, labels, `RecurringRule`, `nextOccurrenceDate` (+14 dias), `updateRecurringRule`, `Frequency` da Análise, o tipo do contexto da Grazi, e o `in [...]` das **duas** regras (create e update). Com teste de regra cobrindo o valor novo e rejeitando um inválido.
- **BUG: `anchorDay` congelado.** Ele era gravado na criação e a regra **não permitia alterá-lo**. Como semanal/quinzenal andam em dias corridos, a data ia derivando e o âncora ficava obsoleto — ao mudar pra mensal/anual a ocorrência **saltava de volta pro dia da criação** (criada semanal dia 21, já no dia 11, virar mensal jogava pro dia 21). Agora `anchorDay` entra em `affectedKeys` do update (com a validação 1-31 do create) e a UI **reancora no dia da próxima ocorrência apenas ao sair de semanal/quinzenal para mensal/anual** — nos demais casos o âncora original é mantido, que é o que faz a data "voltar" pro dia 31 depois de um mês curto.
- **BUG: não dava pra limpar o valor.** A dica dizia "deixe em branco se o valor varia todo mês", mas apagar o campo não fazia nada: o cliente mandava `undefined` e `updateRecurringRule` tratava `undefined` como "não mexe", pulando a gravação. Agora `undefined` = não mexe e `null` = limpar (via `deleteField()`).
- **Gap: não dava pra remover a conta.** O seletor só listava contas; ganhou a opção "Definir depois", deixando o placeholder honesto.
- **Primeiro teste de regras da coleção `recurring`** (não existia nenhum). typecheck / 370 testes client / 60 testes de regras no emulador / build functions. Verificado ao vivo: valor limpo virou "valor variável", conta virou "Definir depois", frequência virou QUINZENAL — tudo persistindo.

## 2026-07-21 — mudança de produto: recorrência NÃO debita mais sozinha, só avisa

Decisão do dono: **dinheiro só se move quando a pessoa confirma.** O débito automático podia tirar dinheiro de uma assinatura já cancelada que a pessoa esqueceu de desativar no app — risco assimétrico (economiza um toque, custa um saldo errado). Detalhes em `docs/history/2026-07.md`.

- **`generateRecurrences` virou um LEMBRETE.** Não cria transação, não debita conta, não gera conta a pagar e **não avança `nextOccurrenceAt`**. Só manda push. Quem registra é a pessoa, pelo botão "Registrar"/"Pagar adiantado" da tela Contas a Pagar (`recordRecurringPayment`) — que já pedia valor e conta, e é quem avança a data.
- **Unificou 3 comportamentos imprevisíveis em 1.** Antes, dependendo do que a pessoa preenchia: com valor+conta debitava sozinho; sem valor virava conta a pagar; com valor e sem conta não fazia nada. Agora é sempre o mesmo: avisa.
- **Um aviso por ocorrência.** Como a data não avança mais, a regra seguiria "vencida" todo dia e o push repetiria — o estado de "já avisei" vai num doc à parte (`recurringNotifyState/{ruleId}`), no molde do `budgetAlertState`: escrito só pela função (Admin SDK), **sem regra nova em `firestore.rules`** e sem acesso do cliente.
- **Texto novo do push**, com título que se adapta: `{descrição} vence hoje` quando é hoje mesmo, `{descrição} venceu em DD/MM` quando a ocorrência já passou (ex.: regra criada depois das 6h — o primeiro aviso só sai na manhã seguinte, e aí "vence hoje" seria mentira). Corpo: `R$ X · nada foi debitado — não se esqueça de registrar`. Antes dizia "registrado automaticamente", o oposto do que queremos.
- Zero mudança no client (a UI já tinha campo de valor, escolha de conta e o botão liberado perto do vencimento). Código morto removido (`nextOccurrenceDate`, `recurringOccurrenceTransactionId` e o import de `transactionAccountEffects` no `automation.ts`). 81 testes functions verdes.

## 2026-07-21 — fix: ícone das notificações push apontava pro asset Zerou antigo

`functions/src/push.ts` e `automation.ts` usavam `icon`/`badge` = `/brand/zerou-app-icon-192.png`, que **não existe desde o rebrand Zerou→Granativa** — o path cai no fallback do SPA (serve `index.html`, `content-type: text/html`, não uma imagem), então **toda notificação push aparecia sem o logo**. Trocado por `granativa-app-icon-192.png`. Afeta as 5 functions de push (`closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendBudgetAlerts`, `sendDailyLogReminder`) — deployadas em lote pequeno (contorno da quota de CPU, ver RUNBOOK).

## 2026-07-21 — fix: email de despedida não enviava + redesign dos emails

Dois problemas de email transacional (Resend), achados pelo dono testando com login Google. Client no ar (Vercel); templates deployados no codebase `billing`. Detalhes em `docs/history/2026-07.md`.

- **Email de despedida não era enviado ao excluir a conta.** O `onCall sendGoodbyeEmail` (que passou a exigir auth no lote de 21/07) era chamado DEPOIS do `forceLogoutAllDevices` revogar os tokens e como fire-and-forget — o `window.location.assign('/')` do caller abortava a requisição em voo. Agora o goodbye vai **primeiro** (sessão fresca, após reautenticar) com `await` + teto de 5s. As duas chamadas viraram deps injetáveis + teste de regressão travando a ordem.
- **Emails redesenhados.** Novo `EmailLayout` compartilhado com o **logo horizontal da Granativa** (o `<Img>` estava importado e nunca usado) numa faixa branca + faixa de saudação colorida + footer — os 4 templates pararam de duplicar ~50 linhas de estilo cada. Círculos 1/2/3 do welcome **à prova de email** (tabela isolada 30×30 em vez de `<td>` com `border-radius` sem altura, que esticava com o texto). Assunto do goodbye mais quente.
- **Deploy:** o deploy do codebase `billing` inteiro estourou a quota de CPU do Cloud Run em `southamerica-east1`; as funções de email foram ao ar, 3 functions não-relacionadas falharam e foram reimplantadas num lote menor (contorno documentado no `docs/RUNBOOK.md`).
- typecheck / 368 testes client / build / 81 testes functions verdes. Previews renderizados e aprovados pelo dono.

## 2026-07-21 — feat: Tendência de gasto por categoria (Análise)

Comparação mês a mês por categoria na Análise (ideia de um amigo do dono). Planejado e revisado com `/plan-eng-review` + `/plan-design-review` + `/frontend-design`. **Custo de leitura zero**: agrega em memória os 6 meses que a `SearchPage` já carrega — nenhuma query nova, nenhuma mudança em `firestore.rules`/functions/índices. Detalhes em `docs/history/2026-07.md`.

- **Novo `CategoryTrendSheet`** (`src/components/`), aberto por um ícone `LineChart` no header da Análise, já focado na categoria destacada no donut. Chips roláveis (radiogroup) → stat-herói em texto grande (média mensal + "este mês X% acima/abaixo") → gráfico de barras dos últimos 6 meses (mês atual "em andamento", linha da média) → maior/menor mês + total.
- **Mês parcial tratado com honestidade**: a média usa só os meses fechados (exclui o corrente); nada de projetar/estimar o mês cheio (postura anti-especulação, igual à Projeção de Fluxo apagada). Categoria com 0-1 mês de gasto mostra o que tem + aviso, não esconde.
- **2 funções puras** em `spendingAnalysis.ts`: `spendingByCategoryAcrossMonths` (reusa `spendingByCategoryForMonth`, então os números batem com o donut) + `computeCategoryTrend` (série, média dos fechados, veredito, maior/menor/total). 7 testes novos.
- **DRY**: `resolveCategoryColor` (duplicado em `SearchPage` e `AnnualSummarySheet`) extraído pra `src/theme/palette.ts`; as 2 cópias migradas.
- typecheck / test (366) / build verdes. Zero mudança de backend. **Verificado ao vivo** com 8 meses de dados de teste — a verificação pegou 3 correções (truncamento de card, max/min do mês parcial, rótulo cortado).

## 2026-07-21 — Infraestrutura: 14 correções de segurança, dados e resiliência

Maratona de 12h. 43 agentes de auditoria em 3 camadas (primária → secundária → terciária). 14 bugs corrigidos, 25 Cloud Functions no ar, 440 testes verdes. Detalhes em `docs/history/2026-07.md`.

- **Resiliência — try/catch em 5 loops de automação.** `closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendDailyLogReminder`, `sendBudgetAlerts` — cada iteração de loop agora tem try/catch individual. Um documento corrompido ou falha de rede não derruba mais a função inteira (antes, todos os documentos seguintes eram perdidos). Loga o erro e continua.
- **Segurança de dados — `adminDeleteUser` reestruturado.** Auth deletado ANTES do Firestore (antes era o contrário: se Auth falhasse, dados já tinham sido apagados). CommitDeletes agora retorna contagem real com try/catch por lote de 450. Todas as 7 etapas de coleta de dados com try/catch individual.
- **Segurança de autenticação — `sendGoodbyeEmail` agora exige login.** Antes, qualquer pessoa podia chamar a função e enviar email de "conta excluída" para qualquer endereço. Agora verifica `request.auth?.uid`.
- **Segurança de workspace — `cancelCoupleWorkspace` com verificação de tipo.** Antes, passando o ID do workspace pessoal, a função deletava todos os dados financeiros sem apagar a conta. Agora valida `type === 'couple'` antes de prosseguir.
- **Dados órfãos — 3 subcoleções adicionadas à lista de deleção.** `aiUsage`, `budgetAlertState` e `whatsappTransactionUsage` agora são varridas na exclusão de conta (cliente + admin). Antes, sobreviviam como dados fantasmas.
- **Dados órfãos — `cancelCoupleWorkspace` usa `recursiveDelete`.** Antes, deletava só o documento workspace com `batch.delete`, deixando TODAS as subcoleções órfãs. Agora é uma Cloud Function que usa Admin SDK para deletar a árvore inteira.
- **Segurança — WhatsApp com rate limit de 100 transações/dia.** Transação atômica no Firestore (sem TOCTOU). Ao atingir o limite, responde "Volte amanhã ou cadastre pelo app". Antes, era possível criar transações ilimitadas via WhatsApp.
- **Segurança — `forceLogoutAllDevices` ao excluir conta.** Revoga refresh tokens de todos os dispositivos antes de apagar os dados. Com `Promise.race` de 5s (nunca bloqueia a exclusão). Antes, o PC continuava ativo por até 1h após exclusão no celular.
- **Resiliência — `metaClient` propaga erros em vez de engolir.** `sendWhatsAppMessage` agora lança exceção em falha HTTP e rede. O webhook captura no try/catch global. Antes, erros eram silenciosamente ignorados.
- **Resiliência — `generateRecurrences` não causa mais leituras infinitas.** Regra sem `accountId` agora avança `nextOccurrenceAt` antes de pular. Antes, era relida todo dia para sempre (730+ reads/ano por regra).
- **Correção de fuso — `send3DayFollowUp` usa BRT, não UTC.** Query de "3 dias atrás" agora calcula no fuso America/Sao_Paulo com offset explícito -03:00.
- **Email — templates e infraestrutura.** `follow_up` adicionado como tipo legítimo (antes era substring frágil). `GenericEmail` cobre 4 tipos sem template. WhatsApp mencionado nos emails de boas-vindas e follow-up.
- **Retry — `deepseekClient` com retry habilitado para jsonMode.** Antes, chamadas com `jsonMode: true` (interpretação de mensagens WhatsApp) não faziam retry em 429/503.
- **5 índices compostos** no Firestore para queries de automação. Sem eles, 4 funções agendadas falhavam silenciosamente em produção.
- typecheck / test (440) / build verdes. 25/25 Cloud Functions deployadas.

## 2026-07-20 — Passada visual front-end (pré-lançamento): contraste, a11y, CSS, ARIA

## 2026-07-21 — Infraestrutura: emails transacionais (Resend), limpeza de dados órfãos, force logout

Segunda metade da maratona de pré-lançamento. Foco em backend e segurança de dados.

- **Emails transacionais com Resend.** Três templates (Welcome, Goodbye, FollowUp 3 dias) com identidade Granativa. `onUserCreated` (Firestore trigger), `send3DayFollowUp` (agendado diário), `sendGoodbyeEmail` (onCall). API key no Google Secret Manager. Domínio `granativa.com.br` verificado no Resend com DNS configurado no Cloudflare.
- **Limpeza de dados órfãos.** `dailyCleanup` (agendado 04:57 BRT): deleta workspaces couple abandonados (>7 dias sem partner), workspaces ghost (owner não existe mais), e `whatsappProcessedMessages` com >30 dias. 13 testes unitários. `cancelCoupleWorkspace` substituído por Cloud Function com `recursiveDelete` (antes deixava subcoleções órfãs). `aiUsage` e `budgetAlertState` adicionados ao `WORKSPACE_COLLECTIONS` nos dois codebases de deleção (cliente + admin).
- **forceLogoutAllDevices.** Nova Cloud Function revoga refresh tokens ao excluir conta. Resolve o bug onde o PC continuava ativo por até 1h após exclusão no celular, criando dados fantasmas. `Promise.race` com timeout de 5s — não bloqueia a exclusão se a CF estiver offline.
- **Firestore reset.** `scripts/resetAllData.mjs` — reset completo do banco (6 coleções zeradas). Firebase Auth preservado.
- **Docs atualizados.** CHANGELOG, SESSAO, BUSCA_RAPIDA, DESIGN, TODOS.
- typecheck / test (440: 359 client + 81 functions) / build verdes.

## 2026-07-20 — Passada visual front-end (pré-lançamento): contraste, a11y, CSS, ARIA

## 2026-07-20 — Passada visual front-end (pré-lançamento): contraste, a11y, CSS, ARIA

Fase final de polimento antes do lançamento. 21 commits na branch `frontend-design-2026-07`, mergeados direto na main. 30 agentes de auditoria + 5 meta-revisores + 4 skills de review. Zero alterações em `firestore.rules` ou `functions/` — sem necessidade de deploy Firebase. Mapa completo em `docs/design/DESIGN_VISUAL_ACHADOS.md`.

- **Contraste — 6 temas escuros corrigidos.** `--text-muted` clareado em noturno, carbono, cobalto, ametista, grafite, vinho para ≥4.5:1 AA. Bordas trocadas de hex escuro (invisível, ~1.1:1) para `rgba(255,255,255,0.08/0.13)`. `--action-primary-hover` do noturno clareado (#3789d9) para contraste ≥4.5:1 com `--text-inverse`.
- **Acessibilidade — focus indicators, ARIA, touch targets.** 4 inputs que tinham `outline: none` sem substituto ganharam `:focus-visible` com `outline: 3px solid var(--border-focus)`. ~20 grupos de botões mutuamente exclusivos convertidos de `aria-pressed` para `role="radiogroup"` + `role="radio"` + `aria-checked` (11 arquivos). 4 touch targets ajustados para ≥44px (WCAG 2.5.8). `role="alert"` no erro do Dashboard. `aria-describedby` no ForgotPasswordPage.
- **CSS — 280 linhas mortas removidas, durações padronizadas, tokens novos.** Classes não referenciadas (`.launch-*`, `.app-preview-*`, `.pricing-*`, `.cookie-banner`, etc.) removidas de `global.css` e `landing.css`. ~35 transições com valores mágicos (120ms, 140ms, 0.15s, 0.18s, 0.2s, 0.3s, etc.) substituídas por `var(--duration-fast/normal/slow)`. Tokens novos no `:root`: `--bg-input`, `--text-placeholder`, `--shadow-lg`, `--radius-md`. `.metric-card--accent` unificado (2 blocos → 1). `.form-accordion-toggle` extraído de 4× inline style duplicado.
- **Reduced-motion — boot + runtime.** `theme.storage.ts` agora consulta `matchMedia('(prefers-reduced-motion: reduce)')` quando não há valor salvo em localStorage. `ThemeRuntime` ganhou listener para mudanças em tempo real da media query.
- **Limpeza — token fantasma, classe fantasma, fonte inline.** `var(--brand-color)` inexistente no WhatsAppLinkPage trocado por `var(--action-primary)`. Classe `.amount-hero--expense` referenciada mas nunca definida removida do TSX. 4 `fontFamily` inline substituídos por `className="display-number"` (SOL-06).
- **Headings — AssistantPage e NetWorthPage.** `AssistantPage` ganhou `className="page-title page-title--compact"` no h1. `NetWorthPage` corrigido (faltava classe base `page-title`).
- typecheck / test (359) / build verdes. Health score 10/10.

## 2026-07-20 — Bugs: exclusão de conta (dado órfão), recorrente duplicada, mensagens WhatsApp

Três correções antes da fase de front-end. Client (as duas primeiras) já no ar via Vercel; a de WhatsApp é functions e precisa de deploy manual.

- **Exclusão de conta + login Google não gera mais dado órfão (crítico).** Excluir a conta usando só Google podia deixar uma conta nos dados do app sem usuário no Firebase Auth (inconsistência Auth×Firestore). Causa: `AuthContext.finishBoot` restaura o usuário do cache quando o `onAuthStateChanged` dispara null — proteção offline correta pra queda de rede, mas a exclusão também dispara null e ressuscitava um "usuário-zumbi" (uid deletado) que o onboarding usava pra gravar. Correção em camadas: `authSession.ts` (sinal de sign-out intencional), `authService` (marca o sinal + limpa cache antes do `deleteUser`), `finishBoot` (null intencional desloga limpo, offline segue protegido), `ensurePersonalFoundation` (backstop: só grava com sessão Auth viva pro mesmo uid) e `LoginMethodsPage` (fallback com `clearLocalCache`). Fecha AUTH-03/AUTH-07 da auditoria. Regressão coberta em `src/workspaces/workspaceService.test.ts`.
- **Conta recorrente não duplica mais em avulsas.** `BillsPage` criava a regra em `recurring` E um bill avulso na hora; a ocorrência já vira transação quando vence (idempotente), então o bill imediato era um registro extra e errado. A recorrente agora vive só na seção "Recorrentes".
- **Mensagens do WhatsApp** ("não tem conta cadastrada" / transferência) reescritas pra deixar claro que falta uma conta **financeira** (carteira/banco), não uma conta de login no app. Deployado (`whatsappWebhook`).
- **Exclusão de conta Google mais suave:** reautenticação usa `login_hint` na conta atual (o Google abre apontado, confirma e fecha sozinho, sem seletor forçado nem `user-mismatch`); ao fechar o popup, mensagem tranquilizadora ("nada foi excluído") em vez de erro técnico. A janela de confirmação é exigência do Google/Firebase, não dá pra remover.
- **Preparo da fase front-end/design (pré-lançamento):** auditoria do estado real do plano v2 no código (várias coisas já feitas — ver `docs/planning/TODOS.md`), prompt de execução pro DeepSeek (passada visual ao vivo, temas escuros incluídos) e TODOS atualizado com o que sobrou.
- typecheck (client + functions) / test (359) / build verdes.

## 2026-07-19 — Meta-auditoria de seguranca (Camada 3): consolidacao de 26 relatorios

Auditoria final que consolida e audita 16 dominios da Camada 1 + 10 revisoes da Camada 2 da auditoria de seguranca 2026-07-19. Documento em `docs/security/auditoria-2026-07-19/meta-auditoria.md`.

- **Duplicatas eliminadas**: 8 grupos de duplicatas identificados (ex.: dangerouslySetInnerHTML reportado em 4 dominios, HMAC em 3, dados ao DeepSeek em 5).
- **Inconsistencias de severidade**: 7 subestimacoes corrigidas (PERF-4 de Media para Alta, WHATSAPP-04 de Alta para Critica, GRAZI-3/5 de Media para Alta, etc.) e 2 superestimacoes rebaixadas (AUTH-03 de Alta para Media, AUTH-06 de Media para Info).
- **7 lacunas globais** identificadas (testes automatizados, supply chain, disaster recovery, monitoramento, governanca de dados, seguranca fisica) — nenhuma coberta por C1 ou C2.
- **Ranking de qualidade**: LGPD (9), Auth/Grazi/WhatsApp C2 (9), UX C1 (5). A estrutura de 2 camadas se mostrou eficaz — C2 agregou valor real em todos os dominios.

## 2026-07-19 — Fatura: espaçamento das seções avançadas + auditoria da lógica (antecipar/estornos)

As duas seções colapsáveis do fim da fatura ("Antecipar parcelas de faturas futuras" e "Estornos,
créditos e tarifas") estavam **coladas** — `.advanced-panel` tem margem 0 e, com o mesmo
`bg-surface-subtle`, as bordas encostavam e viravam um bloco só.

- **Espaçamento** (`src/pages/InvoicePage.tsx` + `src/styles/global.css`): modificador `.invoice-page`
  dá `margin-top: 1rem` nos painéis (separa os dois **e** o primeiro do card acima) + entre
  Compras/Pagamentos quando ambos aparecem. Escopado na página: o `.advanced-panel` de outras telas
  vive em form com `gap` próprio e não pode ganhar margem à toa. Zero impacto fora da fatura.
- **Auditoria da lógica (código + dados) — sem bug, nada mudou no código.** Os 14 valores de
  `InvoiceLedgerEntryType` estão em sincronia nos **três** lugares: enum TS, `validInvoiceLedgerEntryType`
  (`firestore.rules`) e o bucketing da Cloud Function (`functions/src/cards/invoiceTotals.ts`). Saldo da
  fatura confere (`compras + tarifas − pagamentos − créditos`); a antecipação se anula na fatura de
  origem e passa a pesar na atual. O "terceiro ponto de sincronia" (a Cloud Function, que `git push`
  não reimplanta) ficou registrado na REGRA PRINCIPAL de enums do `CLAUDE.md`.
- typecheck / test (357) / build verdes.

## 2026-07-19 — Contas a Receber (Fase 1: avulso) — espelho do Contas a Pagar

Feature nova pedida pelo dono: anotar dinheiro a receber (quem te deve, freela pendente,
reembolso, racha de conta). Plano em `docs/planning/CONTAS_A_RECEBER.md`.

- **Coleção `receivables` SEPARADA** (não campo em `bills`) — decisão de arquitetura chave: o
  cálculo de saldo/Disponível/Comprometido **nunca** lê essa coleção, então um "a receber" é
  **impossível** de inflar o número por acidente. Dinheiro a receber só vira dinheiro ao marcar
  "recebido" (cria uma **receita** de verdade na conta escolhida, via `markReceivableReceived` —
  espelho de `payBill`). Mantém o número honesto, o valor nº1 do dono.
- `ReceivablesPage` (`/app/receivables`, nav sidebar + mobile): anotar (descrição, valor, de quem,
  previsão, conta), "Recebi" (escolhe a conta), cancelar (com confirmação). Atrasados marcados
  automático (`markOverdueReceivables`, espelho de `markOverdueBills`).
- **Dashboard**: seção "Próximos a receber" **no fim** da tela, só o que vence em **≤5 dias** e
  totalmente fora de qualquer total de saldo (pedido do dono, pra não dar ilusão de dinheiro).
- `firestore.rules`: `validReceivableCreate/Update` + `match /receivables` (a regra nº1 — coleção
  nova + teste real no emulador, 55/55). **Precisa de deploy das regras** pra funcionar em produção.
- Só **avulso** nesta fase; **recorrente** virou TODO/Fase 2 (mexe em Cloud Function + `RecurringRule`
  compartilhado). `typecheck`/`test` (357/357)/`test:rules` (55/55)/`build` limpos.
- **Polimento visual** (design pass) pra casar com o capricho das outras telas: o cabeçalho
  colapsável ganhou o chevron que rotaciona ao abrir (igual Contas a Pagar — antes não tinha
  affordance de "abre"), cada linha ganhou o ícone-tile de receita, form + lista foram pro
  `finance-grid` (respiro entre os cards no mobile, antes colados; 2 colunas no desktop), botões da
  linha no peso subtle/ghost em vez de primary "gritando", e a meta-linha deixou de ter um `<span>`
  aninhado que viraria bloco por `.list-row span`. Só visual, sem mudança de dado/fluxo.

## 2026-07-19 — Pull-to-refresh bloqueado via JS cirúrgico (✅ confirmado no celular do dono)

O PWA instalado no Android **tem** pull-to-refresh (o dono confirmou com print — não some só por
estar instalado, como eu tinha suposto errado). Depois da 1ª tentativa via CSS ter travado o scroll
(ver entrada abaixo), agora via JS **cirúrgico** (`src/pwa/preventPullToRefresh.ts`, chamado no
`main.tsx`): um listener de `touchmove` só cancela o gesto quando **três** coisas valem ao mesmo
tempo — a página está no topo (`window.scrollY <= 0`), o dedo vai pra baixo, **e** nenhum ancestral
rolável sob o dedo tem `scrollTop > 0` pra consumir o puxão. Ou seja, só o overscroll real do
documento vira refresh e é cancelado; rolar a tela (dedo pra cima, ou fora do topo) **e rolar dentro
de um BottomSheet** nunca são tocados. `window.scrollY`/`scrollTop` são confiáveis independente de
qual elemento rola (evita a ambiguidade que quebrou o CSS).
- Achado no processo (antes de ir pro dono): a 1ª versão do guard bloquearia o scroll pra cima
  DENTRO de um sheet aberto — corrigido com a checagem de ancestral rolável (`pullCanBeConsumed`).
- **Confirmado ao vivo pelo dono no Android**: refresh bloqueado, scroll normal e scroll dentro de
  sheet intactos. `typecheck`/`build` limpos.

## 2026-07-19 — REVERTIDO: bloqueio de pull-to-refresh travava o scroll no celular

`overscroll-behavior-y: contain` em `html, body` (adicionado mais cedo hoje pra bloquear o "puxar
pra recarregar") **travou todo o scroll no mobile** — dava pra clicar, mas não rolar a tela.
Deveria ser inofensivo pro scroll (é o uso padrão da propriedade), mas interagiu mal com o
`overflow-x: hidden` do body + o modelo de scroll do documento no navegador mobile real, que não
reproduzi no preview de desktop. **Revertido por completo** (`global.css`) — restaura o estado que
funcionava. O gesto nativo de pull-to-refresh fica como está (o flash que ele causava já foi
minimizado pelo cache do Dashboard). Nota de "não tentar de novo assim" em `docs/design/DESIGN.md`.

## 2026-07-19 — Dashboard e alerta de orçamento batem com a Análise mesmo com +300 no mês (Fase 3)

Terceira e última fase do plano `docs/planning/HISTORICO_TRANSACOES.md`, fechando a limitação da
janela de 300. O "Resumo de gastos" do Dashboard e o banner de orçamento calculavam das 300 do
boot — então, se alguém fizesse +300 lançamentos **no mês corrente**, subcontavam (a Análise não).

- Hook compartilhado `useCompleteCurrentMonth` (`useMonthlyTransactions.ts`, DRY): usado pelo
  Dashboard ("Resumo de gastos" + variação vs. mês passado) e pelo `BudgetAlertBanner`.
- **Detecção esperta e barata**: só carrega o mês atual (+ anterior no Dashboard) completo **se** a
  janela de 300 está cheia **E** a mais antiga carregada é do mês atual (sinal de transbordo). Pra
  todo mundo com ≤300 (todos hoje), **custo ZERO** — nenhuma leitura extra no boot.
- Fecha a inconsistência com a Análise sem cobrar leitura por abertura do Dashboard de todos. 3
  testes novos. `typecheck`/`test` (355/355)/`build` limpos.
- **A limitação das 300 transações está resolvida por completo** (Análise por mês + "Carregar mais"
  em Transações + Dashboard/banner do mês atual).

## 2026-07-19 — Transações: "Carregar mais" pra ver histórico antigo (Fase 2)

Segunda fase do plano `docs/planning/HISTORICO_TRANSACOES.md`. A lista de Transações mostrava só
as 300 mais recentes, sem como ver as mais antigas. Agora tem paginação sob demanda.

- `loadMoreTransactions` (`financeService.ts`): busca a próxima página de 50 transações mais
  antigas via `getDocs` com cursor por **DocumentSnapshot** (um `getDoc` da âncora — robusto contra
  empate de data, ao contrário de cursor por valor). Leitura pontual, não tempo real.
- `TransactionsPage`: as 300 do boot seguem ao vivo; botão **"Carregar mais"** anexa páginas de 50
  antigas (união por id, sem duplicar na fronteira). Página incompleta = fim do histórico. Offline
  sem cache → aviso pra reconectar (não marca "fim" à toa).
- ~50 leituras por toque, só quando a pessoa pede. **Sem índice novo** (ordena por `date`, já
  indexado). 2 testes novos. `typecheck`/`test` (352/352)/`build` limpos.
- Fase 3 (Dashboard/banner do mês atual, borda extrema) segue deferida.

## 2026-07-19 — Análise correta além de 300 transações (Fase 1: leitura por mês)

Primeira fase do plano `docs/planning/HISTORICO_TRANSACOES.md` (travado com `/plan-eng-review`).
A Análise e o resumo anual **subcontavam** meses/anos de quem passa de 300 transações, porque
calculavam filtrando só as 300 mais recentes carregadas no boot. Agora leem o histórico **por
mês, sob demanda**. Detalhes em `docs/history/2026-07.md`.

- `subscribeTransactionsForMonths` (`financeService.ts`): assina as transações de um conjunto de
  meses — 2 queries `in` (por `cashMonth`/`competenceMonth`, mescladas por id) **sem limite**, então
  um mês com >300 vem inteiro. Novo hook `useMonthlyTransactions` (sob demanda, mesma proteção
  anti-piscar dos outros hooks).
- `SearchPage` (Análise) e `AnnualSummarySheet` (resumo anual, 12 meses do ano sob demanda) passam
  a agregar sobre a **união** das 300 do boot + os meses completos carregados. Durante o
  carregamento mostram o resultado das 300 (sem flash vazio) e refinam pro completo.
- **Sem regressão pra quem tem ≤300 transações**: a união = as 300 (o histórico inteiro cabe na
  janela) → resultado idêntico ao de hoje. Só corrige quem passa de 300.
- Offline: mês já aberto online funciona offline (cache); nota sutil quando offline. Sem aquecedor
  proativo (decisão de custo — só lê o que a pessoa olha). **Zero mudança em `firestore.rules` e
  índices** (leitura já é por membro; campos string auto-indexados — verificado no código).
- Helper `dedupeById` extraído (DRY, 3 usos). 9 testes novos. `typecheck`/`test` (350/350)/`build`
  limpos. Verificação ao vivo do caso >300 depende de volume que ninguém tem ainda (~2 meses de app).
- **Falta**: Fase 2 ("Carregar mais" em Transações). Fase 3 (Dashboard/banner do mês atual) deferida.

## 2026-07-18 — Bloqueio do "puxar pra recarregar" (pull-to-refresh) no mobile

Decisão de produto (pedido do dono): o app é offline-first e sincroniza sozinho, então o
pull-to-refresh do Chrome Android só servia pra reiniciar o app à toa e reexibir o boot de
1-2s (o "pisca"). Contexto: cold-open sempre cai no Dashboard (já sem flash) e navegar entre
telas nunca pisca — o único jeito de piscar era dar refresh parado numa tela.

- `src/styles/global.css`: `overscroll-behavior-y: contain` em `html, body`. Mata a recarga
  por arrasto e o scroll-chaining pra fora, mantendo o scroll normal.
- **Não** bloqueia reload pelo botão do navegador / F5 / Ctrl+R, nem o cold-start.
- Escopo global (app + landing). Efeito concentrado no Chrome Android em aba de navegador —
  PWA instalado geralmente já não tem o gesto e o iOS Safari não recarrega por arrasto.
- Gesto de toque: não verificável no preview de desktop (validar no celular). Build limpo.
- A "etapa 2" (cache das outras telas via seed no núcleo) foi **arquivada de propósito**:
  ganho estreito (só refresh-na-tela) não justifica o risco de mexer em `useFinanceData`/
  `useCardsData` + serializar `Timestamp` do Firestore. Raciocínio em `docs/history/2026-07.md`.

## 2026-07-18 — Dashboard 100% offline: as listas também pintam do cache (fim do "pisca em branco")

Continuação do `dashboardSummaryCache` (que só cobria os 3 números do topo), a pedido do
dono — a sensação de "app sempre carregando" ao abrir a conta, pior no celular onde a
maioria vai usar. Detalhes técnicos e risco residual em `docs/history/2026-07.md`.

- Ao abrir, "Resumo de gastos", "Próximos compromissos" e "Transações recentes" apareciam
  em branco por 1-2s (o dado já está no cache do Firestore, mas ler o IndexedDB de volta no
  boot frio custa no celular). Os 3 números do topo já não piscavam porque tinham cache
  síncrono; as listas não tinham — era só estender o mesmo padrão.
- `dashboardSummaryCache.ts` → `dashboardViewCache.ts` (v2): guarda também uma foto
  denormalizada das 3 listas por workspace. No boot pinta do cache na hora; quando o dado
  real chega, troca sem piscar (quase sempre idênticos). Só acelerador de exibição — a fonte
  real continua sendo o cache do Firestore + os listeners.
- Marca (ícone+cor) pré-resolvida na gravação pra bater com o render ao vivo; datas via ISO;
  validação defensiva descarta cache corrompido/formato antigo e cai pro dado ao vivo.
- **Mesma classe de bug no guia "Comece em poucos minutos"** (achado pelo dono ao dar
  refresh): ele era decidido pelo dado ao vivo, que começa vazio no boot, então piscava
  mesmo numa conta já usada. Agora só aparece depois que finanças+cartões resolveram.
- **Legendas do Disponível/Comprometido e a variação "% vs. mês passado" também no cache**
  (pedido do dono): a legenda do Comprometido trocava "Contas e fatura." → "Considerando…"
  e a do Disponível mostrava "Carregando…"; a variação só aparecia depois de carregar.
  Agora as três vêm resolvidas do cache no boot, sem piscar nem trocar de texto.
- 2 arquivos de teste novos (round-trip do cache + render do Dashboard). **Verificado que os
  testes de render falham sem a correção.** `typecheck`/`test` (341/341)/`build` limpos.

## 2026-07-18 — "Disponível"/"Comprometido" ainda piscavam no celular (causa diferente do fix anterior)

Achado pelo dono com print, ao vivo no celular (PWA instalado e navegador mobile — nunca no
desktop), mesmo depois do fix de mais cedo no dia. Causa raiz completa em
`docs/history/2026-07.md`.

- Depois que os cartões carregavam com sucesso, um soluço de rede (comum em dados móveis)
  fazia o Firestore chamar erro de novo no MESMO listener — e o código tratava isso como a
  primeira tentativa, jogando a tela de volta pra "Carregando..." mesmo com dado bom na
  tela. Repetia a cada soluço (o "pisca 4-5 vezes" relatado).
- Achado revelador: uma variável `resolved` existia em `firestoreRetry.ts` mas nunca era
  usada — proteção que alguém começou e não terminou (`useFinanceData.ts` já tinha a
  versão certa disso). Foi descartada como "código morto" no fix de mais cedo no dia, sem
  perceber que era inacabada, não descartável.
- `subscribeWithTransientRetry` ganhou um `markLoaded()` que o consumidor chama ao receber
  o primeiro dado bom — erro depois disso no mesmo listener é ignorado silenciosamente.
- **Aplicado nos outros 5 hooks no mesmo dia** (pedido do dono, depois de confirmar o fix):
  `useGoalContributions.ts`, `useInvoiceLedger.ts`, `useCoupleSavings.ts`,
  `useSharedWorkspaceData.ts`, `useGoalsData.ts` — cobre metas, cofrinho do casal, espaço
  compartilhado e fatura detalhada, os mesmos 9 pontos de assinatura.
- 1 teste novo, verificado que falha sem a correção. `typecheck`/`test` (332/332)/`build`
  limpos.

## 2026-07-18 — Grazi ajuda a pensar em decisão financeira grande (app); WhatsApp redireciona

Preocupação do dono, motivada por feedback real de uma amiga que testou o app: pessoas vão
usar a Grazi pra tomar decisão de verdade, então o aconselhamento importa. Detalhes e
racional completo em `docs/whatsapp/WHATSAPP.md` e `docs/ai/GRAZI.md`.

- Grazi do app, ao ser perguntada sobre decisão financeira grande (empréstimo,
  financiamento, investir reserva, renegociar dívida), agora faz 1-2 perguntas objetivas
  com os dados reais da pessoa pra ajudar a pensar — em vez de só dar veredito pronto ou
  mandar procurar um profissional.
- Decisão explícita do dono: **não levar isso pro WhatsApp** — esse tipo de conversa
  precisa de histórico (ida e volta), que o WhatsApp nunca teve. Novo intent
  `advisory_decision` reconhece a pergunta e redireciona pro app, sem gastar chamada de IA.
- Achado no processo: já existe disclaimer forte sobre isso nos Termos de Uso (seção 9),
  mas nunca aparecia na conversa — a regra nova é o reforço comportamental que faltava.
- **Refinamento (mesmo dia)**: regra de "não sugerir produto específico" ficou absoluta —
  nunca nomeia banco/cartão/investimento, **mesmo se a pessoa pedir direto** (app não é
  patrocinado por nenhuma marca). Decisão de cartão novo/anuidade entrou no mesmo
  tratamento de "ajuda a pensar" do empréstimo. **Investimento ganhou regra própria e mais
  rígida**: nenhuma análise de produto/estratégia, nem as perguntas de reflexão — só
  redirecionamento caloroso pra profissional licenciado, já que é atividade regulamentada.
  WhatsApp espelha a regra de produto e passou a redirecionar pro app também em pergunta
  de cartão novo/anuidade e qualquer pergunta de investimento (antes só pegava "investir
  reserva").
- `functions build`/`test` (67/67) limpos em ambas as rodadas. **Deployado e verificado ao
  vivo três vezes no app real**: empréstimo (perguntou de volta, usou dados reais, só
  mencionou profissional no fim), cartão com anuidade (mesmo padrão, sem nomear banco),
  investimento (recusou analisar, redirecionou pra profissional, mas seguiu ajudando a
  pensar no tamanho da reserva). Pergunta rotineira continuou respondida direto nas três
  rodadas — regra não dispara fora do escopo. **Ponta do WhatsApp ainda não testada com
  mensagem real** — depende do dono mandar uma mensagem de teste pro número vinculado.

## 2026-07-18 — "Disponível"/"Comprometido" podiam piscar um valor errado por um instante

Preocupação do dono: o app não pode dar a sensação de estar sempre carregando. Achado
concreto: `useCardsData.ts` marcava "carreguei" assim que a lista de cartões chegava, sem
esperar as faturas — que é o dado que efetivamente abate o Disponível. Por um instante o
Dashboard mostrava um valor inflado (fatura ainda não descontada) e corrigia logo em
seguida. Detalhes técnicos e verificação em `docs/history/2026-07.md`.

- `src/cards/useCardsData.ts`: `loading` só vira `false` quando cartões e faturas de todo
  cartão ativo já resolveram (sucesso, erro ou timeout de 2.5s). `DashboardPage.tsx` já
  usava esse `loading` corretamente — passa a funcionar certo sem mudança lá.
- Graças ao cache já existente (`dashboardSummaryCache`), quem já tem dados nem percebe
  diferença: o último número certo continua na tela enquanto isso resolve em segundo
  plano, geralmente idêntico ao valor final.
- 1 teste novo, verificado que falha sem a correção. `typecheck`/`test` (331/331)/`build`
  limpos. Testado ao vivo com conta real com cartão e fatura.

## 2026-07-18 — Conta nova ficava presa em "não foi possível carregar cartões" (fix)

Achado pelo dono (`/investigate`): logo depois de criar conta, o app podia ficar preso numa
mensagem de erro permanente. Raiz: o onboarding libera a UI de propósito antes do servidor
confirmar a criação do workspace (fix de rede fraca já existente), e o retry que cobria essa
janela desistia depois de só ~8.2s — curto demais pra rede realmente lenta. Detalhes técnicos
completos, incluindo verificação de que o teste falha sem a correção, em
`docs/history/2026-07.md`.

- `src/firebase/firestoreRetry.ts` e `src/finance/useFinanceData.ts`: depois de esgotar o
  backoff rápido, continuam tentando num intervalo sustentado (10s) em vez de desistir de
  vez. Erro aparece uma vez; se resolver depois, o próprio sucesso limpa a mensagem sozinho.
- Corrige automaticamente os 6 hooks que usam esse retry compartilhado (cartões, dados
  financeiros, metas, cofrinho do casal, espaço compartilhado).
- 5 testes novos, incluindo verificação de que falham sem a correção. `typecheck`/`test`
  (330/330)/`build` limpos.

## 2026-07-18 — WhatsApp: conta principal + transferência entre contas

Corrige um problema real relatado pelo dono: com mais de uma conta cadastrada, a Grazi no
WhatsApp debitava/creditava numa conta escolhida arbitrariamente e não sabia transferir
entre contas. Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

- Nova **conta principal** (`Account.isPrimary`, botão estrela em Configurações > Contas) —
  fallback quando a mensagem não deixa clara a conta.
- `interpretMessage.ts` agora casa o **nome da conta citada na mensagem** ("gastei 30 no
  mercado itaú") contra a lista de contas do workspace, igual já fazia com categoria.
- Resolução em 3 níveis (nome citado → conta principal → conta única → bot pergunta),
  reaproveitando o mesmo padrão de pergunta numerada com TTL já usado pra escolher cartão.
- Novo intent **`transfer`** ("transfere 100 do nubank pro itaú") — resolve os dois lados
  independentemente, pergunta só o que faltar (um lado ou os dois).
- `pendingCardAction.ts` generalizado em `pendingAction.ts` (suporta as 3 perguntas
  pendentes); achado no processo e corrigido: a comparação de nome não era
  acento-insensível ("itau" não batia com "Itaú").
- `firestore.rules` atualizada (`isPrimary` em `accounts`) e testada (`npm run test:rules`,
  54/54). Suite de functions foi de 48 pra 67 testes.
- **Deployado em produção** (`firestore.rules` + `whatsappWebhook`, autorizado pelo dono) e
  verificado ao vivo: marcar conta principal persiste de verdade, sem erro.

## 2026-07-18 — Mobile com cara de app nativo: extrato por dia, sheet de detalhe, swipe nas sheets, menu novo

Auditoria de UX mobile (375px) com debate entre dois agentes (designer propôs, crítico
verificou cada alegação no código) e implementação dos 9 itens aprovados. Detalhes e
vereditos em `docs/history/2026-07.md`.

- **Extrato agrupado por dia** com header sticky ("Hoje/Ontem/12 jul") e líquido do dia;
  total some sob busca textual (senão o subtotal parece bug). `overflow-x` do `.app-main`
  mobile virou `clip` (era `hidden`, que mata `position: sticky` dos descendentes).
- **Linha de transação virou alvo de toque único**: Editar/lixeira saíram da linha e
  vivem num sheet de detalhe (`BottomSheet`) — destrutivo a dois toques, linha limpa.
- **`BottomSheet` ganhou swipe-to-dismiss** (drag restrito a grabber/header, threshold de
  8px preserva cliques; flick rápido também fecha) — todas as sheets do app herdam.
- **Menu mobile migrou pro `BottomSheet` base** em duas zonas: tiles "Ir para" (6 destinos,
  ícone em cima) e lista "Sua conta" — corrige o desalinhamento do grid antigo e o ícone
  "sumido" do Compartilhado.
- **Dashboard mobile**: só "Lançar agora" some (o FAB já cobre); Contas, Cartões,
  Compromissos e Metas continuam com atalho, em grid 2x2 mais compacto que o do desktop.
  (Primeira versão tinha removido Contas/Cartões também — corrigido no mesmo dia após
  o dono notar que sumiram do menu principal.)
- **Lançamento**: autofocus no valor (corta um toque do fluxo mais usado) e CTA "Salvar"
  sticky acima da bottom nav (nova var `--bottom-nav-space`, antes 5.75rem hardcoded).
- **Transações**: "+ Nova" oculto no mobile (FAB já cobre), placeholder curto, chips de
  filtro compactos em trilho horizontal com "Filtros" primeiro (carrega o contador de
  estado) — tamanho reduzido depois que o dono flagrou os últimos chips cortados fora da
  viewport em 375px. Linha do extrato ficou mais baixa (isenta da regra antiga que
  quebrava valor pra segunda linha, criada quando a linha ainda tinha botões inline).
- Proposta "Lança e vai" (captura relâmpago por long-press no FAB) **não implementada** por
  decisão do dono — spec salva em `docs/planning/LANCA_E_VAI.md` pra avaliação futura.

## 2026-07-18 — Landing: CTA do menu parava de implicar plano pago + "Entrar" sumia no celular

Dois ajustes pontuais na landing, achados numa revisão de design/frontend a pedido do
dono.

- **Botão do menu "Começar grátis" → "Começar agora"**: o dono notou que "grátis" colado
  no verbo dá a entender que é grátis só pra começar (like um trial), quando o produto é
  100% gratuito, sem plano nenhum. Os outros dois CTAs da página (hero e final) já
  evitavam esse problema com copy orientada a benefício; só o do menu destoava. A
  reafirmação "Grátis · sem cartão de crédito" continua exatamente onde já estava (nota
  do hero, nota do CTA final, faixa de stats "R$0 pra sempre").
- **"Entrar" desaparecia por completo abaixo de 480px** (achado pelo dono testando no
  próprio celular): a única forma de logar a partir da landing some no mobile — não
  existe outro link de login em nenhum lugar da página, nem no rodapé. Corrigido
  encolhendo os dois botões e a logo nesse breakpoint (em vez de esconder "Entrar"),
  verificado ao vivo em 375px e 320px sem overflow.

## 2026-07-18 — Fatura de cartão travava "Aberta" além do fechamento + parcela única aparecia como antecipável

O dono achou os dois bugs ao vivo, direto na fatura de julho: badge "Aberta" numa fatura
que já devia estar fechada, e "Restaurante"/"Farmácia" (compras à vista, sem parcela)
aparecendo na lista de "antecipar parcelas de faturas futuras".

- **Fatura só fechava via Cloud Scheduler diário** (`closeInvoicesDue`), que só roda
  no dia exato do fechamento de cada cartão — uma compra lançada com data retroativa (ou
  o scheduler falhando um dia) deixava a fatura presa em `open` por até um mês, com o
  botão errado ("Antecipar fatura" em vez de "Pagar fatura"). Existia até uma função
  `closeInvoice` pronta pra corrigir isso, mas sem nenhum lugar que a chamasse. Nova
  função `markClosedInvoices` fecha isso no cliente — mesmo padrão que `markOverdueBills`
  já usa pra contas a pagar: roda a cada snapshot de fatura, silenciosa, sem UI.
- **Compra à vista virando "antecipável"**: o filtro de parcelas futuras (`anticipation.ts`)
  não checava se a compra realmente tinha mais de uma parcela — qualquer compra que
  rolasse pra uma fatura futura (por ter sido feita depois do fechamento) entrava na
  lista. Corrigido: só entra quem tem `installmentTotal > 1` ou aparece mais de uma vez
  no ledger do cartão (cobre compra parcelada antiga, de antes desse campo existir).
- `/code-review` no próprio fix achou uma regressão: o fechamento estava ancorado ao
  meio-dia do dia de fechamento em vez do dia inteiro — uma compra à tarde nesse mesmo
  dia cairia numa fatura já marcada fechada horas antes da hora. Corrigido pra comparar
  por dia inteiro.
- Testado ao vivo o cenário pedido pelo dono: antecipar uma parcela cuja fatura de
  origem só tinha aquele lançamento faz a fatura de origem sumir do histórico — comportamento
  por design (`invoiceHasVisibleActivity`), não bug.
- Achado e **deixado documentado, não corrigido**: `subscribeInvoices` limita a 24
  faturas por cartão — em teoria uma compra parcelada muito antiga (de antes do campo
  `installmentTotal` existir) num cartão com 24+ faturas acumuladas poderia ficar de
  fora da antecipação. Sem impacto hoje (app só existe há ~2 meses, nenhum cartão chega
  perto de 24 faturas). Ver `docs/planning/TODOS.md`.
- Detalhes em `docs/history/2026-07.md`.

## 2026-07-18 — Metas ganham histórico por contribuição, retirada de valor e exclusão com devolução

O dono testou a fundo e trouxe 4 pontos reais sobre Metas: sem histórico por meta, sem
como retirar valor (só "Corrigir", que nunca mexia em conta nenhuma), exclusão de meta
nunca devolvia o dinheiro guardado (nem pedia confirmação), e uma suspeita de bug na
criação que não se confirmou ao testar ao vivo.

- **Depósito e retirada agora simétricos** (`contributeToGoalWithTransaction`): os dois
  podem mexer numa conta de verdade (débito no depósito, crédito na retirada) ou só
  corrigir o progresso ("Só registrar"). Bloqueia no formulário se a retirada passar do
  que a meta tem guardado.
- **Nova tela `/app/goals/:goalId`** com o histórico de cada meta — data, tipo
  (guardado/retirado) e conta envolvida.
- **Excluir meta com escolha**: meta de economizar com saldo > 0 agora pergunta —
  devolver pra uma conta escolhida ou deixar sumir. Meta de dívida (ou sem nada
  guardado) só pede confirmação simples — antes não pedia nenhuma.
- `firestore.rules` ganhou `accountId` opcional em `goalContributions` (já publicada em
  produção) e uma correção de robustez em `findNextIncomeDate` (não excluía retirada de
  meta/cofrinho do cálculo de "próximo recebimento").
- Verificado ao vivo, contra o banco de produção: depósito/retirada com conta escolhida
  moveram o saldo certinho, exclusão com devolução creditou o valor exato e limpou o
  histórico, exclusão sem devolver manteve o saldo intacto.
- Detalhes em `docs/history/2026-07.md`.

## 2026-07-18 — Revisão de design mobile: remove Projeção de Fluxo de Caixa, ajusta dataviz e formatação

Revisão tela a tela do app (Dashboard, Transações, Contas, Cartões, Contas a Pagar,
Metas, Análise, Compartilhado) a pedido do dono, usando lentes de design/dataviz.

- **Projeção de Fluxo de Caixa removida por completo** (`CashFlowChart`,
  `ProjectionTimeline`, `cashFlowProjection.ts` apagados, não só desconectados):
  especulava receita futura a partir de média histórica + regra de recebimento, e o
  dono decidiu que o risco de iludir alguém com dinheiro que não tem supera o valor da
  feature.
- Dashboard: "Disponível" ganha a mesma explicação clicável que só "Comprometido"
  tinha; card de gastos mostra variação vs. mês anterior.
- Cartões/Fatura: mês de referência da fatura formatado ("jul 2026" em vez de "2026-07"
  cru) em 6 lugares, inclusive no título da própria página da fatura.
- Análise: remove ícone redundante de "limite por categoria" do cabeçalho; corrige
  grade pontilhada e cor errada de "Saídas" no gráfico de entradas/saídas; lista de
  categorias agora expande além do top 6.
- Achado e corrigido: botão de excluir em listas pulava de posição quando a linha não
  tinha "Editar" (Transações, beneficia também Contas a Pagar); barras de progresso
  (gastos, metas, limite de cartão) ficam quadradas na base, arredondadas só na ponta;
  seletor 30d/60d/90d parou de quebrar letra por letra.
- Rodado o validador de paleta do dataviz na cor de categorias (`theme/palette.ts`):
  2 cores falham checagem de daltonismo/contraste. Dono decidiu não mexer — é a
  identidade visual do app. Documentado em `docs/planning/TODOS.md`.
- Detalhes em `docs/history/2026-07.md`.

## 2026-07-18 — Landing perde contraste AA no texto secundário e ignora prefers-reduced-motion

`--ink-3` tinha só 3.07:1 de contraste contra o fundo branco (usado em "Grátis · sem
cartão de crédito" e no fechamento do CTA) — escurecido pra 4.59:1. Bob do telefone e
das badges flutuantes no hero rodava infinito mesmo com `prefers-reduced-motion` (são
animações inline do Framer Motion, não pegas pelo media query CSS já existente).

## 2026-07-17 — Aba WhatsApp do admin: linha "fantasma" após excluir a conta dona

Achado pelo dono testando a feature nova de hoje: excluiu uma conta pelo admin (que já desvincula o WhatsApp sozinha) e, ao tentar desvincular esse mesmo número manualmente depois, caiu num erro "não pertence a nenhuma conta" — a lista da aba não se atualiza sozinha após excluir um usuário, então a linha continuava aparecendo mesmo já limpa no banco. `handleDeleteConfirm` agora também remove da lista local qualquer vínculo do usuário excluído; e tentar desvincular algo que já sumiu (corrida entre duas ações) agora é tratado como sucesso, não erro. Também esclarecido um segundo ponto levantado (sem mudança de código): reabrir o app em outro aparelho logo depois de excluir a conta em outro pode mostrar dado antigo por um instante — comportamento esperado de app offline-first + token JWT, não um bug novo. Detalhes em `docs/history/2026-07.md`.

## 2026-07-17 — Admin ganha aba WhatsApp: desvincular qualquer número, inclusive órfão

Consequência direta do fix de exclusão de conta (entrada abaixo): o dono excluiu a própria conta antes da correção existir, recriou com o mesmo email, e não conseguia mais vincular o mesmo número — preso num vínculo órfão apontando pra uma conta que já não existe. Nova aba **WhatsApp** no painel Admin lista todos os números vinculados (marca "Órfão" quando o dono não é mais encontrado) com botão "Desvincular" — nova Cloud Function `adminUnlinkWhatsappNumber` (`functions-admin`, Admin SDK, funciona mesmo com o workspace já excluído). Deployado e com IAM verificada. Detalhes em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-17 — Exclusão de conta: WhatsApp não desvinculava + race condition mandava pro onboarding

Relato ao vivo do dono: excluiu a própria conta (login Google), o WhatsApp continuou vinculado e a tela voltou pro onboarding em vez da landing. Duas causas reais, sem relação uma com a outra:

- **WhatsApp nunca era desvinculado**: nem a auto-exclusão (`accountDeletionService.ts`) nem a exclusão via admin (`functions-admin/src/index.ts`, `adminDeleteUser` — já existia, com botão em `AdminPage.tsx`) tocavam em `whatsappPhoneIndex`/`whatsappLinks`/`whatsappLinkCodes`. Corrigido nos dois: self-service chama o `unlinkWhatsapp` que já existia; admin apaga direto (Admin SDK).
- **Race condition** (a causa real do "voltou pro onboarding"): `deleteAccountData()` apaga `users/{uid}` antes de `deleteAuthenticatedUser()` (ordem deliberada). O `onSnapshot` ao vivo em `AuthContext.tsx` zera o perfil na hora, e o guard de rota `RequireOnboardingComplete` redirecionava pra `/app/onboarding` **no meio da própria exclusão**, parecendo que a conta tinha virado nova. Corrigido com uma flag transiente (`accountDeletion.store.ts`) que suspende esse redirect enquanto a exclusão está rodando.
- Bônus de UX: aviso antes do popup do Google na tela de exclusão, e mensagem clara se a pessoa confirmar com uma conta Google diferente (`auth/user-mismatch`).
- Verificado de ponta a ponta com conta descartável: sem flash de onboarding, WhatsApp simulado desvinculado, `functions:admin:adminDeleteUser` deployado e testado (IAM ok, sem repetir o bug de 2026-07-09). Detalhes em `docs/history/2026-07.md`.

## 2026-07-17 — Objetivo/desafio do onboarding: editável depois + alimenta a Grazi

Achado pelo dono: as respostas de "qual seu objetivo" e "qual desafio" no cadastro não influenciavam nada no app depois, e nunca podiam ser mudadas. Duas mudanças:

- **Editável**: nova tela `/app/settings/onboarding` ("Objetivo e desafio", link na sidebar/menu mobile) deixa mudar a resposta a qualquer momento — `updateOnboardingAnswers()` (`workspaceService.ts`), nova regra `onlyOnboardingAnswersChanged` no `firestore.rules` (teste de emulador novo cobrindo edição válida, tipo errado, campo contrabandeado e edição por outro usuário). Arrays de opções extraídos de `OnboardingPage.tsx` pra `src/onboarding/onboardingOptions.tsx`, reaproveitados pelas duas telas.
- **Alimenta a Grazi**: `buildFinancialContext.ts` agora inclui o objetivo/desafio (traduzido pra texto legível via `onboardingLabels.ts`) na seção SEU CICLO, usado tanto pela Grazi do app quanto pelas perguntas via WhatsApp (mesmo `buildFinancialContext`). Instrução nova no prompt: usar como tempero de tom, nunca como fato garantido (a resposta pode estar desatualizada). 2 testes novos.
- Sem mudança de rota WhatsApp/backend fora do prompt. Detalhes em `docs/ai/GRAZI.md`.

## 2026-07-16/17 — WhatsApp parou de responder: conta de desenvolvedor Meta bloqueada (não era bug)

Uma amiga do dono criou conta e não conseguiu vincular o WhatsApp. Investigação (logs de produção + teste direto do token contra a Graph API) confirmou: a conta de desenvolvedor da Meta foi bloqueada por "atividade incomum" (sistema automático de detecção de fraude, gatilho provável: muitos deploys + testes concentrados no mesmo dia). Nada pra corrigir no código — resolvido pelo dono confirmando identidade no painel da Meta. Testado de ponta a ponta depois: mensagem simples + vínculo novo com outro número, tudo funcionando. Detalhes e roteiro de diagnóstico em `docs/whatsapp/WHATSAPP.md` e `docs/RUNBOOK.md`.

## 2026-07-16 — Nome do cartão nas faturas do Dashboard/Projeção + "Ver todos" enganoso removido

Achado pelo dono ao vivo: com mais de um cartão, "Próximos compromissos" mostrava várias faturas com o texto idêntico "Fatura 2026-07" (o mês de referência), só distinguíveis clicando.

- `buildUpcomingCommitments`/`calculateDashboardSummary` (`financeCalculations.ts`) e `projectDailyBalance` (`cashFlowProjection.ts`) agora recebem a lista de cartões e trocam o nome do cartão pela descrição da fatura — com fallback pro texto antigo (`Fatura ${referenceMonth}`) se o cartão não for encontrado (ex.: já excluído). 2 testes novos.
- Ajuste de UI logo em seguida (pedido do dono, achou o texto "não bonito"): a descrição no Dashboard virou só o nome do cartão (ex.: "Cartão Nubank"), sem repetir "Fatura" nem o mês de referência técnico — a linha de baixo já mostra "Fatura · 10 jul". Mesmo padrão que bills/recorrências já usavam (descrição = só o nome). Na Projeção de Fluxo (sem esse rótulo separado) manteve o prefixo "Fatura" mas sem o mês de referência, já que cada evento aparece sob o cabeçalho do próprio dia.
- Removido o link "Ver todos" de "Próximos compromissos" — levava pra Contas a Pagar, que não lista faturas de cartão, então prometia mostrar tudo sem entregar quando a lista incluía fatura.
- Sem mudança de regra/backend.

## 2026-07-16 — Patrimônio Líquido desativado (temporariamente, a pedido do dono)

Feature "Patrimônio Líquido" desativada por pedido explícito ("talvez no futuro faremos, mas no momento pode desativar"). **Só desconectada da navegação, código intacto** — nenhum arquivo apagado, pra religar rápido se um dia voltar a ser prioridade:

- Removida a entrada "Patrimônio" da sidebar desktop e do menu mobile (`src/layout/AppShell.tsx`).
- Rota `/app/net-worth` trocada de `<NetWorthPage />` por um redirect pro dashboard (`src/App.tsx`) — protege quem tiver a URL salva/favoritada de cair numa tela morta.
- `src/pages/NetWorthPage.tsx` e `src/finance/netWorthCalculations.ts` continuam existindo, intocados, prontos pra religar (bastaria reverter os 2 arquivos acima). Ver `docs/planning/TODOS.md` pra reativar.

## 2026-07-16 — Contas a Pagar reorganizada + Grazi/WhatsApp corrigidas + achado operacional importante

- **Contas a Pagar redesenhada**: recorrentes e compromissos avulsos agora em seções separadas (antes misturados numa lista só); corrigido bug real onde a data da próxima recorrência aparecia trocada pelo valor em dinheiro; agora dá pra editar valor/frequência/categoria de uma recorrência (antes só dava pra criar); layout revisado pra celular de verdade (achado e corrigido um bug de sobreposição de texto em telas de 375px, junto com a mesma correção nas listas do Dashboard e Transações).
- **Filtros de Transações consolidados**: de 7 chips soltos (tipo + tags + conciliação) pra 4 chips de tipo + 1 botão "Filtros" com os secundários numa folha — sem perder nenhum filtro.
- **Removida a conciliação manual** ("marcar como conferido") — feature pouco usada, sem ligação com nada financeiro, removida junto com o filtro que dependia dela.
- **Tag interna "bill" (inglês) trocada por "conta"** — aparecia crua pro usuário no filtro de tags; corrigida no código e com backfill nas transações já existentes.
- **Grazi/WhatsApp**: a correção do bug "fatura sempre R$ 0,00" (ver entrada abaixo) tinha sido commitada mas nunca chegou a ser implantada — corrigido, com um aviso permanente novo em `docs/RUNBOOK.md` (`git push` não reimplanta Cloud Functions). Também adicionado: pedidos de editar/excluir algo já lançado via WhatsApp ("exclui essa transação") agora recebem orientação pra usar o app, em vez de cair no "não entendi" genérico.
- Detalhes completos em `docs/history/2026-07.md`, `docs/ai/GRAZI.md`, `docs/whatsapp/WHATSAPP.md`.

## 2026-07-16 — Saldo de conta e total de fatura: correção financeira + custo de leitura

Dois bugs de correção financeira corrigidos, pedido explícito do dono ("não tem como um aplicativo de finanças ter o saldo errado"):

- **Saldo de conta**: podia ficar errado silenciosamente em contas com 300+ transações (a janela de leitura nunca cobria o histórico inteiro). Agora mantido incrementalmente (`Account.currentBalanceCents`, `increment()` no mesmo batch da transação — mesmo padrão de `goals.savedCents`).
- **Total de fatura de cartão**: nunca era persistido de verdade (nascia 0), causando um bug ativo onde a Grazi/WhatsApp sempre reportava fatura em aberto como R$ 0,00, e forçando o app a resomar o ledger inteiro de toda fatura em todo boot (até 1.500+ leituras por reabertura). Agora mantido incrementalmente por Cloud Function (`invoiceLedgerEntryTrigger.ts`), com correção nova pra compra excluída no cartão (`purchase_reversal` + `reverseCardPurchaseOnDelete.ts`).
- `useCardsData.ts` parou de carregar o ledger de toda fatura no boot global — agora é sob demanda (`useInvoiceLedger.ts`), só quando a tela que precisa dele (cartão/fatura/análise) abre.
- Backfill rodado em produção (contas: 100% batendo com o cálculo antigo; faturas: 9 reversões retroativas encontradas de compras já excluídas antes da correção existir).
- Detalhes completos, riscos residuais e sequenciamento em `docs/history/2026-07.md`.

## 2026-07-16 — Banner "não foi possível preparar categorias padrão" corrigido

Reportado pelo dono: refresh do app (mesmo instalado) às vezes mostrava tudo piscando por alguns segundos + banner vermelho de erro no topo. Causa: `ensureDefaultCategories()` rodava uma leitura única do Firestore em *todo* refresh, mesmo com as categorias padrão já existindo há muito tempo — se essa leitura falhasse de forma transitória (rede instável logo após o refresh), tentava de novo por ~8s e aí mostrava o erro. A UI já mostra as categorias padrão via merge local independente dessa escrita ter sucesso, então a falha virou silenciosa (log só em DEV) e o "já preparado" passou a persistir em `localStorage`, não rodando mais essa leitura redundante a cada refresh. `src/finance/useFinanceData.ts`.

## 2026-07-16 — Auditoria CLAUDE.md: 2 travamentos offline-first + erro técnico exposto

Auditoria completa (3 frentes em paralelo: offline-first, sincronia payload↔firestore.rules, pontos sensíveis). O código do WhatsApp/cartão desta semana passou limpo em tudo. Achados reais, todos pré-existentes:

- **`JoinInvitePage.tsx`**: aceitar convite de casal travava a tela esperando o servidor (`await` bloqueante). Corrigido pra fire-and-forget, igual ao padrão já usado em `SharedSpacePage.tsx`.
- **`AdminPage.tsx`**: revogar convite tinha o mesmo travamento; corrigido. Também corrigidos 3 lugares que mostravam erro técnico cru (`err.message`) em vez de mensagem amigável.
- **`sharedService.ts`**: 5 funções de acerto de contas do casal (claims/settlements) reimplementavam o padrão fire-and-forget na mão em vez de usar o `fireWrite()` do projeto — um `await` futuro nelas travaria de verdade. Padronizado.

## 2026-07-15 — WhatsApp: compra no cartão (à vista ou parcelada)

- **Compra no cartão via mensagem**: "gastei 300 no cartão em 3x" cria a transação `card_purchase` + as parcelas nas faturas certas, portando a mesma lógica de `cardService.createCardPurchase()` do app.
- **Mais de um cartão cadastrado**: o bot pergunta qual usar (lista numerada, "1 - Itaú / 2 - Nubank") e espera até 3 minutos pela resposta — sem memória de conversa geral, só essa pergunta pontual. Resposta que não bate com nenhum cartão descarta a pergunta e trata a mensagem normalmente, sem travar o bot.
- **Fora do escopo, de propósito**: parcela que já estava em andamento antes de usar o WhatsApp, antecipar parcela/fatura, renegociar — o bot direciona pro app em vez de tentar.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: paridade com a Grazi (categorias, receita, perguntas) + vinculo unico/desvinculo

- **Roteamento de intencao**: uma unica chamada DeepSeek classifica cada mensagem em despesa/receita/criar categoria/pergunta/nao entendi, ao inves de assumir sempre despesa (`interpretMessage.ts`, substitui `extractExpense.ts`).
- **Categoria nova so por pedido explicito** ("cria uma categoria X") — lancamento sem categoria clara continua ficando sem categoria, nunca cria sozinha; a IA prioriza a categoria existente mais especifica.
- **Receita pelo WhatsApp**: "recebi 200 de freela" agora cria uma transacao `income` de verdade (antes so despesa era suportada).
- **Perguntas financeiras via WhatsApp**: mesma persona e dados da Grazi do app, rate limit compartilhado (60/dia por workspace).
- **Vinculo unico por workspace**: gerar codigo novo enquanto ja tem numero vinculado agora e bloqueado; codigos antigos nao usados sao limpos automaticamente.
- **Botao Desvincular**: novo em Configuracoes > WhatsApp — fecha um gap real de compliance (Termos e pagina de exclusao de dados ja prometiam essa opcao, que nao existia).
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: confirmacao lenta (CPU throttling) + extracao de gastos quebrada (secret faltando)

- **Confirmacao demorava ~1min**: Cloud Run corta CPU da instancia assim que `whatsappWebhook` responde 200 pro Meta, e o processamento (Firestore + envio da confirmacao) roda todo DEPOIS disso — throttled. Corrigido com `memory: 512MiB` + `cpu: 1` no codigo e `gcloud run services update --no-cpu-throttling` (precisa ser reaplicado a cada deploy, ver `docs/whatsapp/WHATSAPP.md`).
- **Extracao de gastos por mensagem quebrada desde a criacao da feature**: `whatsappWebhook` nunca declarou `secrets: [deepseekApiKey]`, entao toda chamada ao DeepSeek pra extrair "gastei 15 reais..." falhava com "No value found for secret parameter DEEPSEEK_API_KEY". Corrigido.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: vinculacao de conta corrigida (indice do Firestore faltando)

- **Bug**: "vincular 123456" chegava no bot mas nenhuma resposta voltava — nem sucesso, nem erro. Causa: `processLinkCode()` roda uma query `collectionGroup('whatsappLinkCodes').where('code','==',...)` que precisa de indice explicito em escopo COLLECTION_GROUP; sem ele o Firestore rejeita a query com `FAILED_PRECONDITION`, capturado silenciosamente pelo catch generico do webhook.
- **Correcao**: `fieldOverrides` adicionado em `firestore.indexes.json`, deploy via `firebase deploy --only firestore:indexes`. Confirmado com a query real reproduzida via REST API do Firestore.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp: webhook destravado (WABA nao inscrita) + link faltante no menu mobile

- **Causa raiz do #133010 / webhook silencioso**: apos migrar para o numero real, a WABA (1431749015518519) nunca foi inscrita no app via `POST /{WABA_ID}/subscribed_apps` — `GET subscribed_apps` retornava `data: []`. A config de webhook (Callback URL, verify token, campo `messages` subscribed) estava correta, mas sem essa inscricao a Meta nunca entrega POSTs. Corrigido chamando o endpoint manualmente; confirmado com mensagem real (`whatsapp_message_received` nos logs).
- **Bug**: menu mobile (`AppShell.tsx`, `mobile-menu-footer`) nao tinha o link `/app/settings/whatsapp` — so existia na sidebar desktop. Usuario nao conseguia achar a tela de vinculacao pelo celular. Corrigido: link adicionado entre Aparencia e Seguranca, mesmo padrao dos demais.
- Detalhes completos em `docs/whatsapp/WHATSAPP.md`.

## 2026-07-15 — WhatsApp oficial Meta Cloud API + politicas legais completas + Cloudflare DNS

- **WhatsApp integrado via Meta Cloud API v25.0**: Cloud Functions `whatsappWebhook` (webhook publico) + `generateWhatsappLinkCode` (vinculo por codigo 6 digitos) em `functions/src/whatsapp/`. DeepSeek extrai gastos de mensagens em portugues. Pagina de vinculacao `/app/settings/whatsapp`. Numero real +55 11 936192757 registrado no WABA 1431749015518519 com token permanente via System User. Doc canonica: `docs/whatsapp/WHATSAPP.md`.
- **Politicas legais reescritas**: 3 documentos — Termos de Uso (21 secoes), Politica de Privacidade (16 secoes), Data Deletion (7 secoes). Identificacao completa (Arthur Olimpio Lima, CPF 487.655.288-67). LGPD, CDC, Marco Civil cobertos com artigos citados. WhatsApp, DeepSeek e Grazi explicitamente tratados com consentimento granular. Emails migrados para `@granativa.com.br`. Formatacao de sub-itens com quebra de linha automatica.
- **Grazi coberta legalmente**: Termos secoes 8-9 (descricao + limitacao de responsabilidade IA), Privacidade secoes 3.5, 4(e), 13.3.
- **DNS migrado para Cloudflare**: nameservers `kareem.ns.cloudflare.com` + `mia.ns.cloudflare.com`. Email Routing: suporte/contato/privacidade → zerou.contato.net@gmail.com.
- **App Meta publicado**: categoria "Servicos e produtividade", politicas aprovadas, webhook `messages` subscribed. URL canonica: https://developers.facebook.com/apps/1480907564073971/whatsapp-business/
- **Deploy**: `whatsappWebhook` + `generateWhatsappLinkCode` atualizadas com token permanente e phone number ID de producao.
- **Bug pendente**: numero real retorna erro #133010 "Account not registered" ao enviar mensagens — aguardando verificacao SMS da Meta.

## 2026-07-14 — Renomeacao Contas a Pagar + auditoria Grazi + push diario reescrito

- **"Contas" → "Contas a Pagar"**: renomeação nos labels de UI (sidebar, mobile, título da página, tour, Análise) pra evitar ambiguidade com contas bancárias. Termo "Despesas Fixas" substituído por "Contas recorrentes" nos labels da Análise.
- **Auditoria Grazi pós-unificação**: system prompt e context builder atualizados pra tratar contas avulsas e recorrentes como um grupo só (não mais 2 separados). Lista unificada com anotação "(se repete)". Rules de segurança, documentação e testes atualizados.
- **`sendDailyLogReminder` reescrito**: em vez de multicast cego pra todos os tokens, agora agrupa por usuário, personaliza com nome do perfil (batch `getAll`), sorteia entre 12 mensagens diferentes e limpa tokens stale por usuário (mesmo padrão do `sendPushToUser`).
- **`generateRecurrences`**: push title "Despesa Fixa" → "Conta recorrente".
- Duas auditorias de offline-first com agentes confirmaram zero violações nas 6 novas features e na unificação.
- **`budgetAlerts`**: formatação de dinheiro trocada de manual (`.toFixed(2).replace`) pra `formatBRL`.
- **Deploy**: 11 functions atualizadas em produção (`closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendDailyLogReminder`, `sendBudgetAlerts`, `financialAssistantChat` + billing/admin).

## 2026-07-14 — Unificação Compromissos + Despesas Fixas → "Contas a Pagar"

- **Tela unificada**: "Compromissos" e "Despesas Fixas" viram uma tela só — **Contas a Pagar** (`/app/bills`). Cada conta pode ser avulsa ou recorrente (toggle "Se repete"), com valor fixo ou variável (campo opcional).
- **Valor variável**: se a conta recorrente não tem valor definido (ex.: luz, água), a Cloud Function `generateRecurrences` agora cria um Bill pendente em vez de pular — o usuário preenche o valor quando chegar.
- **Novas funções**: `updateRecurringRule()` e `deleteRecurringRule()` (soft-delete via `isActive: false`) no `financeService.ts`.
- **Navegação**: link "Despesas Fixas" removido da sidebar e menu mobile. Rota `/app/recurring` removida.
- **Dashboard**: label unificado — ambos os tipos viram "Conta".
- **Deploy**: `functions` redeployado com a branch nova no `generateRecurrences`.

## 2026-07-14 — 5 novas features: Patrimônio, Fluxo de Caixa, YoY, Resumo Anual e Alertas de Orçamento

- **Patrimônio Líquido** (`/app/net-worth`): nova página com hero card, KPI strip (ativos/passivos), breakdown por tipo de conta, gráfico de linha com 12 meses de histórico. Cálculo = saldo das contas − faturas em aberto − contas a pagar.
- **Projeção de Fluxo de Caixa**: nova seção no Dashboard com saldo previsto dia a dia (30/60/90 dias), gráfico de linha e timeline de eventos colapsável. Projeta contas, recorrências, faturas e recebimento (via payday).
- **Comparação Ano contra Ano**: toggle na Análise alterna entre "vs. mês anterior" e "vs. mesmo mês ano passado".
- **Resumo Anual**: BottomSheet acessível pela Análise (ícone calendário) com taxa de poupança, KPI strip (entradas/saídas), melhor/pior mês, top 5 categorias, gráfico de barras mensal e year picker.
- **Alertas de Orçamento**: banner no Dashboard avisa quando categoria atinge 80% (amarelo) ou 100%+ (vermelho) do limite. Dismiss por localStorage. Cloud Function `sendBudgetAlerts` (10h BRT) envia push notification com os mesmos thresholds, usando subcoleção `budgetAlertState` pra não repetir alerta no mesmo mês.
- **Navegação**: link "Patrimônio" (TrendingUp) adicionado à sidebar e menu mobile.
- 307 testes (eram 276; +31), typecheck e build limpos.

## 2026-07-14 — 12 temas do Plantao + FAB adaptativo + avatares offline

- **12 temas portados do Plantao**: 6 claros (Paper, Pérola, Floresta, Lavanda, Rosa, Areia) e 6 escuros (Noturno, Carbono, Cobalto, Ametista, Grafite, Vinho). Substituem Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- **FAB e amount-hero adaptam ao tema**: `--gradient-brand` e sombras do FAB saem do bloco compartilhado e vão pra cada tema individual. Botão laranja de lançar transação agora reflete a cor do tema ativo.
- **Seletor agrupado claro/escuro**: `AppearanceSettingsPage` divide os temas em duas seções ("Claros" / "Escuros"), igual ao Plantao.
- **Avatares offline**: `.jpg` adicionado aos `globPatterns` do PWA — as 24 fotos agora são precacheadas.
- **Push notifications com app fechado**: `firebase-messaging-sw.js` registrado explicitamente com `serviceWorkerRegistration` no `getToken()`.
- **Auditoria offline (6 agentes)**: boot timeout 2.5s em 4 hooks, `subscribeWithTransientRetry` ignora `unavailable`, `profileLoading` sempre desbloqueia, `RootRoute` mostra loading em vez de tela branca, perfil `onSnapshot` com `includeMetadataChanges`.

## 2026-07-14 — Auditoria offline (6 agentes) + push notifications + Grazi deploy

- **Auditoria offline com 6 agentes**: ~100 arquivos analisados em paralelo. Corrigido: boot timeout de 2.5s em 4 hooks (`useCardsData`, `useGoalsData`, `useSharedWorkspaceData`, `useCoupleSavings`), `subscribeWithTransientRetry` ignora `unavailable` (SDK retenta sozinho), `profileLoading` sempre desbloqueia após timeout, `RootRoute` mostra "Carregando..." em vez de tela branca, perfil `onSnapshot` ganhou `includeMetadataChanges: true`, `createCardPurchase` com `.catch()`.
- **Push notifications com app fechado**: `firebase-messaging-sw.js` agora é registrado explicitamente e passado via `serviceWorkerRegistration` pro `getToken()`. Antes o SW do VitePWA roubava o lugar e notificações em background nunca chegavam.
- **Grazi**: build das functions + deploy (system prompt atualizado com 11 regras, contexto expandido pra 9 seções, bugs de auditoria corrigidos).

## 2026-07-14 — Offline: sessão mantida sem internet + avatar otimista + dashboard sem flash

- **Offline não desloga mais**: `finishBoot` no `AuthContext` agora rejeita `onAuthStateChanged(null)` quando há perfil em cache. Antes, Firebase Auth disparava null ao falhar renovação de token offline → user/profile zerados → redirect pra /login → todos os dados sumiam da tela.
- **Avatar com estado otimista**: `AppearanceSettingsPage` reflete a seleção imediatamente (`optimisticAvatarId`), sem esperar o `onSnapshot` do perfil. No mobile a latência dava impressão de "não foi".
- **Dashboard sem flash de empty state**: seções de gastos, compromissos e transações recentes não mostram mais `EmptyState` durante o loading (~200ms). Só renderizam quando o carregamento termina e realmente não há dados.
- **Arquivos da sessão anterior commitados**: avatares JPG em `public/avatars/`, `firestore.rules` com `validAvatarStyle()`, sidebar com scroll, reset de `button/input/select/textarea` no `global.css`.

## 2026-07-14 — Grazi expandida: 6 novos contextos + auditoria

- **Contexto expandido de 3 para 9 seções**: SEU CICLO (payday/availableMode), TENDENCIA (6 meses), ORCAMENTOS (limites com %), METAS (progresso), CASAL (cofrinhos do parceiro). GASTOS POR LUGAR considerado e removido (campo merchant escondido em "Mais detalhes", sem normalização = inútil).
- **Performance**: 2 queries por conta eliminadas (filtro em memória reaproveitando transações), `limit(2000)` na query de transações.
- **Bugs corrigidos**: `sanitize(undefined)` crash se doc sem nome, `amountCents` podia virar NaN, `savedCents` undefined produzia NaN%, `createdAt` sobrescrito no rate limit (agora `updatedAt`), `Timestamp` import não usado, `GoalData.dueDate` não usado removido.
- **System prompt**: de 9 para 11 regras, limite de contexto 3000 → 5000 chars.
- **Testes**: 8 novos (payday, budgets, goals, trend, couple, missing profile, missing couple, couple sem workspace). 35 funções + 276 app + 49 rules = 360 passando.
- Auditoria completa com agente: zero vulnerabilidades de segurança, regras do Firestore já cobrem todas as novas leituras. Detalhes em `docs/history/2026-07.md`.

## 2026-07-14 — App 100% offline (auditoria + correção de 11 funções)

- **Auditoria completa de offline-first**: todos os `await` em escritas no Firestore, `getDocs`/`getDoc` que falham sem cache, componentes com "Carregando..." que nunca resolvem offline. 2 agentes fizeram a auditoria e revisaram as decisões.
- **8 escritas convertidas para `fireWrite`**: `createAccount`, `createTransaction`, `createGoal`, `contributeToGoal`, `updateTransaction`, `coupleGoalDeposit`, `coupleGoalWithdrawal`, `ensureDefaultCategories` — todas estavam com `await` e travavam forms/sheets offline.
- **`useFinanceData`**: timeout de 2.5s por slice (`SLICE_BOOT_TIMEOUT_MS`) — se `onSnapshot` não disparar (cache vazio + offline), assume `[]` e destrava o loading. Antes, bastava UMA coleção sem cache pra dashboard ficar presa em "Carregando..." pra sempre.
- **Dashboard "disponível por dia"**: agora usa `cachedSummary.freeToSpendCents` como fallback enquanto carrega, em vez de mostrar "Carregando...".
- **Dead code removido**: `waitForLocalWrite()` + `Promise.race` em `NewTransactionPage`/`EditTransactionPage` (já eram inúteis — `createCardPurchase` já usava `fireWrite`). `.catch()` mortos em `CoupleSavingsSection`.
- **2 correções extras**: `updateAvatarStyle` e `syncAppearanceForUser` convertidas pra `fireWrite`.
- 276 testes unitários + 49 testes de regra (emuladores) + typecheck + build limpos. Detalhes da auditoria em `docs/history/2026-07.md`.

## 2026-07-14 — Redesign dos avatares (+ bug de permissão nunca funcionou) e polimento da sidebar

- **Avatares redesenhados**: os 12 rostinhos SVG desenhados à mão (`src/profile/avatarCatalog.tsx`) foram trocados por retratos recortados de um asset comprado no Adobe Stock (licença comercial confirmada pelo dono, `AdobeStock_420429519`, grid 16×6 de 96 retratos — grid detectado por análise de pixel, 12 recortados/redimensionados pra 256×256 JPEG). Uma primeira tentativa gerou avatares com o estilo open-source "Personas" (DiceBear) antes do dono pedir pra usar essa imagem própria em vez disso — infra do DiceBear (`@dicebear/*`, `scripts/generate-avatars.mjs`) removida. Arquivos estáticos em `public/avatars/*.jpg`, mesmos 12 `id`/rótulo de antes (sem migração de dado). Proveniência em `public/avatars/SOURCES.md`.
- **Bug real encontrado ao verificar ao vivo**: escolher um avatar sempre falhava silenciosamente — `firestore.rules` nunca permitiu o campo `avatarStyle` na regra de update do perfil (`onlyAppearanceChanged()`), então todo `updateDoc` voltava `permission-denied` do servidor. Mesmo padrão dos 2 incidentes anteriores documentados no `CLAUDE.md` (campo novo em payload sem atualizar a regra no mesmo commit). Corrigido: `avatarStyle` adicionado ao `hasOnly` + `validAvatarStyle()` valida contra os 12 ids válidos. Deploy publicado (`firebase deploy --only firestore:rules`) e confirmado ao vivo (seleção sobrevive a reload).
- De quebra, `AppearanceSettingsPage.handleAvatarChange` parou de dar `await` no write (violava a regra de offline-first) e passou a mostrar erro via `FormMessage` em vez de engolir silenciosamente.
- Teste de regressão em `tests/firestore.rules.test.ts`. 276 testes unitários + 49 de regra, typecheck e build limpos. Ver `docs/history/2026-07.md` para detalhe da escolha de estilo.
- **Mesma sessão, dono pediu ajuste**: rótulos trocados de adjetivo de personalidade ("Esperto",
  "Focado"...) pra nomes próprios (Ana, Bruno, Carla...) e catálogo expandido de 12 pra 24
  avatares — mais variedade de cor de cabelo/pele/acessório, escolhida à mão pra evitar
  repetir demais o cabelo ruivo (predominante no asset de origem). `validAvatarStyle()` e
  `tests/firestore.rules.test.ts` atualizados pros 24 ids novos, regra redeployada com
  autorização explícita do dono (2ª vez na mesma sessão — cada deploy pedido de novo, sem
  generalizar a autorização anterior). Também corrigido um recorte com margem grande demais
  que deixava um anel branco visível atrás do círculo no tema escuro — `.avatar-picker__svg-wrap`
  nunca tinha `border-radius`/`overflow:hidden` (só o avatar do header tinha).
- **Rótulos removidos de vez**: dono pediu pra tirar o nome de baixo de cada avatar na grade —
  agora é só a foto, com `aria-label="Avatar N"` numerado (não o nome) pra acessibilidade.
- **Bug real na sidebar, achado por print do dono**: `.sidebar` tem `height: 100vh` fixo sem
  `overflow`, e o menu cresceu pra 17 itens (10 links + 4 de conta + rodapé) — em tela mais
  baixa o conteúdo não cabia e o botão "Sair" podia ficar inacessível. Corrigido com
  `overflow-y: auto` + scrollbar escondida (`scrollbar-width: none` etc.). De quebra: nome do
  usuário movido do rodapé pro topo (embaixo da logo), e os dois botões de logout ("Sair" /
  "Sair deste aparelho" — **não eram equivalentes**, o segundo também limpava o cache local do
  Firestore) fundidos num só "Sair" que sempre faz a limpeza completa, com aviso no diálogo de
  confirmação sobre perder alterações offline não sincronizadas. Ver `docs/history/2026-07.md`
  para a investigação completa.
- **Espaçamento apertado corrigido** em telas com label + chips de filtro + lista (Compromissos,
  Despesas Fixas): `.eyebrow`/`.chip-row` não tinham margem própria quando filhos diretos de
  `.surface-pad`. Fix escopado (`.surface-pad > .eyebrow`, `.surface-pad > .chip-row`) pra não
  afetar os chip-rows que já viviam dentro de `.field` (com espaçamento próprio).

## 2026-07-13 — Grazi: rewrite do contexto financeiro + rename Recorrências → Despesas Fixas

- **Grazi agora vê tudo que o Dashboard vê**: `buildFinancialContext` reescrito para incluir despesas fixas (`recurring`), faturas de cartão (`cards/*/invoices`), bills vencidas (`overdue`), saldo individual por conta, e total "Comprometido" calculado (contas + despesas fixas + faturas). O contexto inclui seções RESÚMO, GASTOS POR CATEGORIA e COMPROMETIDO com quebra por tipo.
- **Antes**: Grazi só via transactions (`expense`/`card_purchase`) + bills `pending` 7 dias + nomes de contas. **Agora**: vê recorrências ativas (próx. ocorrência), faturas com saldo devedor (open/closed/overdue/partial), bills pending+overdue 30 dias, saldo das contas (abertura + transações), receitas do mês, e total livre para gastar.
- **Prompt atualizado**: regra #3 explícita para usar a seção COMPROMETIDO e nunca dizer "não tem nada" se houver itens listados.
- **Rename "Recorrências" → "Despesas Fixas"**: textos de UI (nav, página, Dashboard, Análise, Welcome Tour, push notification) atualizados. Identificadores de código (`RecurringRule`, `recurringRules`, rota `/app/recurring`) mantidos.
- 28 testes functions (4 novos: overdue bills, despesas fixas, total comprometido, saldo conta), 276 client, typecheck/build limpos. Deployado.

## 2026-07-13 — fix: regras de orçamento e reconciliação finalmente deployadas + UX de descoberta do limite por categoria

- **Deploy pendente resolvido:** as regras do Firestore para orçamento por categoria
  (item 7) e reconciliação "conferido" (item 9) estavam commitadas desde a sessão
  anterior mas nunca publicadas em produção (ver avisos ⚠️ mais abaixo neste arquivo,
  "commit local apenas"). Rodado agora: `npx firebase deploy --only firestore:rules
  --project zerou-26757`. Confirmado ao vivo, numa conta de teste: criar um orçamento
  antes era rejeitado silenciosamente pelo servidor (`permission-denied`, mascarado
  pelo padrão fire-and-forget — a UI deixava digitar e fechar normalmente sem indicar
  erro nenhum); depois do deploy, criar/editar/remover orçamento persiste de verdade.
- **UX: descoberta do limite por categoria** (`SearchPage.tsx`): o único ponto de
  entrada da feature era um ícone de engrenagem genérico no cabeçalho da Análise,
  sem rótulo visível — indistinguível de "configurações do app", achado só por acaso.
  Trocado por um ícone de alvo (`Target`, mais associado a "limite/meta" em apps
  financeiros) com `aria-label`/`title` explícitos. Adicionado também um aviso
  contextual dentro do card "Por categoria" — some sozinho assim que o primeiro
  orçamento existir — convidando a definir um limite (ex.: "até R$100 em Doces
  por mês").
- 276 testes unitários, typecheck e build limpos.

## 2026-07-13 — fix: bugs da Grazi encontrados em investigação com 7 agentes

- **7 agentes em 3 rodadas** (Explore, security, QA, produção, regressão) acharam bugs na Fase 1. Corrigidos todos os críticos/altos:
- **card_purchase invisível**: `buildFinancialContext` só contava `type: 'expense'`, ignorava `card_purchase` — quem só usa cartão via "R$ 0,00" de gasto.
- **BRT timezone**: `buildFinancialContext` usava `new Date()` (UTC), não `nowInBRT()`. 3h por mês com dados errados (21h-00h BRT no último dia do mês).
- **Rate limit**: contador era incrementado ANTES do DeepSeek — cada falha de API queimava cota. Movido pra depois do sucesso; pre-check de limite mantido.
- **Validação de input**: `history` sem validação permitia injeção de role `system`, strings gigantes, e crash com `history` não-array. `workspaceId` com whitespace passava. `request.data` undefined crashava. Tudo validado agora com `validateHistory()` + trim + guard.
- **`??` vs `||`**: `competenceMonth`/`categoryId` com string vazia não caía no fallback com `??`. Trocado por `||` + `cashMonth`.
- **Null dueDate**: uma bill sem `dueDate` derrubava `buildFinancialContext` inteiro. Tratamento defensivo com skip + `isNaN`.
- **Timeout DeepSeek**: 15s → 45s. API key validation adicionada. Retry único pra 429/503.
- 24 testes functions, 276 client, typecheck/build limpos. Deployado.

## 2026-07-13 — feat: assistente de IA financeiro (Fase 1)

- **Nova Cloud Function `financialAssistantChat`** (`functions/src/ai/`) — assistente de IA via DeepSeek (`deepseek-chat`) que responde perguntas sobre os gastos do usuário com base nos dados reais do workspace. Prompt de sistema em português, contexto financeiro agregado (gasto por categoria, top 5, contas próximas, saldos), rate limit de 60 msgs/dia por workspace.
- **Nova página `AssistantPage`** (`/app/assistant`) — chat com bolhas, sugestões iniciais, loading e tratamento de erro. Navegação na sidebar e menu mobile (ícone Bot, posição após "Compartilhado").
- **Cliente DeepSeek isolado** (`callDeepSeek`, JSON mode, timeout 15s, secret `DEEPSEEK_API_KEY`) + **verificador de membership** (`verifyWorkspaceMembership`) + **agregador de contexto** (`buildFinancialContext`).
- **Secret `DEEPSEEK_API_KEY` configurado** no Firebase. Nenhuma chave vaza pro bundle client (verificado em `dist/`).
- Testes unitários de `buildFinancialContext` (4 casos: gastos com categoria, transações excluídas ignoradas, contas próximas, workspace vazio) e `verifyWorkspaceMembership` (4 casos: membro ativo, não-membro, status não-ativo, dados nulos). Typecheck, 276 testes, 48 regras, build client + functions limpos.

## 2026-07-13 — fix: exclusão de conta apagava dados mas não excluía o login de verdade

- **Bug real, achado pelo dono e verificado ao vivo:** `onDeleteAccount` (`LoginMethodsPage.tsx`)
  apagava todos os dados do Firestore **antes** de tentar deletar o usuário do Firebase
  Auth, sem reautenticar. `deleteUser()` exige sessão recente e quase sempre falhava com
  `auth/requires-recent-login` — mas só depois que os dados já tinham sumido. A sessão do
  Firebase Auth continuava válida, e a pessoa caía em `/app/onboarding` como se fosse conta
  nova, sem precisar logar de novo — **a conta nunca era excluída de verdade, só os dados**.
- **Correção:** nova função `runAccountDeletion` (`accountDeletionService.ts`) reautentica
  (Google ou senha) **antes** de apagar qualquer dado. Reautenticação falhou → nada é
  apagado. Exclusão do Auth falha mesmo assim (janela residual menor) → força `logout()`
  antes de propagar o erro, nunca mais deixa sessão zumbi.
- **Verificado ao vivo de ponta a ponta** com conta de teste real: exclusão vai pra landing
  (não mais onboarding), `/app` redireciona pra login, login com a mesma senha depois falha
  (usuário do Auth realmente deletado). 5 testes de regressão novos. Typecheck, 276 testes,
  build limpos. Não toca `firestore.rules`.

## 2026-07-13 — fix: orçamento não sincronizava após a 1ª edição + remove orçamento + backlog revisado

- **Bug real corrigido:** `createOrUpdateBudget` reenviava `createdAt` (novo, via
  `serverTimestamp()`) em todo `setDoc`, tanto na criação quanto numa edição
  posterior. `validBudgetUpdate` exige `createdAt` igual ao do documento existente —
  toda edição de um orçamento já criado era **rejeitada pelo servidor
  silenciosamente** (fire-and-forget engolia o erro; a UI mostrava o valor novo por
  um instante e revertia sem aviso). Confirmado com teste de regra reproduzindo o
  payload real do cliente antes da correção.
- **Correção:** `createBudget` (só na criação) separado de `updateBudgetLimit`
  (`updateDoc` parcial, só `limitCents`/`isActive`/`updatedAt`) — mesmo padrão de
  `createCategory`/`updateCategory`. Teste de regressão em
  `tests/firestore.rules.test.ts` documentando por que as duas funções não podem
  virar uma "createOrUpdate" de novo.
- **`deleteBudget`** + botão de remover na tela de Orçamentos (Análise) — antes só
  dava pra criar/editar, não pra tirar.
- **Barra de orçamento na Análise:** o marcador de limite ficava sempre colado na
  borda direita (nunca se movia). Reescalado pra 0-150% do orçamento — o marcador
  agora fica numa posição fixa significativa e a barra pode ultrapassá-lo pra
  mostrar o estouro.
- **Backlog revisado** (`docs/SUGESTOES_FEATURES_2026-07-12.md`): itens 8
  (importação OFX/CSV), 10 (split de conta entre amigos) e 11 (modo escuro
  agendado) removidos a pedido do dono — decisão de produto, não recolocar sem
  pedido explícito.
- **Convenção nova:** arquivos `*.local.md` (gitignorados) para docs que nunca
  devem ser commitadas — primeiro uso: `TEST_ACCOUNTS.local.md` com credenciais de
  contas de teste, referenciado no mapa de contexto do `CLAUDE.md`.
- Typecheck, 271 testes unitários, 48 testes de regra e build limpos.

## 2026-07-13 — feat: reconciliação "conferido" nas transações

- **Novo campo `reconciledAt?: Timestamp` em `Transaction`** (`contracts.ts`): marca quando
  a transação foi conferida contra extrato. Checkbox manual — sem integração com
  importação ainda (item 8 bloqueado).
- **`toggleTransactionReconciled`** (`financeService.ts`): `updateDoc` com
  `reconciledAt: serverTimestamp() | deleteField()`, fire-and-forget. Inclui
  `updatedAt: serverTimestamp()` para passar na regra.
- **`firestore.rules`**: `reconciledAt` adicionado a `validTransactionUpdate.hasOnly`
  com validação condicional `is timestamp`. **Não** adicionado a `validTransactionCreate`
  (reconciliação só depois de existir). `npm run test:rules` passa (47 testes).
- **Teste de regra** (`firestore.rules.test.ts`): verifica que `reconciledAt` no
  create é rejeitado (não está no `hasOnly`).
- **Ícone de check em cada transação** (`TransactionsPage`): botão verde (`--success`)
  quando conferido, cinza padrão quando não. Clique alterna reconciliação.
- **Filtro "Não conferidos"**: chip toggle filtra transações sem `reconciledAt`,
  client-side.
- Typecheck, 271 testes unitários, 47 testes de regras e build limpos.
- **⚠️ Esta feature tocou `firestore.rules`** — deploy da regra só com autorização
  explícita do dono.

## 2026-07-13 — feat: orçamento mensal por categoria (maior feature do backlog)

- **Novo tipo `Budget`** (`contracts.ts`): `id === categoryId` (determinístico), `limitCents`,
  `isActive`, `createdBy`. Um orçamento por categoria, recorrente todo mês até ser mudado.
- **`createOrUpdateBudget` + `subscribeBudgets`** (`financeService.ts`): fire-and-forget
  com `setDoc` (id determinístico = categoria), snapshot sem `orderBy` (padrão de
  `subscribeGoals`). Coleção `'budgets'` adicionada a `FinancialCollectionName`.
- **`useFinanceData`** ganhou slice `budgets`: integrado ao `FinanceDataState`,
  `REQUIRED_SLICES`, array de unsubscribers e `pendingWrites`. Mock atualizado no teste.
- **`firestore.rules`**: `validBudgetCreate` (exige categoria existente via `exists(...)`,
  `id == categoryId`, `createdBy == request.auth.uid`) + `validBudgetUpdate` (só
  `limitCents`/`isActive`/`updatedAt` mutáveis). Match block completo com read/create/
  update/delete. **`npm run test:rules` passa (46 testes)**.
- **Testes de regra** (`firestore.rules.test.ts`): `budgetPayload` helper + caso
  `validates budget documents` — cria orçamento válido, atualiza limite, rejeita
  campo travado, rejeita `createdBy` forjado, rejeita categoria inexistente.
- **Barra de orçamento na Análise** (`SearchPage`): `spendingByCategory` agora inclui
  `categoryId`; legenda de categorias cruza com `budgetByCategoryId` e colore a barra:
  verde (`--success`) < 80%, amarela (`--warning`) 80-100%, vermelha (`--danger`) > 100%.
  Valor mostra "gasto / limite" quando há orçamento.
- **Sheet de configuração** (`SearchPage`): botão Settings no cabeçalho abre
  `BottomSheet` com input de valor por categoria de despesa; `onBlur` grava via
  `createOrUpdateBudget` (fire-and-forget). Valores inicializados do Firestore ao abrir.
- **Dashboard fora do escopo do v1** — só a Análise mostra orçamento por decisão de
  produto documentada.
- Typecheck, 271 testes unitários, 46 testes de regras e build limpos.
- **⚠️ Esta feature tocou `firestore.rules`** — deploy da regra só com autorização
  explícita do dono (commit local apenas).

## 2026-07-13 — feat: tags com chips visuais + filtro por tag nas Transações

- **Novo componente `TagInput`** (`src/components/TagInput.tsx`): substitui o campo de
  texto livre separado por vírgula por chips visuais — Enter ou vírgula adiciona um chip,
  Backspace no campo vazio remove o último chip, clique no X remove um chip específico.
  Normaliza tags (trim + lowercase) e evita duplicatas por capitalização.
- **Integrado em `NewTransactionPage` e `EditTransactionPage`**: ambos trocaram o
  `<input>` de texto por `<TagInput>`. Estado interno mudou de `string` (separado por
  vírgula) para `string[]` — o payload do Firestore já era `string[]`, sem mudança de
  schema.
- **Filtro por tag em `TransactionsPage`**: chips das tags únicas encontradas nas
  transações ativas, multi-seleção (OR entre tags), filtro client-side integrado ao
  `useMemo` de `visibleTransactions`.
- **CSS do `TagInput`** em `global.css`: container com borda e foco estilizado, campo
  interno sem borda, botão de remover com hover `--danger`. Reaproveita a classe `.chip`
  existente para os chips.
- Sem mudança no Firestore nem em `firestore.rules` — `validTags()` já cobria o array
  como estava.
- Typecheck, 271 testes e build limpos.

## 2026-07-13 — feat: pagamento de compromisso com descrição e categoria editáveis

- **Sheet "Confirmar pagamento" agora tem campos de descrição e categoria** (`BillsPage`):
  além de valor e conta (que já existiam), é possível mudar a descrição (ex.: compromisso
  genérico "Contas do mês" pago como "Luz") e a categoria antes de confirmar. Campos vêm
  pré-preenchidos com os valores do compromisso original.
- **`payBill` (`financeService.ts`) aceita `description` e `categoryId` como overrides
  opcionais** em `opts` — sem mudar o contrato existente, quem chama sem esses campos
  continua funcionando igual (usa os valores do compromisso).
- **`CategoryField` reutilizado no sheet** (já era importado na página) — mesma
  experiência de criar/editar/excluir categoria inline que o form de criação de
  compromisso já oferece.
- Sem mudança no Firestore nem em `firestore.rules` — o payload da transação gerada
  (`validTransactionCreate`) já aceita qualquer `categoryId`/`description`.
- Typecheck, 271 testes e build limpos.

## 2026-07-13 — feat: widget "quanto posso gastar por dia" no Dashboard

- **Valor por dia no card "Disponível"**: substitui "Livre agora." por
  "≈ R$ X,XX/dia até {data}" quando há saldo disponível e data de corte resolvida
  (receita futura, próximo recebimento ou janela de dias). Cálculo: `freeToSpendCents /
  daysUntilCutoff`, arredondado pra baixo.
- **Casos de borda**: saldo negativo ou zero mostra "Você já comprometeu tudo que tem
  disponível."; loading mostra "Carregando..."; sem `committedCutoff` mantém "Livre
  agora." (fallback).
- Reaproveita 100% de dado já calculado (`dashboard.freeToSpendCents` +
  `dashboard.committedCutoff`) — sem nova leitura do Firestore.
- Typecheck, 271 testes e build limpos.

## 2026-07-13 — feat: exportar transações do mês em CSV

- **Novo módulo `src/finance/csvExport.ts`**: funções puras `transactionsToCsv` e
  `downloadCsv`, sem dependência de Firebase/React. Delimitador `;` (ponto e vírgula)
  para compatibilidade com Excel brasileiro, valores em formato `1234,56` (vírgula
  decimal, sem `R$`), BOM UTF-8 no início do arquivo para acentos abrirem corretos
  no Excel do Windows.
- **Colunas**: Data, Tipo, Descrição, Categoria, Conta, Valor, Tags. Categoria e Conta
  resolvidas via `Map` (mesmo padrão da Análise). Tipo usa `transactionTypeLabels`.
- **Testes unitários** (`csvExport.test.ts`, 9 casos): BOM, delimitador, formato
  brasileiro, valores negativos, escape de campos com `;`/`"`, acentos, lista vazia.
- **Botão Download no cabeçalho da Análise** (`SearchPage`): ícone ao lado da lupa,
  exporta as transações do `selectedMonth` atual (filtradas por `!deletedAt` +
  `cashMonth || competenceMonth`). Arquivo: `granativa-YYYY-MM.csv`.
- Exporta o valor bruto da transação (`amountCents`), não a visão diluída por
  parcela do regime de caixa — limitação documentada no código.
- Sem mudança no Firestore nem em `firestore.rules`.
- Typecheck, 271 testes (28 arquivos) e build limpos.

## 2026-07-13 — feat: meta com data-limite visível no card

- **Prazo da meta agora aparece no card** (`GoalsPage`): linha abaixo da barra de
  progresso mostra "Até {data}" quando falta mais de 7 dias, com destaque `--warning`
  quando faltam 7 dias ou menos, e "Atrasada — venceu {data}" em `--danger` quando o
  prazo já passou. Meta concluída não mostra prazo (já exibe "concluída").
- Usa `differenceInCalendarDays` do date-fns (já era dependência do projeto) +
  `formatFriendlyDate` (helper existente). Campo `Goal.dueDate` já existia no tipo e
  na regra do Firestore — nenhuma mudança de schema ou regra.
- CSS mínimo: `.goal-card-due` com fonte 0.82rem e margem superior de 0.25rem.
- Typecheck, 261 testes e build limpos.

## 2026-07-13 — feat: filtro por status nos Compromissos

- **Chips de filtro em `BillsPage`**: botões "Todos", "Pendentes", "Vencidos", "Pagos"
  entre o cabeçalho "Lista" e a lista de compromissos — mesmo padrão de `chip-row` já
  usado nos filtros de tipo das Transações.
- **Filtro 100% client-side** (`useMemo` sobre `finance.bills`): sem chamada de rede,
  reage instantaneamente à troca de chip e a bills que viram `overdue` automaticamente
  (via `markOverdueBills`, já existente).
- **EmptyState com `illustration="bills"`** (ilustração de calendário+check, já existia
  mas nunca era usada nesta página — antes usava `wallet`): variante `compact` para
  "Nenhum resultado" (filtro sem match) e variante normal para "Nenhum compromisso
  ainda" (lista vazia de verdade).
- Sem mudança no Firestore nem em `firestore.rules`.
- Typecheck, 261 testes e build limpos.

## 2026-07-13 — fix: 2 bugs de CSS achados testando a tela nova (dinheiro colado no texto + resumo ilegível no mobile)

- **`.notice` estava com `display: flex` sem `flex-wrap` vazando de uma regra morta**
  (`global.css`): `.entitlement-list li, .notice { display: flex; ... }` — `entitlement-list`
  é da feature de billing (inativa) e não existe em nenhum `.tsx`, mas o `.notice`
  agrupado na mesma regra é usado em 7 lugares vivos do app. Qualquer `.notice` com
  texto misturado a `<strong>` (como o resumo do formulário de compra parcelada)
  virava uma fileira de itens de flex sem quebra, cortando texto e empilhando pedaços
  fora de ordem. `.notice` removido do agrupamento — a regra base (borda/padding,
  sem flex) volta a valer sozinha.
- **"Fatura atual" (`CardDetailPage`) mostrava o valor colado no texto seguinte**
  (`R$ 3.200,002026-07 · em aberto...`, sem espaço): o `<strong>` do valor e o
  `<span className="text-secondary">` do texto secundário são elementos inline sem
  quebra entre eles — diferente do resto do app, que usa `.list-row` (que já empilha
  texto por regra global). Essa seção usa `<div>` com estilo próprio, fora desse
  padrão. `display: 'block'` adicionado ao `<strong>`.
- Verificado ao vivo no navegador em viewport mobile (375px): os dois pontos
  reproduzidos antes do fix e confirmados corrigidos depois. Checados os outros
  lugares que usam o mesmo par `<strong>`+`<span className="text-secondary">` —
  todos os demais já estão dentro de `.list-row` ou têm CSS próprio de grid/flex
  intencional (`.dash-metric`, `.anticipation-group-head`), únicos os dois corrigidos.
- Typecheck, 261 testes e build limpos.

## 2026-07-13 — feat: formulário de "compra parcelada que já começou" simplificado

- Feedback direto do dono usando a própria tela: pra lançar uma compra parcelada que já
  estava rolando, o formulário pedia "próxima parcela é a Nº de M" (dois números fáceis
  de trocar) + "em qual mês essa parcela cai na fatura" — a última exige olhar o extrato
  do banco, informação que ninguém sabe de cabeça.
- Trocado por "quando você comprou" (date picker, igual o de compra nova) + "total de
  parcelas" + "quantas já pagou". O mês da próxima parcela deixou de ser perguntado e
  passou a ser **calculado** (`resolveInstallmentCycle`, a mesma função que já resolve
  compra nova, usando o fechamento/vencimento já cadastrados do cartão) — só aparece no
  resumo pra confirmar, não é mais um campo cru. `OngoingInstallmentsSheet` passou a
  receber o cartão inteiro em vez de só o id, pra ter `closingDay`/`dueDay` no cálculo.
- Verificado ao vivo: compra em 15/mar num cartão que fecha dia 10 (1ª parcela cai em
  abril), 10 parcelas, 6 já pagas → calculou sozinho "próxima (7/10) cai na fatura de
  outubro/2026", 4 parcelas restantes somando R$600 — bate com a conta manual.
- 261 testes, typecheck e build limpos. Sem mudança de regra/schema — só o formulário e
  o cálculo que já preenchia o campo que sumiu.

## 2026-07-12 — fix: 13 bugs de uma varredura de investigação (casal, cartão, Análise)

- Investigação por 4 agentes achou 20 bugs (`docs/BUGS_INVESTIGACAO_2026-07-12.md`);
  18 confirmados reais, 2 descartados (contrariavam a arquitetura offline-first do
  projeto ou eram limitação de modelagem, não bug). 13 corrigidos
  (`docs/CORRECAO_BUGS_2026-07-12.md`): erro engolido nas escritas do espaço a dois
  (`fireWrite`), status de fatura travado após reconciliação manual, dupla
  antecipação de parcela por falta de idempotência, guardar/resgatar do cofrinho
  não-atômico entre workspace do casal e pessoal, status `overdue` de fatura nunca
  produzido, Análise ignorando `refund`/`reimbursement`/`adjustment`, entre outros.
  Zero mudança em `firestore.rules`.
- Revisão de código da própria correção (feita porque o dispatch de subagentes
  falhou no ambiente, revisão manual direto no diff) achou 2 fixes incompletos:
  o do erro engolido só cobria 2 das 5 funções afetadas (as outras 3 são de uma
  feature "acerto de contas" sem UI ainda, sem sintoma hoje mas armadilha pra
  quando for construída), e o da Análise só corrigia o total do mês, não o
  detalhamento por categoria. Ambos completados; 2 funções que ficaram sem
  nenhum caller (`addGoalContribution`/`withdrawGoalContribution`) removidas.
- 261 testes (3 novos), typecheck e build limpos.

## 2026-07-12 — fix: spread frágil na saída do espaço a dois + bills viram "vencido" sozinhas

- Análise de arquitetura feita junto com outra IA (Deepseek — ver `docs/ANALISE_PROJETO_2026-07-12.md`) revisada ponto a ponto contra o código antes de implementar; dois achados de baixo risco/alto valor foram aplicados, um terceiro (apertar a regra de exclusão de conta pra `canDeleteWorkspaceTree`) foi descartado depois de achar que qualquer membro ativo pode excluir a própria conta hoje pela UI — apertar a regra quebraria isso silenciosamente pro parceiro não-dono, o mesmo padrão de bug que este projeto já sofreu 3 vezes.
- `accountDeletionService.ts` (`leavePartnerWorkspace`): trocado o `{...workspaceRefData, status, updatedAt}` por objeto explícito `{status, updatedAt}` — a pendência que estava documentada no `CLAUDE.md`.
- `markOverdueBills` (`financeService.ts`) roda a cada snapshot de `subscribeBills` e marca `pending → overdue` (fire-and-forget) toda bill com vencimento em dia anterior a hoje; regra do Firestore já aceitava o valor, não precisou mudar. `BillsPage` ganhou os botões "Pago"/"Cancelar" também pra bills `overdue` (antes só apareciam pra `pending` — a marcação automática ia esconder a ação de pagar uma conta vencida).
- 258 testes (2 novos, cobrindo os limites de `markOverdueBills`: dia de vencimento vs hoje vs futuro, e os 3 status que não devem disparar escrita), typecheck e build limpos. Sem mudança de regra do Firestore.

## 2026-07-12 — fix: número da parcela antecipada some no caminho, "Parcela antecipada" ficava genérica

- Ao antecipar, o número da parcela (8/10, 5/5...) era descartado antes de gravar no ledger — nem o débito (fatura de origem) nem o crédito (fatura de destino) guardavam qual parcela era. Combinado com o fix anterior (parcela antecipada some da fatura futura), isso dava a impressão de que sobravam parcelas: a última visível de uma compra em 10x parava em "7/10" sem nenhuma pista de que 8, 9 e 10 foram antecipadas — parecia fatura incompleta, não paga adiantado.
- `anticipateInstallmentsSchema` ganhou `installmentNumber`/`installmentTotal` opcionais por parcela; `InvoicePage` carrega esses números (do grupo de antecipação) e `cardService.anticipateInstallments` grava os dois no débito e no crédito. A regra do Firestore **já aceitava** esses campos genericamente pra qualquer tipo de lançamento — não precisou mudar. Fatura de origem agora rotula "parcela 8/10 antecipada" em vez de "Parcela antecipada" sem número; antecipações antigas (sem o dado salvo) continuam com o texto genérico como fallback.
- Verificado ao vivo: antecipei 2 parcelas novas ("Notebook teste", 4/5 e 5/5) e a fatura de origem mostrou "parcela 5/5 antecipada" e "parcela 4/5 antecipada" corretamente; as faturas de destino (nov/dez de 2026) tiveram o valor reduzido em R$1.000 cada e o Limite Usado total do cartão **não mudou** (R$8.700 antes e depois — antecipar só move entre faturas). 256 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — fix: parcela antecipada some da fatura futura (igual Nubank)

- Depois do fix anterior (parcela antecipada aparecendo na fatura de origem), sobrou uma confusão do lado oposto: a fatura **futura** de onde a parcela saiu continuava mostrando "Compras R$300 / Créditos −R$300" lado a lado — dinheiro fantasma que se cancela mas fica visível, e a fatura em si (com saldo R$0) ainda aparecia no histórico do cartão como se tivesse algo pendente. No cartão de verdade (Nubank), a parcela antecipada só **some** da fatura futura.
- `anticipatedAwayEntryIds` (`src/cards/anticipation.ts`) casa cada parcela `purchase` com o crédito `installment_anticipation_credit` que a anula (mesma compra, mesmo valor) e esconde os dois. `InvoicePage` deixa de listar essa parcela e some com a linha "Compras" do resumo quando não sobra nada pra mostrar (mensagem "A parcela que caía aqui foi antecipada pra uma fatura anterior."). `CardDetailPage` some com a fatura do "Histórico de faturas" quando, depois de esconder o par antecipado, não sobra nenhuma atividade real (`invoiceHasVisibleActivity`) — nada é apagado, é recalculado toda vez: se uma compra nova cair nessa mesma fatura depois, ela deixa de ficar vazia e reaparece sozinha, com o valor real.
- Verificado ao vivo: as 3 faturas de 2027 zeradas por antecipação sumiram do histórico do cartão (a de janeiro/2027, com compra de verdade, continua aparecendo normal); a fatura de origem (julho/2026) continua mostrando as 4 parcelas somando R$1.200, sem regressão do fix anterior. 256 testes (9 novos), typecheck, lint (linha de base) e build limpos. Só UI; sem mudança de regra/dados — o ledger continua intacto e append-only, isso é puramente como a tela escolhe mostrar.

## 2026-07-12 — fix: parcela antecipada some da lista "Compras" da fatura

- O total "Compras" no topo da fatura (`invoice.purchasesTotalCents`) soma tanto a compra normal do mês quanto qualquer parcela **antecipada** trazida de uma fatura futura (`installment_anticipation`, que também é um débito real na fatura atual). Mas a lista "Compras" logo abaixo só filtrava `type === 'purchase'` — as parcelas antecipadas engordavam o total sem aparecer em nenhuma linha. Sintoma real (achado pelo dono numa fatura de teste): total "R$ 1.200" com a lista mostrando só "R$ 300".
- `purchases` em `InvoicePage.tsx` agora inclui `installment_anticipation` também; cada uma aparece com o rótulo "Parcela antecipada" (em vez do número de parcela, que essas entradas não carregam) pra não se confundir com a compra normal do mês.
- Verificado ao vivo: fatura que tinha 1 compra normal (R$300) + 3 parcelas antecipadas (R$300 cada) agora lista as 4 linhas, somando os R$1.200 do topo. 247 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — feat: "Próximos compromissos" clicável + filtro por cartão nas Transações

- **As linhas de "Próximos compromissos" no Dashboard viraram clicáveis**: tocar numa **Fatura** abre a fatura do cartão (`/app/cards/:id/invoices/:invoiceId`), **conta a pagar** abre Compromissos, **recorrência** abre Recorrências. Antes eram só texto — dava pra ver o que vencia primeiro, mas não chegar lá. (`UpcomingCommitment` ganhou `cardId`; linhas usam o `.list-row--link` que já existia.)
- **Filtro por cartão na tela de Transações**: um seletor "Cartão" (todos / cada cartão) mostra só as compras daquele cartão — além da visão por fatura que já existia. Combina com a busca e os chips de tipo.
- Verificado ao vivo: clicar na Fatura no Dashboard abre a fatura certa; filtrar por "Cartão QA" some com as compras dos outros cartões. 247 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — feat: tour de boas-vindas em slides no primeiro acesso

- Antes, quem criava conta caía direto no Dashboard sem ninguém explicar as features (o onboarding é só um questionário de configuração; o único explicador era o mini-tutorial do "Disponível"). Agora um **tour de boas-vindas em 6 slides** abre sozinho uma vez após o onboarding, apresentando os pilares: lançar tudo num lugar, cartões sem susto (parcelas), Compromissos × Recorrências, Disponível × Comprometido, e Metas/Casal/Análise. Com "Pular", "Voltar/Próximo", dots e "Começar".
- **Reabrível a qualquer momento** em "Como funciona" (menu Mais / sidebar). "Já viu" mora no localStorage (`zerou.welcomeTourSeen`, mesmo padrão do prompt de instalação — sem write no Firestore). Sequenciado **antes** do mini-tutorial do "Disponível" pra não empilhar dois modais.
- `WelcomeTour` + `welcomeTour.store` (Zustand) em `src/onboarding/`, montado no `AppShell`. Só tokens de tema no CSS (tema claro e escuro). Verificado ao vivo: auto-abre no 1º acesso, navega os 6 slides, "Começar" persiste e não reabre no reload, e o "Como funciona" reabre. 247 testes, typecheck, lint (linha de base) e build limpos.

## 2026-07-12 — feat: logos de serviço (6 oficiais + 13 tiles de marca "ícone de app")

- O dono trouxe os 19 logos que faltavam. **6 tinham símbolo quadrado** usável no tile de 36px → adicionados como SVG oficial: ChatGPT, Microsoft 365, Oi, Google One, Claro, Rappi.
- Os outros **13 eram só wordmark** (logo horizontal, ilegível espremido no quadradinho). Em vez de usá-los assim, o `ServiceMark` agora desenha um **tile "ícone de app"**: quadrado na cor da marca com as iniciais em branco (Prime Video azul "PV", Disney+ marinho "D+", Wellhub laranja "WH"…). Cores em `serviceBrandColors` (`src/theme/palette.ts`, lugar sancionado pra literais); novo estado `.service-mark--brand`. `logoPath` tem prioridade — dá pra promover qualquer uma a logo de verdade depois, é só trazer o SVG quadrado.
- Genéricos (Aluguel, Água, Energia…) seguem no tile de iniciais neutro — não são marcas.
- Verificado ao vivo em tema claro **e escuro** (a borda sutil foi mantida de propósito pros tiles bem escuros — Disney marinho, Smart Fit quase preto — não sumirem na superfície dos temas dark). Procedência dos 6 SVGs em `public/service-logos/MANUAL_SOURCES.md`. 247 testes (incl. `noHardcodedColors`), typecheck, lint (linha de base) e build limpos.

## 2026-07-12 — feat: pagar recorrência adiantado (janela de dias antes do vencimento)

- Dava pra registrar uma recorrência **só a partir do dia do vencimento** — quem paga a conta uns dias antes (conta do dia 10 paga no dia 7) ficava travado no "Em dia", sem ação. Agora, dentro de uma **janela de ~7 dias antes** do vencimento, aparece o botão **"Pagar adiantado"**; registrar ali lança o pagamento hoje e a recorrência avança pro próximo período normalmente.
- **É seguro liberar adiantado**: a transação da ocorrência é identificada pela **data de vencimento** (`recurringOccurrenceTransactionId`), não pela data do pagamento — então registrar adiantado e a automação das 6h rodar no vencimento caem no mesmo id, sem duplicar. Nova função pura `canRegisterRecurrence` (+`RECURRENCE_EARLY_PAY_DAYS = 7`) em `financeService.ts`, testada (5 casos: vencida, dentro/no limite/fora da janela, janela customizada).
- Verificado ao vivo: recorrência vencendo em 3 dias mostrou "Pagar adiantado", pagar avançou a próxima ocorrência pro mês seguinte e voltou pra "Em dia"; recorrência distante (mês seguinte) segue "Em dia". 247 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra do Firestore.

## 2026-07-12 — feat: busca direta na tela de Transações

- A tela de Transações (o extrato) ganhou uma **barra de busca sempre visível** no topo + **chips de filtro por tipo** (Tudo / Despesas / Receitas / Transferências). A busca por texto filtra a lista **ao vivo** por **nome, categoria, tag e estabelecimento** — os campos que a pessoa lembra. "Despesas" inclui compras no cartão. Empty state próprio quando o filtro/busca não acha nada ("Nenhum resultado"), distinto do "nenhuma transação ainda".
- Antes só existia busca na Análise, escondida atrás de um ícone (BottomSheet). Aqui é inline, no lugar mais natural pra achar um lançamento. Reaproveita `.input-with-icon` e `.chip`/`.chip--active` (nova `.transactions-filter` só pra espaçar).
- Verificado ao vivo: buscar "eletr" acha o Notebook pela **categoria** (não está no nome), "mercado" acha pelo nome, texto sem match mostra "Nenhum resultado", e o chip "Receitas" esvazia a lista de despesas (com destaque no chip). Typecheck, 242 testes, lint (linha de base) e build limpos.

## 2026-07-12 — fix: iniciais do selo de serviço encostadas à esquerda (Recorrências/Compromissos)

- O tile de iniciais/ícone (`ServiceMark`) nas listas de Recorrências e Compromissos mostrava as letras coladas no canto esquerdo do quadrado, em vez de centralizadas. Causa: `.service-mark` usa `display: inline-grid; place-items: center`, mas a regra genérica `.list-row span { display: block }` (que empilha o texto das linhas) tem especificidade maior e derrubava a grade. Corrigido subindo o seletor para `span.service-mark` — exatamente o mesmo padrão do `span.category-mark`. É o **segundo** caso real desse bug de especificidade em tiles dentro de `.list-row`. Verificado ao vivo (o "EN" de Energia elétrica agora centralizado, folgas iguais nos 4 lados). Só CSS; 242 testes e build limpos.

## 2026-07-12 — feat: camada "Previsto" na Análise (recorrências projetadas) + categoria de compra conferida

- **Mês futuro agora mostra "Previsto"**, não só o comprometido: além das parcelas de cartão e contas a pagar (obrigação firme), soma as **recorrências projetadas** para aquele mês (aluguel, assinaturas…). O KPI vira "Previsto no mês", um terceiro card mostra "Recorrências ~R$", e uma seção **"Recorrências previstas"** lista cada regra — deixando claro o que é firme (comprometido) e o que é estimativa (recorrência, pode mudar se cancelar/ajustar).
- **Projeção mês a mês** (`projectedRecurringForMonth`/`recurringByCategoryForMonth` em `spendingAnalysis.ts`): trata mensal (1×/mês), semanal (soma as ocorrências do mês) e anual (só no mês do aniversário), com o avançador de ocorrência (`nextOccurrenceDate`) injetado pra manter o módulo puro. O horizonte de navegação passou a ir até a última parcela/conta **ou** +12 meses quando há recorrência ativa (recorrência é "infinita", precisa de teto).
- **Categoria conferida ao vivo, nos dois caminhos** (dúvida do dono): compra no cartão com categoria mostra a fatia certa no donut (parcela → transação-mãe → categoria: "Alimentação R$200"), e recorrência idem ("Casa R$1.500"). Antes a conta de teste tinha tudo sem categoria, então parecia "Sem categoria 100%".
- Verificado ao vivo: ago/2026 = R$2.000 previsto (R$300 parcela + R$1.500 recorrência + R$200 compra categorizada), donut com 3 fatias, seção de recorrências e console limpo. 242 testes (6 novos de projeção de recorrência), typecheck, lint (abaixo da linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-12 — feat: projeção de meses futuros na Análise (o que já está comprometido)

- **Dá pra avançar pra meses futuros na Análise** e ver o que já está comprometido lá. O botão de avançar mês, que parava no mês atual, agora vai **até o último mês com parcela/conta comprometida** (`lastCommittedMonth`) — sem meses vazios sobrando no fim.
- **Mês futuro mostra "Já comprometido", não "Gasto"**: num mês que ainda não chegou não existe gasto realizado, então a tela conta **parcelas de cartão caindo naquele mês + contas a pagar (bills) vencendo nele**, por categoria. Rótulos, legenda ("Mês ainda não chegou — isto é o que você já assumiu…") e empty state adaptados; "vs. mês anterior" some (comparação só entre meses realizados).
- **Recorrências ficaram de fora de propósito** (decisão de produto): projetar recorrência mês a mês seria estimativa (valor/cancelamento incertos), e misturar previsão especulativa com obrigação real numa Análise engana. Cartão (ledger) e contas a pagar são dados reais já cadastrados. Recorrência pode virar uma camada "Previsto" separada depois.
- Verificado ao vivo (conta de teste): ago/2026 = R$300 (parcela 2/10), out/2026 = R$625 (10x QA R$300 + Geladeira 1/12 R$200 + Óculos 8/10 R$125), avançar trava no último mês comprometido, console limpo. 236 testes (7 novos: `billsByCategoryForMonth`, `committedByCategoryForMonth`, `lastCommittedMonth`), typecheck, lint (abaixo da linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-11 — feat: Análise em regime de caixa (por parcela) + compras parceladas em andamento

- **A Análise deixou de jogar a compra parcelada inteira no mês da compra.** Uma compra de R$3.000 em 10x aparecia como R$3.000 num mês só (a tela somava a transação `card_purchase`, que guarda o valor cheio no mês da compra) e os outros 9 meses zerados. Agora o cartão entra pela **parcela que cai na fatura de cada mês** — R$300 em cada um dos 10 meses. Casa com o "Comprometido" do Dashboard (que já contava por fatura) e com o que "quanto gastei no mês" significa. Nova lógica isolada em `src/finance/spendingAnalysis.ts`, pura e testada (11 casos).
- **Antecipar parcela agora reflete na Análise, de graça.** Como o gasto do mês reusa o `recognizedExpenseCents` do ledger (`purchases + fees − credits`, incluindo débito de antecipação na fatura atual e crédito na futura), antecipar uma parcela move o gasto do mês futuro pro atual também nos gráficos — antes a Análise nem olhava o ledger.
- **Nova seção "Compras parceladas — Em andamento"** na Análise, dando visibilidade ao valor cheio que a visão por parcela dilui: "R$3.000 em 10x", quantas parcelas faltam e quanto resta. "Restante" é líquido de antecipação (parcela antecipada sai do que falta, como no cartão de verdade). Vale mesmo pra compra migrada em andamento (óculos 7/10 → mostra o total real R$1.250, não só o que falta).
- **Busca enriquecida**: um resultado de compra no cartão mostra "10x de R$300" ao lado do valor cheio, ligando a compra às parcelas.
- Verificado ao vivo (conta de teste): julho mostrando R$1.200 (as parcelas do mês, não as compras cheias), seção em andamento com Geladeira R$2.400/12, Compra 10x QA R$2.100 restante/7 (refletindo 3 já antecipadas) e Óculos R$500/4, console limpo. 229 testes, typecheck, lint (uma abaixo da linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-11 — feat: antecipar fatura x antecipar parcela explícitos + aviso de que é irreversível

- **Confirmação antes de antecipar parcelas.** Ao confirmar, um diálogo mostra de quais faturas futuras as parcelas saem e que passam a contar nesta fatura agora (ex.: "Ela sai das faturas de dez/2026 e passa a contar nesta fatura agora — total R$ 125,00. Seu limite não muda; só o mês em que cada parcela pesa. Isso não pode ser desfeito."). Fecha a decisão #4 da spec (explicitar o que se move, já que não há desconto pra "vender" a ação) e o aviso de irreversibilidade (mantida irreversível, como no Nubank).
- **"Antecipar fatura" e "antecipar parcela" viraram conceitos distintos na UI.** Numa fatura ainda aberta, o botão de pagar vira **"Antecipar fatura (pagar antes de fechar)"** com um texto curto explicando a diferença pra antecipar parcela; o título do sheet e o botão do cartão acompanham ("Antecipar" quando aberta, "Pagar fatura/agora" quando fechada).
- Conferência final contra `spec_antecipacao_fatura_parcela.md`: o comportamento bate. Nosso modelo de ledger (débito na fatura atual + crédito na futura) já entrega o `mes_referencia` × `mes_pago` da spec sem precisar dos dois campos de data, e os relatórios de mês futuro já saem líquidos de graça (o crédito zera a parcela na fatura de origem).
- Verificado ao vivo (conta de teste): botões, texto e diálogo com o mês certo (dez/2026), stepper da última pra trás refletindo antecipação anterior (10x já sem 8/9/10 → próxima 7/10; óculos intacto → próxima 10/10), console limpo. 218 testes, typecheck, lint (linha de base) e build limpos. Sem mudança de regra/dados.

## 2026-07-11 — fix: antecipação só da última parcela pra trás + trazer compras existentes ao criar o cartão

- **Antecipação de parcela reescrita pra funcionar como no cartão de verdade.** Antes o app deixava marcar qualquer parcela futura solta — inclusive uma do meio, deixando as de trás (parcelei em 5x, tô na 1ª, e dava pra antecipar a 3ª). Isso não existe: antecipação é sempre **da última parcela pra trás, contígua**. Agora o painel agrupa por compra e oferece um seletor "antecipar as últimas [N] parcelas" — pega da última pra trás, nunca uma do meio. Verificado ao vivo: antecipar as 3 últimas de um 10x moveu R$900 das faturas fev/mar/abr pra fatura atual, **limite usado inalterado** (antecipar move dívida entre faturas, não muda o total). O mecanismo em si (débito na fatura atual + crédito na futura) já estava certo; o bug era só a seleção.
- **Trazer compras existentes ao cadastrar o cartão.** A maioria já chega com parcelas rolando. Agora, ao criar um cartão, o app vai direto pra página dele com um destaque: "Esse cartão já tinha compras? Traga o que já existe" — parcelas em andamento (ex.: 12x, já na 7ª) **e compras futuras que começam mais pra frente** (ex.: parcelas que só começam na fatura de outubro). Reaproveita o fluxo `registerOngoingInstallments`, com cópia mais clara pros dois casos. Verificado ao vivo (compra futura de 12x começando em outubro → 12 faturas de out/2026 a set/2027).
- 218 testes de unidade, typecheck, build e lint (linha de base) limpos. Regra do Firestore não mudou (os campos de parcela já foram deployados).

## 2026-07-11 — fix: conservador não estoura mais com parcela + lançar compra parcelada em andamento

- **Conservador com Disponível muito negativo — corrigido.** A causa era o modo contar **todas** as parcelas futuras de uma compra no cartão como se vencessem hoje. Reproduzido no caso do dono (R$5.000 de limite, R$3.000 em 10x, saldo baixo): antes dava Comprometido R$3.000 / Disponível −R$2.000. Agora o conservador olha a **janela de dias** (sem nunca assumir salário), então só a parcela que vence logo pesa — Comprometido R$300, Disponível R$700. Verificado ao vivo. Mini tutorial, tela de Recebimento e legenda do Dashboard reescritos pra refletir a diferença real entre os modos (conservador = janela fixa; "até o recebimento" = corte no salário).
- **Lançar compra parcelada que já começou** (`registerOngoingInstallments` + `OngoingInstallmentsSheet`, botão na página do cartão). Pro caso de migrar pro app uma compra que já vinha pagando: informa o valor da parcela, "está na parcela 7 de 10" e o mês da próxima; o app cria só as que faltam (7 a 10), nas faturas certas, sem recriar as pagas. Preview ao vivo antes de confirmar.
- **Toda compra parcelada agora mostra "parcela X/N"** na fatura (novos campos `installmentNumber`/`installmentTotal` no ledger). Resolve a confusão das "10 faturas abertas que parecem 10 contas". Exige regra do Firestore nova (deployada).
- QA ao vivo completo numa conta criada do zero (cadastro → onboarding → conta → cartão → compra 10x → conservador → compra em andamento), tudo persistindo após reload, console limpo. 221 testes de unidade + 45 de regras, typecheck, lint (linha de base) e build limpos.

## 2026-07-11 — feat: logos e autocomplete de assinaturas nas Recorrências e Compromissos

- **Catálogo de ~60 serviços** (`src/finance/subscriptionServices.ts`): assinaturas (Netflix, Spotify, Prime Video, Disney+, Max, Wellhub, Xbox…) e contas fixas (energia, água, aluguel, internet…). Digitar no campo Descrição sugere a marca, preenche o nome canônico e sugere a categoria (sem sobrescrever uma escolhida à mão). A lista de recorrências e de compromissos passou a mostrar a marca ao lado do nome.
- **26 logos SVG** gerados do `simple-icons` (mesma fonte CC0 dos bancos), via `npm run generate:service-logos`, com `SOURCES.md` automático. Chip de fundo sempre claro (`--brand-chip-bg`) pra logos pretos (Apple TV, Notion, Uber) não sumirem nos 4 temas escuros.
- **Marcas fora do simple-icons mostram tile de iniciais**, igual aos bancos sem logo. Prime Video, Disney+, Wellhub, Xbox, Microsoft 365, Adobe, Canva, ChatGPT e Globoplay **não existem** no pacote (que remove logo a pedido do dono) e não têm versão quadrada de fonte confiável — busquei no Wikimedia Commons e só há wordmarks marcados como `trademarked`, ilegíveis num tile de 36px. Decisão do dono: tentar o oficial, cair no simple-icons quando não der.
- **Reconhecimento por palavra inteira**, não substring: "Time do coração" não vira TIM, "Oitava parcela" não vira Oi — logo errado ao lado de dinheiro é pior que logo nenhum. Coberto por teste.
- Achado no caminho e anotado como pendência: o `SOURCES.md` dos **bancos** estava errado (dizia gerar 26 SVGs do simple-icons que na verdade vieram de outra fonte). Corrigido o texto; a origem real fica pra decidir com o dono.
- 213 testes de unidade, typecheck, lint (1 problema a menos que a linha de base), build e `noHardcodedColors` limpos.

## 2026-07-11 — fix: as 3 pendências técnicas + um bug de offline achado no caminho

- **Excluir uma transação offline não fazia nada.** `snapshot.data()` devolve `null` para um `serverTimestamp()` ainda pendente, então `deletedAt` chegava nulo no cache local: a transação continuava no Extrato e a compra continuava somando na fatura até o servidor responder. Num app offline-first, a UI desfazia a ação do usuário. Toda leitura de snapshot passa agora por `readSnapshotDoc` (`serverTimestamps: 'estimate'`).
- **Compra de cartão excluída voltava a contar na fatura.** O filtro de lançamento órfão usava a janela das 300 transações mais recentes; uma compra antiga que saísse dela sumia do conjunto de "excluídas" e o valor **voltava** — a fatura podia até deixar de estar paga. Agora o `useCardsData` consulta o servidor pelos ids que a janela não cobre (normalmente nenhum) e, na dúvida, mantém o lançamento: sumir com ele apagaria dívida real.
- **Trava de exclusão de conta era furada** pelo mesmo motivo: uma conta antiga parecia vazia e podia ser apagada, deixando as transações órfãs. Passou a perguntar ao servidor.
- **Recorrência gerava despesa em dobro**: a Cloud Function das 6h e o botão "Registrar" criavam transações independentes para a mesma ocorrência. Agora as duas usam um id derivado de `(regra, data da ocorrência)` — a segunda escrita cai no mesmo documento e é rejeitada pela regra do Firestore, o que está provado por teste no emulador. O botão "Registrar" também sumiu das recorrências que ainda não venceram (mostram "Em dia"); clicar ali lançava despesa inexistente e ainda pulava um período.
- **Código morto removido**: `useFinanceData` recalculava um `dashboard` sem faturas, payday nem `availableMode` que nenhuma tela consumia.
- `generateRecurrences` deployada com autorização do dono, então a idempotência vale dos dois lados.
- 193 testes de unidade + 44 de regras, typecheck, lint e builds (app e functions) limpos. Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-10 — fix: `npm run test:rules` desbloqueado (e 5 testes que ele revelou quebrados) + clareza na tela de Recebimento

- **`npm run test:rules` voltou a rodar**, depois de meses bloqueado. O Java desta máquina tinha dois JDK 25 **sem a pasta `bin/`** e um stub órfão da Oracle primeiro no PATH do sistema, morrendo com `0xC0000409`. Como `firebase-tools` chama `spawn("java")` cru e ignora `JAVA_HOME`, e corrigir o PATH do sistema exige admin, o script passou a usar `scripts/with-java.mjs`: acha um JDK que de fato executa e o coloca na frente do PATH só daquele comando.
- **Ao rodar, a suíte acusou 5 falhas — todas nos testes, não nas regras.** O seed criava `users/charlie` antes do teste que deveria *criar* a fundação (virava update); os testes de casal usavam id `coupleA`, mas a regra exige `^couple_`; o payload de teste não tinha `coupleMode` nem `displayName` (ler campo ausente numa rule é *evaluation error*, não `false`); e o convite tinha `expiresAt` fixo em `2026-06-16`, uma data que já passou. 43/43 passando agora, e um teste de mutação confirmou que a suíte realmente pega uma regra sabotada.
- **Excluir cartão com fatura em aberto** agora avisa, com o valor na frente, que a dívida vai parar de contar no "Comprometido" e as faturas somem do app (as compras continuam no Extrato). O texto anterior prometia que "as faturas continuam no histórico" — não continuam.
- **Tela de Recebimento reescrita**: clicar num modo não dava retorno nenhum (o "Salvo." ficava no rodapé, fora da tela) — agora há um selo "Salvo" que aparece e some. A tela também mostra **a data-limite real em vigor** ("Hoje o corte é 5 ago — seu próximo recebimento"), usando a mesma função do Dashboard, e explica em português o que a data de recebimento faz e o que é o período de dias.
- No modo Conservador, a seção de recebimento fica recuada com um aviso: nada ali muda o resumo.
- **Rótulo errado no cartão**: "Fatura em aberto" mostrava a soma de *todas* as faturas (o limite usado), não a fatura atual. Virou "Limite usado".
- Campo de valor da recorrência vinha preenchido com `"R$ 39,90"` em vez de `"39,90"`, fora do padrão dos outros campos de dinheiro.
- 178 testes de unidade + 43 de regras passando, typecheck e build limpos, lint com 2 problemas a menos que a linha de base.

## 2026-07-09 — fix: 7 bugs de cartão/parcela/Comprometido + a pessoa escolhe como o "Disponível" é calculado

- **Cartão excluído continuava listado em Cartões e ainda comprometia saldo e limite** — `deleteCard` é soft-delete e nada filtrava `isActive`. Corrigido na raiz (`useCardsData`), verificado ao vivo: o Comprometido volta sozinho ao excluir o cartão.
- **Parcelamento colidia num mês e pulava outro**: compra 4x em 31/jan num cartão que fecha dia 28 gerava duas parcelas em fevereiro e nenhuma em março (`addMonths` clampando fevereiro). Novo `resolveInstallmentCycle` garante faturas consecutivas.
- **Antecipação de parcelas**: oferecia faturas *passadas* como se fossem futuras (antecipá-las jogaria a dívida pra frente), e antecipar uma parcela escondia as irmãs da mesma compra. Lógica extraída pra `src/cards/anticipation.ts` com 10 testes. Antecipação de parcela de meses depois testada ao vivo — limite consumido não muda.
- **Comprometido**: conta que vence no próprio dia do salário sumia do cálculo, e o número mudava conforme a hora do dia em que o app abria. O corte agora é sempre fim do dia.
- **Push "Fatura fechada: R$ 0,00"**: `outstandingBalanceCents` nunca é gravado no Firestore (o total vem do ledger, no cliente) e a Cloud Function lia o campo cru. Agora calcula do ledger — **exige `firebase deploy --only functions`**.
- **Novo: escolha do modo de "Disponível"** (`conservative` × `until_payday`), com mini tutorial que abre no primeiro Dashboard, trocável e revisitável em Configurações. Nasce do ponto levantado pelo dono: o app não pode simplesmente *deduzir* que um salário futuro vai cair. O default mantém o comportamento atual.
- **"Sem categoria" aparecia duas vezes** no Resumo de gastos e no donut da Análise: o agrupamento usava `?? 'uncategorized'`, e compra no cartão sem categoria grava `categoryId: ''` — string vazia passa pelo `??`. Trocado por `||`.
- **`fireWrite` agora loga `permission-denied` no console em desenvolvimento** — o silêncio de propósito já escondeu dois bugs graves por semanas, e escondeu um terceiro nesta sessão (pego olhando a resposta HTTP do Firestore).
- Regras do Firestore e Cloud Functions **deployadas e verificadas ao vivo** com autorização do dono. 178 testes passando, typecheck e build limpos. Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — fix: cartão/fatura não excluía direito, Comprometido contava fatura cedo demais, antecipação de parcelas nunca funcionou + feature de payday

- **4 bugs reais de cartão/fatura corrigidos**: excluir compra no cartão não saía da fatura; "fatura atual" mostrava a fatura errada quando havia parcelamento; cartão que fecha tarde/vence mês seguinte calculava vencimento antes até da própria compra; e o mais sério — **antecipação de parcelas nunca funcionou em produção** (regra do Firestore nunca aceitou o tipo de lançamento de crédito, silenciosamente rejeitada desde que a feature existe).
- **Comprometido/Disponível revisados a fundo**: o critério de quando uma fatura conta como "comprometida" mudou de "mês do ciclo da compra" pra "data de vencimento real" (mesmo cutoff de contas a pagar/recorrências), por decisão do dono, depois de investigar um caso concreto onde uma fatura que só vencia mês seguinte já derrubava o "Disponível" hoje.
- **Nova pergunta de onboarding "quando você recebe?"** (dia fixo / Xº dia útil / fim do mês / renda variável — plantão, freela, autônomo) alimenta esse cutoff automaticamente, com janela de dias configurável em Configurações → Recebimento. Dashboard agora explica de onde vem o número do Comprometido.
- Nomenclatura desktop/mobile unificada (Extrato→Transações, Casal→Compartilhado) e confirmação adicionada antes de excluir qualquer transação.
- Todas as mudanças de `firestore.rules` desta sessão foram revisadas só manualmente (Java local quebrado bloqueia `npm run test:rules`, ver `CLAUDE.md`), deployadas com autorização explícita do dono e verificadas ao vivo em produção.
- 147 testes passando (vários novos), typecheck limpo. Detalhes completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — fix: datas cruas ("2026-07-08") em Extrato, Contas a pagar, Faturas, Cartões, Recorrências e Busca

- Extensão do fix de data amigável aplicado antes só na Dashboard: `toDateInputValue` (formato de `<input type="date">`) trocado por `formatFriendlyDate` ("Hoje", "Ontem", "8 jul") em `TransactionsPage`, `BillsPage`, `InvoicePage`, `CardDetailPage`, `CardsPage`, `RecurringPage` e `SearchPage`. Sessão spawnada separadamente (chip de sugestão) e revisada/mesclada aqui.
- 3 riscos anotados em `CLAUDE.md` (seção temporária, remover ao resolver): Java local quebrado bloqueando `npm run test:rules`, `fireWrite` sem log nem em dev, e um `spread` frágil em `accountDeletionService.ts` que pode repetir a mesma classe de bug da regra de categoria se o tipo `WorkspaceRef` ganhar um campo novo.

## 2026-07-09 — fix: criar categoria nova falhava silenciosamente + auditoria de regras

- Ao lançar uma despesa/receita e criar categoria nova no picker, o app também salvava a transação incompleta (form da categoria, dentro de um `BottomSheet`/portal, ainda é "filho" do form da transação na árvore React — sem `event.stopPropagation()`, o submit se propagava pros dois). Corrigido em `CategoryField.tsx`.
- Causa mais séria: `validCategoryCreate` (`firestore.rules`) nunca foi atualizada quando o campo `createdBy` foi adicionado no cliente — toda categoria personalizada era rejeitada pelo servidor **silenciosamente há ~3 semanas**. Corrigida e deployada.
- Ao corrigir a regra, quebrei sem querer o seeding das categorias padrão (que nunca envia `createdBy`) — pego e corrigido na mesma sessão antes de virar um problema novo. Regra final trata os dois casos (categoria padrão sem `createdBy` vs. personalizada com `createdBy` obrigatório).
- **Auditoria completa**: todo write do app (`financeService`, `cardService`, `sharedService`, `workspaceService`, sync de tema, tokens de push) comparado campo a campo contra as regras do Firestore — nenhum outro desalinhamento encontrado. Teste novo em `tests/firestore.rules.test.ts` cobrindo os dois ramos da regra de categoria.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — feat: revisão de design da Dashboard

- **Ícone de categoria descentralizado** (`.category-mark`): conflito de especificidade CSS com `.list-row span` (regra genérica que empilha texto nas linhas de lista) derrubava o `display: grid` que centraliza o ícone — o SVG ficava encostado no canto superior-esquerdo do quadrado colorido. Fix: seletor `span.category-mark` (mesma especificidade, vence por ordem no arquivo).
- **Datas amigáveis em português**: `toDateInputValue` (formato `yyyy-MM-dd`, pensado só pra `<input type="date">`) estava sendo exibido cru como texto pro usuário ("2026-07-08"). Novo helper `formatFriendlyDate` (`financeDates.ts`) — "Hoje", "Ontem", "8 jul" ou "8 jul 2025" (locale pt-BR do date-fns) — aplicado em "Últimos movimentos" e "Próximos compromissos" da Dashboard. O mesmo problema existe em outras telas (Extrato, Contas a pagar, Faturas, Cartões, Recorrências, Busca) — ainda não corrigido lá.
- **"Próximos compromissos" vazio** ganhou ilustração própria (calendário + check), consistente com o resto do app — antes era só texto seco enquanto o card ao lado (transações) já usava `EmptyState` ilustrado.
- **"Resumo de gastos"** agora mostra o tile colorido da categoria (`CategoryMark`) ao lado do nome, criando o mesmo fio visual da lista de transações — agrupamento trocado de nome pra ID de categoria pra viabilizar.

## 2026-07-09 — fix: campo "Saldo inicial" pré-preenchido com "0,00" ao criar conta

- Em Contas → Criar conta, o campo "Saldo inicial" vinha com o valor real `"0,00"`, exigindo apagar antes de digitar. Os demais campos de dinheiro do app (Metas, Contas a pagar, Recorrências, Faturas, Cofrinho e despesas do casal, Nova transação) já usavam `"0,00"` só como placeholder, some ao focar. `AccountsPage.tsx` era o único fora do padrão — alinhado.

## 2026-07-09 — fix: exclusão de conta no admin retornava "internal"

- Digitar `EXCLUIR` e confirmar na tela de admin sempre falhava com erro genérico "internal", mesmo com a frase certa.
- Causa: a Cloud Function `adminDeleteUser` (`functions-admin/`) estava sem a permissão pública de invocação (`roles/run.invoker` para `allUsers`) no Cloud Run — a requisição era bloqueada pela infraestrutura antes de chegar no código, então o SDK do Firebase nunca via o erro de verdade. Provavelmente perdida no redeploy que resolveu o conflito de codebases em 2026-07-07.
- Fix aplicado direto via API do Cloud Run (`setIamPolicy`), igualando à policy do `adminForceLogout`. Um redeploy comum (`firebase deploy`) **não** reaplica essa permissão em functions já existentes — só na criação.
- Bônus: `DeleteConfirmModal` (`AdminPage.tsx`) passou a usar `.trim()` na comparação com `EXCLUIR`, igual à autoexclusão em `LoginMethodsPage.tsx` — protege contra espaço acidental deixando o botão travado sem aviso.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: domínio próprio granativa.com.br

- Domínio comprado no registro.br e adicionado no Vercel (apex `A` + `www` CNAME).
- Código atualizado pra `https://granativa.com.br`: canonical e `og:image` em `index.html`, todas as URLs de `public/sitemap.xml` e `public/robots.txt`, links de notificação push nas Cloud Functions (`functions/src/automation.ts`, `push.ts`, `index.ts`, `.env`).
- `src/components/Seo.tsx` já era dinâmico (`window.location.origin`) — não precisou mudar.
- `functions` já deployado com o `APP_BASE_URL` novo — links de push (fatura fechada, conta a vencer, lembrete diário) já usam o domínio novo em produção.
- Zona DNS configurada no registro.br (registro `A` na raiz + `CNAME` em `www`).
- **Migração completa e confirmada**: HTTPS válido, landing carregando, login com Google testado em produção no domínio novo pelo dono.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — fix: "Gasto no mês" cortava o valor com "..." na Análise

- O card destaque "Gasto no mês" ficava estreito (dois cards lado a lado no mobile) e a fonte grande do valor não cabia, cortando "R$ 430,..." com reticências.
- Faixa de KPI virou grid: o card destaque ocupa a linha inteira (número herói, valor nunca trunca — testado até 7 dígitos), e "Maior categoria" + "vs. mês anterior" ficam lado a lado embaixo. Mesma hierarquia do Dashboard.

## 2026-07-08 — fix: clareza visual dos modos do casal (pareciam se acumular)

- Os 3 modos são níveis progressivos (cada um mostra as seções do anterior + a sua), o que dava a impressão de "ativar os 3 juntos" ao trocar. É sempre um modo só.
- Badge do modo atual visível no topo do espaço parceirado (antes só aparecia escondido em "Gerenciar espaço"), clicável pra trocar, com texto deixando claro que o cofrinho funciona em qualquer modo.
- Botões "Ativar transparência/equilíbrio" renomeados pra "Mudar pra..." (deixa claro que troca, não soma).
- Tag "Atual" no seletor de modo marcando o modo vigente, distinto do que está sendo selecionado — evita trocar sem querer.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — fix: 3 bugs no espaço do casal achados testando com dispositivos reais

- Corrigida race condition no botão "Cancelar espaço compartilhado" — ficava clicável (mas inerte) por 1-2s antes do workspace terminar de carregar.
- Corrigido bug real em `firestore.rules`: trocar o modo do espaço (`updateCoupleMode`) sempre dava "Missing or insufficient permissions" pros dois lados — a regra só previa as transições de aceitar/sair, não uma mudança isolada de modo.
- Testado ponta a ponta com uma segunda conta real aceitando o convite (sem reload na aba de quem convidou) — página atualizou sozinha; terceiro problema relatado não reproduziu, provável consequência dos outros dois.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: admin com paginação/detalhe de usuário + fix de vazamento na exclusão de conta

- Bug real corrigido: `users/{uid}/fcmTokens` (token de push) nunca era apagado nem na autoexclusão (`accountDeletionService.ts`) nem na exclusão pelo admin (`functions-admin/src/index.ts`) — ficava órfão no Firestore pra sempre. Corrigido nos dois fluxos; alinhei também a lista de subcoleções (`comments`) entre os dois arquivos.
- Admin (`/admin`): teto fixo de 500/200 usuários/casais/convites virou paginação de verdade por cursor (`startAfter`, 100 por página, botão "Carregar mais").
- Novo painel de detalhes por usuário (clicar na linha): perfil + lista de espaços (pessoal/casal, papel, status) — só metadados que o admin já podia ler, sem tocar em regra de dado financeiro.
- Nova ação "Forçar logout" (`adminForceLogout`, nova Cloud Function em `functions-admin/`, `auth.revokeRefreshTokens`) — precisa de deploy de functions antes de funcionar em produção.
- Filtros por status (Casais: ativo/arquivado/deletando; Convites: ativo/expirado/aceito) via StatCards clicáveis, mais ordenação por coluna nas 3 tabelas.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: reestruturação da tela de Análise (mês, empty states, busca)

- Cards de KPI e cabeçalhos passaram a reaproveitar `.metric-card`/`.metric-icon`/`.section-heading` do design system (classes que já existiam em `global.css`, nunca usadas) em vez de ~40 blocos de estilo inline.
- Empty states com `EmptyState` (ilustração) no gráfico de categoria e no histórico mensal, no lugar de texto seco.
- Navegação por mês nova (seletor `‹ Mês ›`) — KPI, categoria e "vs. mês anterior" acompanham o mês escolhido; histórico de 6 meses continua fixo como tendência.
- Busca por texto saiu do meio da rolagem e virou `BottomSheet` sob demanda (ícone no cabeçalho); link "Buscar" do Dashboard agora abre a busca direto.
- Corrigido ao testar com dado real: legenda do donut cortando nomes curtos ("Casa" → "C...") e nome de categoria longo cortando no card "Maior categoria" ("Alimenta...").

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: reestruturação da UI do espaço do casal + 2 bugs corrigidos nas regras do Firestore

- `SharedSpacePage.tsx` (880 linhas) dividida em `src/pages/shared/` (`CoupleInviteSection`, `CoupleModeSheet`, `CoupleSavingsSection`, `CoupleExpensesSection`) — página principal virou orquestrador.
- Fluxo de convite reescrito: uma ação primária por estado (gerar/compartilhar/regenerar/cancelar) em vez de até 6 botões simultâneos; "Compartilhar" usa `navigator.share` com fallback pra copiar.
- Bug real corrigido: recarregar a página depois de gerar um convite fazia o app "esquecer" que já existia um ativo — clicar em gerar de novo invalidava silenciosamente o código já enviado. Agora mostra "Convite ativo, expira em..." e avisa antes de invalidar.
- 2 bugs achados e corrigidos em `firestore.rules` (impediam criar o espaço/aceitar convite de verdade): checagem de entitlement de billing não seguia o mesmo default do cliente; regras de criação do membro (dono/parceiro) não incluíam `displayName` na lista de campos permitidos.
- Formulário de nova despesa virou `BottomSheet` (padrão do app); seleção de modo do casal deixou de estar duplicada (uma lista só, reusada em criar/trocar).

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: prompt de instalação do PWA no Dashboard

- Verificação do manifest (`vite.config.ts`, plugin VitePWA): conteúdo correto, mas achei 2 bugs pequenos — `lang` não estava setado (caía no default `en` num app em português) e os caminhos dos ícones referenciavam `Granativa-app-icon-*.png` (G maiúsculo) enquanto os arquivos reais em `public/brand/` são todos minúsculos. Confirmei ao vivo contra a produção que o Vercel serve como case-insensitive (não estava 404, mas ficava frágil) — corrigido de qualquer forma.
- Novo `InstallPromptSheet` (montado só na tela inicial `/app`, via `DashboardPage`): mostra um bottom sheet central com botão "Instalar agora" quando o navegador suporta o evento nativo `beforeinstallprompt` (Android/Chrome/Edge/desktop); no iPhone/iPad (sem esse evento no Safari) mostra um tutorial visual de 3 passos (Compartilhar → Adicionar à Tela de Início → Adicionar).
- Nunca aparece pra quem já instalou (`display-mode: standalone` / `navigator.standalone`) nem pra quem já dispensou uma vez (`localStorage`, permanente).
- Captura do `beforeinstallprompt` acontece desde o boot (`src/pwa/installPrompt.ts`, importado em `main.tsx`), não só quando a tela do Dashboard monta — o evento pode disparar antes.

## 2026-07-08 — fix: texto preto ilegível nos 4 temas escuros

- Causa raiz: `global.css` usa as diretivas legadas `@tailwind base/components/utilities` (estilo v3), mas o Tailwind instalado é v4 — o plugin `@tailwindcss/postcss` v4 não processa essa sintaxe, então o preflight nunca rodava. Sem o reset `button/input/select/textarea { color: inherit }` do preflight, qualquer elemento nativo sem classe (ex.: `<h2>` dentro de `<button>` sem estilo) caía no preto padrão do navegador — invisível nos 4 temas escuros (Obsidian, Midnight, Aurora, Rose Gold). Reproduzido em 5 páginas com o mesmo padrão de botão colapsável (Contas, Cartões, Compromissos, Metas, Compartilhado).
- Fix: reset explícito em `global.css` (`button, input, select, textarea { font: inherit; color: inherit; }`), independente do Tailwind. Não migrei a diretiva pra `@import "tailwindcss"` (mudança maior no pipeline de build) — só resolvi o sintoma real com uma regra CSS padrão.

## 2026-07-08 — fix: UX de aparência, segurança da conta e navegação

- **Saldo do Dashboard**: mostrava "—" por 1-2s a cada reload enquanto o Firestore sincronizava. Cache local (`dashboardSummaryCache.ts`, mesmo padrão do `profileCache.ts`) mostra o último valor conhecido até o dado real chegar.
- **Bug de troca de tema**: clicar num tema às vezes revertia pro anterior. Causa: `hydrateFromProfile` aplicava qualquer snapshot do perfil vindo do Firestore, inclusive um em trânsito com o tema antigo. Fix: `hasLocalOverride` no `appearance.store.ts` — depois da primeira escolha manual na sessão, o Firestore só hidrata, nunca mais sobrescreve.
- **Tela de Segurança reescrita** (`LoginMethodsPage.tsx`): bloco de Perfil (nome/email) no topo, UID e "workspace" removidos da tela, métodos de login como lista com badge "Ativo", explicação clara pra quem loga só com Google. Exclusão de conta agora só exige digitar EXCLUIR — sem campo de senha.
- **Aparência simplificada**: seção "Conforto de leitura" (densidade/fonte/reduzir animações) removida. Grid de temas compactado — ficava 1 coluna gigante no mobile por um `@media` que colapsava `.theme-grid`; agora sempre 3 colunas, cards menores.
- **Navegação**: nenhuma tela resetava o scroll ao trocar de rota (abria no meio da página anterior). `ScrollToTop.tsx` novo, montado uma vez em `App.tsx`.
- **Menu**: Aparência e Segurança agora ficam agrupadas sob o rótulo "Conta" na sidebar e no menu "Mais" do mobile, em vez de soltas entre os outros itens.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: `adminDeleteUser` duplicada em 2 codebases de Cloud Functions

- Deploy de functions revelou uma duplicata real: `adminDeleteUser` existia tanto em `functions/src/admin.ts` (codebase `billing`) quanto em `functions-admin/src/index.ts` (codebase `admin`, isolado de propósito desde 17/06 pra deployar sem depender de secrets do Stripe). O Firebase rejeitou o deploy ("More than one codebase claims...").
- `firebase functions:list` confirmou: a função ao vivo já pertencia ao codebase `admin`. Removido o duplicado de `functions/src/admin.ts` (arquivo deletado, export tirado de `functions/src/index.ts`) — `functions-admin/` continua sendo a única fonte de verdade.
- As 10 functions dos 2 codebases foram redeployadas com sucesso (`npx firebase deploy --only functions`), incluindo a limpeza da referência a `comments` (feature já removida) que só tinha sido sincronizada no codebase errado antes.

## 2026-07-07 — feat: painel admin funcional (QA + UX)

- **2 bugs de segurança corrigidos**: admin podia deletar a própria conta sem aviso especial (sem proteção contra auto-exclusão); confirmação de exclusão comparava com o primeiro nome do usuário — se o nome estivesse vazio, o botão de deletar ficava liberado sem digitar nada. Trocado por frase fixa "EXCLUIR" (mesmo padrão da autoexclusão do usuário) + linha "Você" bloqueada na própria conta.
- **Convites agora são gerenciáveis**: aba Convites ganhou busca, tira-teimas de status (Ativos/Expirados aguardando TTL/Aceitos) e botão "Revogar" — antes só dava pra visualizar. Regra do Firestore liberada pra admin revogar (`isAdmin()` em `validInvite`... delete).
- **Busca adicionada** nas abas Casais e Convites — só existia em Usuários antes.
- **Contagens truncadas sinalizadas**: "500+"/"200+" em vez de um número que parece exato quando a query bate no teto (`ADMIN_USERS_LIMIT`/`ADMIN_COUPLES_LIMIT`/`ADMIN_INVITES_LIMIT`).
- Limpeza: `WORKSPACE_COLLECTIONS` na Cloud Function `adminDeleteUser` não referencia mais `comments` (feature removida na sessão anterior).

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria de uso do Firestore (leituras/escritas desnecessárias)

- **`coupleInvites`**: política de TTL nativa configurada no Firestore (campo `expiresAt`) — convites expirados são apagados sozinhos, sem Cloud Function. Configuração manual, feita direto no Console.
- **Faturas de cartão**: `subscribeInvoices` limitado às 24 mais recentes por cartão (~2 anos). Sem isso, cada fatura carregada abria seu próprio listener de ledger em `useCardsData` e o total de listeners simultâneos crescia sem parar conforme a conta envelhecia.
- **Feature morta removida**: sistema de comentários do espaço do casal (`SharedComment`, `addSharedComment`, `subscribeSharedComments`, coleção `comments`) — existia o listener e a escrita, mas nenhuma tela nunca chamou nem exibiu isso. Puro custo, zero uso. Removido de ponta a ponta: tipo, schema, serviço, hook, regra do Firestore.
- **Token FCM**: parava de gravar o mesmo token no Firestore toda vez que o app abria. Agora compara com um cache local (`src/pwa/pushTokenCache.ts`) antes de escrever.
- **Guia de quando escalonar**: documentado em `SESSAO.md` o critério prático pra decidir quando vale adicionar `.limit()` numa coleção (regra de bolso: ~500-1000 docs por workspace) e o que monitorar no painel do Firestore.

Detalhes e raciocínio completo em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — feat: resgatar do cofrinho do casal

- Nova ação "Resgatar" no cofrinho compartilhado: retira do total do casal e, opcionalmente, credita como entrada numa conta pessoal — espelha "Guardar" em sentido inverso.
- `GoalContribution` ganhou campo `type: 'deposit' | 'withdrawal'`; estatísticas por pessoa/mês extraídas para a função pura `calculateCoupleGoalStats` (12 testes novos).
- Nova categoria padrão "Cofrinho" (`both_cofrinho`) para as transações de guardar/resgatar não caírem em "Sem categoria".
- Regras do Firestore atualizadas (`goalContributions` aceita `type`) e deployadas em produção.
- Revisão de design da `SharedSpacePage`: já seguia os padrões do app; toggle Guardar/Resgatar e botões em linha reaproveitam os mesmos componentes usados no resto do app (sem CSS novo).

Detalhes e decisões de design em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria pré-lançamento, testes de lógica financeira e recorrência com anchorDay

- Design/consistência: cores literais da `SearchPage` viraram tokens (`noHardcodedColors` volta a passar), `window.confirm` trocado por `useConfirm`, empty states ilustrados em Bills/Recurring/Accounts.
- Fire-and-forget consertado em Bills/Cards/Recurring (formulário não trava mais esperando o servidor) e bug de boot offline corrigido (saldo podia piscar R$ 0,00 antes do cache carregar por completo).
- Suíte de testes de domínio ampliada de 46 para 113 testes (saldo, faturas de cartão, casal, dinheiro, recorrência).
- 2 bugs corrigidos: `parseMoneyToCents` inflava 100x um valor com ponto decimal; `nextOccurrenceDate` pulava fevereiro inteiro numa recorrência no dia 31.
- Novo campo `anchorDay`: recorrência mensal/anual guarda o dia original e volta a ele quando o mês permite (client + Cloud Function + regras do Firestore, já deployadas em produção).

Detalhes técnicos completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-06-22 — feat: redesign página de Análise (SearchPage)

- **KPI strip**: 3 cards no topo — gasto total do mês (destaque laranja), maior categoria com valor, variação % vs. mês anterior com ícone `TrendingUp`/`TrendingDown`/`Minus`.
- **Donut**: aumentado para 200px; centro exibe nome + valor + percentual da categoria selecionada; legenda substituída por barras de progresso coloridas por categoria.
- **Histórico mensal**: altura do gráfico de barras aumentada para 220px; legenda própria com quadradinhos no lugar do `<Legend>` padrão do Recharts; tooltip com uppercase label.
- **Busca**: card de resultados oculto quando campo está vazio.

## 2026-06-22 — feat: logos oficiais com transparência real + fix Firestore coupleMode

- **Logos oficiais**: todos os PNGs de brand substituídos por versões com alpha real (sem fundo branco). `granativa-logo-horizontal.png` (nav/og:image), `granativa-logo-primary.png`, `granativa-logo-stacked.png` e `granativa-logo-stacked-hq.png` adicionados.
- **Favicons**: `favicon-16x16.png` e `favicon-32x32.png` transparentes substituem o `favicon.png` legado (784KB). `index.html` atualizado.
- **Nav/footer landing**: `LandingShell` agora usa a logo horizontal como `<img>` única (sem texto duplicado em HTML). `BrandLogo.tsx`: paths corrigidos para lowercase.
- **fix Firestore**: `validCoupleWorkspaceCreate` não listava `coupleMode` no `hasOnly()` — qualquer usuário recebia `permission-denied` ao criar espaço compartilhado. Corrigido + validação `in ['savings_only', 'transparent', 'balanced']`. `validCoupleWorkspaceUpdate` também corrigido para permitir troca de modo. Regras deployadas.
- **`Seo.tsx`**: og:image corrigido para `granativa-logo-horizontal.png` (casing lowercase).

## 2026-06-22 — rebrand: Granix → Granativa + landing UX mobile

- **Nome final**: app renomeado de "Granix" para **Granativa** (portmanteau: grana + ativa). 35 arquivos atualizados, concordância de gênero corrigida (a/na/da Granativa).
- **Assets**: `public/brand/granativa-*.png` (10 arquivos, casing lowercase). Paths em `index.html` e `LandingShell.tsx` corrigidos.
- **Landing mobile — hover removido**: `whileHover` eliminado de `TiltCard` e couple-card; eventos de mouse no hero ligados só em `(hover: hover)` via `canHover` ref; estilos `:hover` movidos para `@media (hover: hover)`.
- **Stats band**: mantido em linha horizontal no mobile (sem `flex-direction: column`), padding e fonte compactados em `≤520px` — números não quebram mais linha.
- **Botões hero**: `flex-direction: column; width: 100%` em `≤640px` — CTAs empilhados e legíveis no celular.
- **Nav mobile**: botão ghost "Entrar" oculto em `≤480px` para dar espaço ao "Começar grátis".
- **`CountUp`**: simplificado para `motion.span` único com texto completo — elimina quebra de linha entre número e sufixo `%`.

## 2026-06-20 — feat: landing page redesenhada com Framer Motion 3D

- **Hero light**: fundo claro (branco → areia), texto estático, stage (phone + badges) inclina em 3D com o mouse via `rotateX/Y` + `preserve-3d` e `useSpring`.
- **Parallax em camadas**: stage sobe mais devagar no scroll (`useScroll`); badges em Z-depths diferentes (`z: 60 / 30 / -15`) criam profundidade real; phone tem gloss de luz (`useMotionTemplate`) que desloca com o cursor.
- **Grade perspectiva**: `linear-gradient` com `perspective(700px) rotateX(-62deg)` e mask cria piso de grade laranja recuando para o fundo.
- **Seções**: stats band, bento com `TiltCard` 3D hover (`rotateX/Y` no `whileHover`), seção do casal com card hover + `rotateZ`, steps com `whileInView`, FAQ accordion, CTA dark. Tudo com `RevealSection` (useInView + stagger).
- Detalhes técnicos em `docs/history/2026-06.md`.

## 2026-06-20 — rebrand: Zerou → Granativa

- **Novo nome**: app renomeado de "Zerou" para **Granativa**. Tagline mantida: "Controle individual. Organização a dois."
- **Novo logo**: ícone de duas bolas sobrepostas (sólida laranja + outline escuro), gerado com IA. Assets em `public/brand/Granativa-*.png` (`Granativa-app-icon-180/192/512`, `Granativa-maskable-512`, `Granativa-logo-horizontal`, `Granativa-symbol`).
- **PWA manifest**: `name`, `short_name`, `theme_color` (`#EE5524`), `background_color` (`#FAF8F5`) e todos os ícones atualizados em `vite.config.ts`.
- **`index.html`**: `<title>`, meta description, OG tags e `apple-touch-icon` atualizados. Favicon agora é PNG (`/favicon.png`).
- **Componentes e textos**: todas as ocorrências visíveis de "Zerou" → "Granativa" com artigo correto (o/do/na Granativa). Version strings internas do Firestore (`zerou-v12.2-*`, `zerou-cache`) mantidas para não invalidar registros existentes.

## 2026-06-18 — feat: gráficos interativos de análise de gastos (Recharts)

- **`SearchPage` → `Análise`**: donut interativo (clique destaca fatia/legenda, centro mostra categoria + valor) e gráfico de barras entradas vs saídas dos últimos 6 meses. Recharts instalado (`v3.8.1`). Nav renomeada de "Busca" para "Análise" com ícone `BarChart2`.

## 2026-06-18 — fix: ícone de categoria, delete de cartão, InvoicePage simplificada

- **CSS mobile**: `.list-row--with-icon` agora mantém `flex-direction: row` dentro do `@media (max-width: 900px)` — ícone de categoria deixou de quebrar para cima do texto.
- **`deleteCard`** (`cardService.ts`): soft-delete com `isActive: false`. Botão de lixeira adicionado no `CardDetailPage` com `ConfirmDialog` antes de confirmar.
- **`InvoicePage` simplificada**: "Fechar fatura" e "Conciliar manualmente" removidos da UI principal (automação cuida do fechamento). Pagamento via `BottomSheet`. Compras e pagamentos em seções separadas. Antecipação, créditos e tarifas em `<details>` colapsados.

## 2026-06-18 — feat: notificação diária às 20h para registrar gastos

- **`sendDailyLogReminder`** (`functions/src/automation.ts`): Cloud Function scheduled todo dia às 20h (BRT). Busca todos os tokens FCM cadastrados (`collectionGroup('fcmTokens')`), envia push em lotes de 500 com título "Como foi o dia?" e corpo "Registre seus gastos antes de dormir." linkando para `/app/transactions/new`.
- Exportada em `functions/src/index.ts` e deployada em `billing:sendDailyLogReminder(southamerica-east1)`.

## 2026-06-18 — perf: boot instantâneo em internet fraca, saldo não pisca mais

- **`AuthContext`**: estado agora inicializa **sincronamente** do `localStorage` — se o usuário já logou antes, `loading` começa como `false` e o app abre direto sem tela "Carregando Zerou...". Firebase confirma a sessão em background. Timeout de fallback: 1800ms → **500ms**. Bug corrigido: sem cache + Firebase não responde → agora libera `loading=false` em vez de travar.
- **Google Fonts não-bloqueantes** (`index.html`): `<link rel="stylesheet">` externo era render-blocking em redes lentas. Trocado por `rel="preload" onload` — browser baixa em paralelo sem travar o render.
- **Workbox runtime cache** (`vite.config.ts`): fontes do googleapis.com e gstatic.com agora são cacheadas com `CacheFirst` 1 ano — ficam disponíveis offline após primeira visita.
- **Dashboard** (`DashboardPage`): saldo total, disponível e comprometido mostram `—` enquanto `finance.loading` é true, eliminando o flash `R$ 0,00` antes dos dados do Firestore chegarem.

## 2026-06-18 — fix: fatura aberta permanece aberta com pagamento antecipado

- **`resolveInvoiceStatus`**: fatura com lifecycle `'open'` agora sempre retorna `'open'` (exceto `'overpaid'`). Antes, um pagamento total numa fatura ainda aberta a marcava prematuramente como `'paid'` — comportamento errado, pois novas compras ainda podem entrar antes do fechamento.
- Consequência cascata correta: `advance` no pagamento é sempre `true` enquanto a fatura está aberta (qualquer pagamento antes do fechamento é um adiantamento); `Comprometido` já excluía por `outstandingBalanceCents > 0`, então continua correto.
- Teste atualizado para usar `lifecycle: 'closed'` nos cenários de `'partial'`/`'paid'`; novo teste cobre fatura aberta com pagamento antecipado permanecendo `'open'`.

## 2026-06-18 — antecipação de parcelas estilo Nubank

- **Novo tipo de ledger** `installment_anticipation_credit`: credita o invoice futuro quando uma parcela é antecipada, reduzindo seu `outstandingBalanceCents` client-side via `calculateInvoice`.
- **`anticipateInstallments`** reescrito em `cardService.ts`: usa `writeBatch` — adiciona `installment_anticipation_credit` em cada invoice futuro selecionado e `installment_anticipation` (débito total) no invoice atual. Fire-and-forget.
- **Schema atualizado** (`anticipateInstallmentsSchema`): aceita `currentInvoiceId` + array de `credits` `{invoiceId, amountCents, sourceTransactionId}` em vez de valor manual único.
- **`InvoicePage`**: painel de antecipação substituído por seleção inteligente — lista parcelas futuras do mesmo cartão agrupadas por invoice, com checkbox por item, total ao vivo e "Confirmar antecipação". Parcelas já antecipadas são ocultadas automaticamente.
- Comprometido no Dashboard atualiza em cascata: invoices futuros com crédito de antecipação têm `outstandingBalanceCents` reduzido, saindo do cálculo se zerados.

## 2026-06-18 — UI premium: cabeçalhos, ícones de categoria, cards de conta, nav inferior

- **Cabeçalhos**: todas as páginas do app passaram a ter eyebrow + título compacto sem parágrafo de descrição (menos espaço desperdiçado, conteúdo aparece logo de cara).
- **Ícones de categoria**: `CategoryMark` (tile colorido 36×36 com ícone lucide) adicionado em todos os itens de lista de transações — em `TransactionsPage` e `DashboardPage` (recentes). Fallback por tipo: verde para renda, slate para transferências.
- **Contas como cards**: `AccountsPage` reescrita — contas exibidas como cards com gradiente escuro (`--gradient-slate`), saldo em destaque, bank-mark no canto. Form de cadastro agora colapsável (igual ao CardsPage).
- **Nav inferior**: slot 2 trocado de Cartões → Extrato (Transações); slot 4 mantém Cartões. Casal movido para o menu "Mais". Indicador de ponto laranja acima do ícone ativo.
- **Formulários colapsáveis**: `BillsPage` e `AccountsPage` ganharam mesmo padrão do `CardsPage` — form colapsado por padrão, toggle com chevron animado.
- **`CategoryMark`** exportado de `src/components/categoryIcons.tsx` — reutilizável em qualquer lista.

## 2026-06-18 — cartão: offline-first na fatura, fatura aberta em destaque, chip-row de conta

- **`InvoicePage`**: removido `guardAction` — pagamento, crédito, tarifa e antecipação são agora fire-and-forget com reset imediato do form. Botão de pagamento desabilitado até valor e conta estarem preenchidos.
- **`InvoicePage`**: campo "Pagar com qual conta?" trocado de dropdown (`SelectField`) para chip-row (consistência com BillsPage, RecurringPage, GoalsPage).
- **`CardDetailPage`**: fatura aberta aparece em destaque entre o bloco de limite e o formulário de compra, com link direto para pagar e valor em vermelho.
- **`CardsPage`**: cada cartão na lista agora exibe fatura aberta (mês de referência, vencimento, valor em vermelho) quando houver saldo pendente.

## 2026-06-17 — lógica financeira: pagamentos debitam contas, metas não viram gasto

- **`payBill`**: batch atômico marca conta como paga e cria transação de despesa (tag `bill`) debitando a conta selecionada. BillsPage abre sheet de confirmação com valor editável e chip de conta.
- **`recordRecurringPayment`**: batch avança `nextOccurrenceAt` para o próximo período e cria transação de despesa (tag `recorrente`). RecurringPage ganha botão "Registrar" que abre sheet com valor, conta e aviso da próxima data.
- **`contributeToGoalWithTransaction`**: batch incrementa `savedCents` da meta e, quando conta escolhida, cria despesa (tag `meta`). GoalsPage tem chip "De qual conta sai? / Só registrar" no sheet de contribuição.
- **`nextOccurrenceDate`**: função pura que avança uma data por `weekly` / `monthly` / `yearly`.
- **DashboardPage**: `spendingByCategory` exclui transações com tags `meta` e `cofrinho` — contribuições de meta/cofrinho não aparecem mais como gasto no resumo mensal.

## 2026-06-17 — redesign do modo casal e offline-first

- **Sistema de modos** (`coupleMode` no workspace): `savings_only` (só cofrinho), `transparent` (despesas visíveis) e `balanced` (barra proporcional de quem cobre mais). Pode ser escolhido na criação e mudado em qualquer momento via "Gerenciar espaço".
- **Nomes reais**: `WorkspaceMembership.displayName` salvo na criação do workspace e no aceite do convite; "Dono/Parceiro(a)" substituído pelo nome real da pessoa.
- **Validação de saldo no cofrinho**: "Guardar" valida o saldo da conta pessoal selecionada e bloqueia com mensagem amigável se insuficiente.
- **Removido breakdown individual** do cofrinho ("Você juntou / Parceiro juntou"); agora só aparece o total unificado.
- **Removido fluxo de acerto de contas** (settlements); substituído pelos modos transparent/balanced que mostram proporção sem acerto formal.
- **Offline-first**: todos os writes em `SharedSpacePage` refatorados para fire-and-forget (`.catch`); `guardAction` removido. Confirm dialogs aguardam normalmente; o write subsequente é fire-and-forget.
- **CLAUDE.md**: seção `⚠️ REGRA PRINCIPAL` com padrão correto/errado e exemplos de código explicitando que o app deve funcionar offline.

## 2026-06-17 — painel admin em /admin com deleção de usuário via Cloud Function

- **Rota `/admin`** protegida por `RequireAdmin` (email `a.thurcos@gmail.com`); qualquer outro usuário é redirecionado para `/app`.
- **AdminPage** com 4 abas: Visão Geral (4 cards de métrica + tabelas recentes), Usuários (busca por nome/email, tabela completa), Espaços de Casal (dono + parceiro resolvidos por nome), Convites (status, expiração, quem usou).
- **Deleção de conta**: botão de lixeira em cada linha de usuário, modal de confirmação exige digitar o primeiro nome, toast de sucesso mostra quantos documentos foram removidos.
- **Cloud Function `adminDeleteUser`** (`functions-admin/` codebase separado, sem dependência do Stripe): usa Admin SDK para deletar workspace pessoal, espaços de casal criados, membership em espaços alheios, billing, privacy requests e a conta Firebase Auth. Deployed em `southamerica-east1`.
- **Firestore rules**: `isAdmin()` adicionada; admin tem `read` em `users`, `workspaces` e `coupleInvites`.
- **`firebase.json`**: dois codebases separados — `billing` (existente, com Stripe) e `admin` (novo, sem secrets) — permitindo deploy independente.
- CSS 100% com variáveis de token; nenhuma cor hardcoded. Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — cancelar espaço do casal sem parceiro

- **`cancelCoupleWorkspace`** (nova): quando o dono está sozinho e quer sair, deleta em batch o member record, o workspaceRef e o workspace em vez de fazer `update(status: removed)`. O path de update só estava disponível para `role == 'partner'` nas rules, o que gerava "missing or insufficient permissions".
- **SharedSpacePage**: `handleLeaveOrRemove` agora distingue três casos — dono+parceiro (`removePartner`), dono sozinho (`cancelCoupleWorkspace`), parceiro saindo (`leaveCoupleWorkspace`). Botão "Cancelar e sair do espaço" visível sem precisar expandir `<details>`.

## 2026-06-17 — invites de casal deletados após uso em vez de acumular

- **Firestore rule** (`coupleInvites` delete): adicionada condição `status == 'accepted' && usedBy == request.auth.uid` para que quem aceitou o convite possa deletá-lo depois que o membro foi criado.
- **`acceptCoupleInvite`**: após `batch.commit()` confirmar (membro criado, regras satisfeitas), dispara `deleteDoc` fire-and-forget no invite.
- **`createCoupleInvite`**: removida guarda `!== 'accepted'` — agora deleta todos os invites antigos do workspace, incluindo aceitos.
- **`cleanupExpiredInvites`**: removida guarda `accepted`; dono pode limpar tudo (ativos expirados + revogados + aceitos).
- Rules publicadas via `firebase deploy --only firestore:rules`.
- Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — três bugs de navegação e fluxo de convite

- **Bug: usuário logado via na landing** — rota `/` agora usa `RootRoute` que redireciona autenticados para `/app`; antes renderizava `<LandingCss />` incondicionalmente, quebrando o PWA instalado.
- **Bug: aceite de convite perdido após login/cadastro** — `JoinInvitePage` passa `state.returnTo = /join/:code` ao navegar para `/login` ou `/register`; `LoginPage` já usava `location.state.returnTo` para redirecionar de volta. `OnboardingPage` redireciona para `/join/:code` ao terminar onboarding se há invite pendente no localStorage, em vez de ir sempre para `/app`.
- **Bug: botão "Sair" escondido** — "Cancelar e sair do espaço" movido de `<details>` para botão visível na tela de aguardar parceiro.

## 2026-06-17 — redesign do fluxo de aceite de convite de casal

- **`JoinInvitePage`** (`/join/:code`): agora faz preview automático do convite quando o usuário já está logado e com onboarding completo, mostrando o nome do workspace, data de expiração e botão "Entrar" direto na página — sem precisar ir ao `/app/shared`.
- **`SharedSpacePage`** estado sem espaço: se há código pendente no localStorage, mostra o card de aceite como ação primária (não mais escondido em `<details>`); auto-dispara o preview no mount.
- Fluxo anterior ficava preso na etapa do convite pois a UI de aceite estava oculta em `<details>Tenho um convite</details>` e não havia preview automático.

## 2026-06-17 — limpeza de coupleInvites acumulados

- **`createCoupleInvite`**: deleta todos os invites anteriores do workspace (exceto `accepted`) ao criar um novo, em vez de atualizar status para `revoked`. Elimina o backlog de 38 docs acumulados.
- **`revokeCoupleInvite`**: deleta o documento em vez de marcar `status: revoked`.
- **`cleanupExpiredInvites`**: deleta todos os não-`accepted` (revogados + expirados + ativos vencidos) em vez de atualizar status. Invites `accepted` são mantidos pois a Firestore rule de membership faz `getAfter` neles.

## 2026-06-17 — providers de dados compartilhados e higiene de re-renders

- **`FinanceDataProvider` + `SharedDataProvider`** montados no nível do `<RequireOnboardingComplete>` em `App.tsx`: listeners de Firestore agora ficam vivos entre navegações em vez de serem destruídos e recriados em cada troca de página. Todas as 13 páginas autenticadas consomem contexto via `useFinanceContext()`, `useCardsContext()`, `useGoalsContext()`, `useSharedContext()` e `useCoupleSavingsContext()`.
- **`hydrateFromProfile` com guard de igualdade**: o Zustand só notifica subscribers (e grava no localStorage) quando algum dos 5 campos de aparência realmente muda, eliminando re-renders e escritas desnecessárias a cada snapshot do perfil.
- **`limit(300)` em `subscribeTransactions`**: limita o listener a 300 transações mais recentes, evitando crescimento ilimitado de memória e CPU com o tempo.

## 2026-06-17 — estabilidade de listeners em useCardsData

- **Sem cascata de re-subscription em cartões**: dependências dos effects de faturas e ledger trocadas de `state.cards`/`state.invoices` (array inteiro) para `cardIds`/`invoiceIds` (string de IDs). Listeners só são recriados quando o conjunto de cartões ou faturas muda, não a cada atualização de campo (como `localSyncStatus` pending → synced).
- Removido `CODEX.md` da raiz (instruções consolidadas em `CLAUDE.md`).

## 2026-06-17 — higiene de custo Firestore no Blaze

- **Menos writes invisíveis**: a sincronização de aparência só grava em `/users/{uid}` quando tema, densidade, fonte ou movimento realmente mudarem.
- **Menos operações repetidas**: categorias padrão passam a ser preparadas uma vez por workspace na sessão do app, evitando rechecagens a cada mount de página financeira.
- Testes adicionados para garantir que aparência igual não dispara sync e que categorias padrão não são preparadas repetidamente no mesmo workspace.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (45/45), `npm run build`.

## 2026-06-17 — QA preventivo de permissões e listeners Firestore

- **Listeners protegidos com retry**: metas, cartões/faturas/ledger, espaço compartilhado e cofrinho do casal agora tentam novamente em `permission-denied`, `unavailable` e `deadline-exceeded` transitórios antes de mostrar erro.
- **Categorias com cor sem acesso negado**: `firestore.rules` agora permite `color` em criação/edição de categorias, alinhando as regras com os formulários do app.
- **Metas/cofrinho com schema nas rules**: create/update de `goals` e create de `goalContributions` ganharam validação de campos, usuário, valores e `monthKey`.
- Testes de rules adicionados para categoria colorida, meta válida, tentativa de forjar `createdBy` e contribuição zerada.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; `firestore.rules` compilado e publicado em `zerou-26757`. `npm run test:rules` segue bloqueado pelo Java local.

## 2026-06-17 — retry financeiro pós-onboarding e bottom sheet sem arrasto lateral

- **Conta recém-criada mais estável**: leituras financeiras protegidas agora tentam novamente quando o workspace acabou de nascer e o Firestore ainda não confirmou o membership no servidor.
- **Sem erro prematuro no dashboard**: a mensagem “Não foi possível carregar os dados financeiros deste workspace” deixa de aparecer durante a janela curta de confirmação da fundação inicial.
- **Metas no iPhone sem arrasto lateral**: bottom sheets, grids de cor/ícone, campos e controles segmentados receberam contenção de largura para evitar scroll horizontal no Safari/mobile.
- Teste novo cobre retry de `permission-denied` transitório em `useFinanceData`.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; checagem Playwright em viewport 393x852 confirmou `scrollWidth == clientWidth` no sheet.

## 2026-06-17 — exclusão definitiva de conta nas configurações

- Adicionado botão **Excluir minha conta** em `Segurança > Métodos de login`, com confirmação digitada (`EXCLUIR`) e reautenticação por senha ou Google.
- Criado `accountDeletionService`: remove perfil, refs do usuário, workspace pessoal completo, cartões/faturas/ledger, coleções financeiras, billing shell e espaços de casal criados pelo usuário; se for parceiro, sai do espaço antes de apagar a referência local.
- `firestore.rules` agora permite deletes estritos para dados da própria conta, workspace pessoal e workspaces de casal em que o usuário é dono; regras publicadas em `zerou-26757`.
- Textos legais/docs atualizados para refletir que a exclusão automatizada já existe dentro do app autenticado.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — onboarding mais curto e fundação sem erro genérico

- **Questionário inicial compacto**: removido o logo persistente do app autenticado/onboarding e reduzido o espaço vertical do wizard; CTA fica visível sem arrastar na etapa inicial.
- **Causa do erro genérico encontrada**: `firestore.rules` bloqueava `onboardingGoal` e `onboardingChallenge`, embora o onboarding gravasse esses campos no perfil.
- **Regras publicadas**: `firestore.rules` agora permite os campos opcionais do questionário e foi publicado em `zerou-26757` com `firebase deploy --only firestore:rules`.
- **Fundação mais tolerante a rede fraca**: criação inicial não faz mais leitura bloqueante antes da escrita e usa timeout curto para não prender a tela em conexão ruim.
- **Mensagens menos genéricas**: removido fallback “Nao foi possivel concluir esta acao agora” dos caminhos de Auth/SharedSpace; onboarding usa fallback específico.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — boot resiliente em internet fraca e logos offline

- **Boot/Auth resiliente em rede fraca**: `AuthContext` salva o perfil localmente e usa esse cache como fallback depois de 1,8s se Firebase Auth/perfil ficarem presos em conexão “meio online”.
- **Perfil não some em erro de snapshot**: falha temporária do Firestore mantém o último perfil local em vez de deixar o usuário preso no carregamento.
- **Ações sensíveis protegidas**: quando a sessão está usando fallback local (`authFromCache`), telas de verificação/métodos de login ficam bloqueadas até Firebase confirmar a sessão real.
- **SVGs de bancos offline**: Workbox passou a precachear `svg`; logos em `public/bank-logos/` entram no service worker.
- Teste novo para cache de perfil. Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`.

## 2026-06-17 — correção crítica: app travando/escrita pendente, offline e zoom

- **Firestore travando** (escrita ficava "pendente" e só sincronizava após refresh): `experimentalAutoDetectLongPolling` ligado e `persistentMultipleTabManager` no cache — o transporte WebChannel travava em algumas redes/navegadores.
- **Escritas otimistas em todo o app** (`fireWrite` em finance/cards/shared): nenhuma mutação bloqueia mais a UI esperando o servidor (fim do spinner infinito). Dispara a escrita, responde na hora e o `onSnapshot` mostra o item (offline-first de verdade). Validação síncrona (Zod) continua surgindo pro usuário.
- **Metas/cofrinho offline**: removido `orderBy('createdAt')` das queries de goals/goalContributions (offline o serverTimestamp fica nulo e escondia o item recém-criado); ordenação no cliente.
- **Zoom / arrastar lateral**: travado o overflow-x (html/body/app-main) e corrigida a margem negativa do header de valor que estourava a largura no mobile; `viewport-fit=cover`.
- Detalhe em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test` (37/37), `npm run build`.

## 2026-06-17 — Redesign Sol, app mobile-nativo, cofrinho do casal e landing nova

- Direção visual "Sol" (areia + tangerina, DM Sans 800 nos números) aplicada no app inteiro.
- App mobile-nativo: nav inferior com FAB, header de valor nas telas de lançamento, seletores em bottom-sheet, categorias com ícone+cor, onboarding em questionário, empty states ilustrados.
- Despesa no cartão pelo fluxo de Despesa; novo cartão com header de limite; dashboard compacto.
- Espaço do casal: divisão flexível (igual/%/valor) + **cofrinho do casal** (meta compartilhada + contribuições por pessoa, opção de descontar de conta pessoal).
- Tela de **Metas** ligada ao questionário do onboarding.
- Landing reescrita (CSS 3D) com mockup do app e copy de dor (PAS); promovida para `/`.
- SVGs oficiais de ~24 bancos; cores tokenizadas (teste `noHardcodedColors` verde).
- Documentação reorganizada estilo plantão (`CLAUDE.md`, `CODEX.md`, `SESSAO.md`, `docs/`).
- Detalhe técnico completo em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test`, `npm run build`; regras Firestore publicadas.

## 2026-06-15 - Estado atual da main

### Projeto

- Zerou e um SaaS/PWA financeiro mobile-first para controle financeiro individual e organizacao a dois.
- Nome publico do produto: Zerou.
- Tagline oficial: "Controle individual. Organizacao a dois."
- Stack principal: React, TypeScript strict, Vite, Firebase Web SDK, Cloud Firestore, Firebase Auth, Vercel e PWA.
- O app esta em modo de lancamento gratuito. Nao ha cobranca ativa, checkout ativo ou pagina publica de planos.

### Fase 1 - Fundacao SaaS

- Criado o app React/TypeScript/Vite na raiz do repositorio.
- Configurado Firebase client-side por variaveis `VITE_`, sem `firebaseConfig` hardcoded.
- Preparado Firebase Auth com email/senha, Google, reset de senha e logout.
- Criadas rotas publicas e autenticadas com React Router.
- Implementado onboarding inicial com criacao de perfil, workspace pessoal e membership.
- Criado app shell autenticado com sidebar desktop e bottom navigation mobile.
- Implementado dashboard inicial pos-login.
- Implementado design system inicial com tokens semanticos.
- Implementados os seis temas: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Implementado modo `system`, persistencia em `localStorage` antes do primeiro render e sincronizacao do tema em `/users/{uid}`.
- Copiados assets oficiais da Zerou para `public/brand/`.
- Implementado PWA basico com manifest, service worker e icones oficiais.
- Criado `.env.example`, `.gitignore`, `firebase.json`, `firestore.rules`, `storage.rules` e `vercel.json`.
- Ajustado fallback SPA da Vercel para rotas como `/login`, `/register` e `/app/*`.

### Ajuste Spark/Firebase

- Removida a dependencia de Cloud Functions no fluxo ativo da fundacao para manter o app no plano Spark/free.
- Criacao de usuario, workspace pessoal e membership passou a ser feita client-side com regras Firestore restritivas.
- Publicadas Firestore Rules no projeto real `zerou-26757`.
- Corrigido erro inicial de onboarding causado por leitura protegida antes da fundacao existir.

### PWA e atualizacao automatica

- Implementado auto-refresh de versao inspirado no app Plantao.
- Service worker usa `skipWaiting`, `clientsClaim` e limpeza de caches antigos.
- Vercel recebeu headers sem cache para `sw.js` e `workbox-*.js`.
- O app verifica atualizacoes ao abrir, focar, voltar online, voltar de aba oculta e periodicamente.

### Fase 2 - Motor financeiro essencial

- Implementados tipos e contratos de `Account`, `Category`, `Transaction`, `Bill` e `RecurringRule`.
- Criados servicos Firestore client-side para contas, categorias, transacoes, contas a pagar e recorrencias.
- Persistencia de dinheiro em centavos inteiros.
- IDs client-side e `clientMutationId` para idempotencia de transacoes.
- Criado calculo puro de saldo com receita, despesa, transferencia, ajuste e soft delete.
- Dashboard financeiro com saldo total, disponivel livre v1, valor comprometido, proximos compromissos, transacoes recentes e acoes rapidas.
- Rotas adicionadas:
  - `/app/dashboard`
  - `/app/accounts`
  - `/app/transactions`
  - `/app/transactions/new`
  - `/app/transactions/:transactionId/edit`
  - `/app/bills`
  - `/app/recurring`
  - `/app/search`
- Cadastro rapido mobile de transacao com campos principais e avancado recolhido.
- Sync status visual baseado em `hasPendingWrites` do Firestore.

### Fase 3 - Cartoes e faturas

- Implementados tipos de `CreditCard`, `Invoice` e `InvoiceLedgerEntry`.
- Criado dominio puro de faturas em `src/domain/invoices/*`.
- Compra no cartao reconhece despesa sem reduzir saldo da conta imediatamente.
- Pagamento de fatura reduz saldo da conta uma unica vez.
- Suporte a fatura aberta/fechada, pagamento parcial, pagamento total, creditos, encargos, antecipacao e reconciliacao.
- Rotas adicionadas:
  - `/app/cards`
  - `/app/cards/:cardId`
  - `/app/cards/:cardId/invoices/:invoiceId`
- Ledger de fatura tratado como imutavel pelas regras.

### Fase 4 - Espaco compartilhado

- Implementado workspace do casal.
- Implementados convites com codigo amigavel `DUO-XXXX-XX`, hash SHA-256, validade, uso unico, revogacao e regeneracao.
- Geracao de QR code e link de convite no client sem persistir token bruto.
- Rota publica `/join/:code` preserva convite ate login/cadastro.
- Rota autenticada `/app/shared` com criacao de espaco do casal, convites, aceite, claims compartilhados, comentarios e settlements.
- Claims compartilhados nao expõem referencias pessoais de conta, cartao ou fatura.
- Criado calculo de balanco por membro e sugestao de acerto.
- Area compartilhada foi posteriormente simplificada para reduzir confusao no celular.

### Fase 5 - Billing Stripe custom

- Criado scaffold de `functions/` com Node 22, TypeScript strict, Firebase Functions v2, Firebase Admin, Stripe e Zod.
- Implementadas callable functions futuras:
  - `createCheckoutSession`
  - `createCustomerPortalSession`
- Implementado webhook Stripe com validacao de assinatura e `rawBody`.
- Criado processamento idempotente de `billingEvents`.
- Criado processor/retry de eventos.
- Criado script `functions/scripts/seedPlanCatalog.mjs`.
- Criados tipos e regras para `billingAccounts`, `subscriptions`, `billingEvents` e `planCatalog`.
- Decisao de produto posterior: billing fica suspenso. Zerou fica 100% gratuito por enquanto.
- Paginas e links publicos de planos foram removidos do fluxo ativo.

### Fase 6 - Lancamento

- Criada landing publica clara, mobile-first e mais direta.
- Tema Paper claro virou padrao visual publico e primeiro render.
- Landing recebeu mockup mobile com efeito/aspecto 3D leve.
- Funcionalidades passaram a aparecer no corpo da landing.
- Removidos links publicos soltos de planos, cookies e subprocessadores.
- Removido banner de cookies para nao bloquear cadastro/uso.
- Analytics fica desligado por padrao e so inicializa se `VITE_ENABLE_ANALYTICS=true`.
- Rotas publicas reais:
  - `/features`
  - `/security`
  - `/help`
  - `/contact`
  - `/privacy-center`
  - `/legal/terms`
  - `/legal/privacy`
- Rotas legadas redirecionam:
  - `/pricing`
  - `/legal/cookies`
  - `/legal/subprocessors`
- Criados textos juridicos operacionais em `docs/legal/TERMS.md` e `docs/legal/PRIVACY.md`.
- Privacidade e termos foram reforcados para o contexto brasileiro, LGPD, Marco Civil e CDC.
- Privacy Center virou pagina informativa, sem botoes publicos de protocolo.
- Copy publica removeu termos tecnicos como "billing", "checkout", "offline-first", "ledger" e "workspace".
- Mensagens de erro de validacao foram convertidas para texto humano, sem expor JSON, `too_small`, `invalid_format` ou payload tecnico.
- Onboarding autenticado virou modo foco, sem sidebar/bottom nav ate concluir fundacao.
- App shell passou a bloquear atalhos visuais para funcoes privadas antes da fundacao do usuario.

### Pos-Fase 6 - UX financeiro e contas

- Melhorada UX mobile do dashboard, navegacao inferior e fluxo inicial.
- Adicionadas sugestoes de instituicoes financeiras ao criar conta financeira.
- Busca de instituicao aceita nome, alias e acentos.
- Conta financeira sem vinculos agora e excluida fisicamente do Firestore.
- Se a conta financeira tiver lancamentos, contas a pagar ou recorrencias ligadas, a UI bloqueia a exclusao e orienta remover/alterar os vinculos.
- Saldo inicial sozinho nao impede a exclusao de uma conta financeira.
- Foram adicionadas marcas compactas locais por banco.
- Foi adicionada primeira leva de SVGs locais de bancos em `public/bank-logos/`:
  - Nubank
  - PicPay
  - Mercado Pago
  - Neon
  - Modal
  - Wise
  - Nomad
- Criado `scripts/generate-bank-logos.mjs` e script `npm run generate:bank-logos`.
- Bancos sem SVG disponivel continuam com marcador visual ate entrada de assets oficiais confiaveis.

### Documentacao e operacao

- Criados ou atualizados docs operacionais:
  - `README.md`
  - `ARCHITECTURE.md`
  - `SECURITY.md`
  - `PRIVACY.md`
  - `RUNBOOK.md`
  - `docs/PRODUCTION_CHECKLIST.md`
  - `docs/BILLING.md`
  - `docs/BOOTSTRAP_FIREBASE_STRIPE.md`
  - `docs/MANUAL_SETUP_REQUIRED.md`
  - `documentacao-v12.2/IMPLEMENTATION_STATUS.md`
  - `documentacao-v12.2/QA_SCENARIOS.md`
- Criado este `CHANGELOG.md`.
- Criado `HANDOFF-PARA-CLAUDE.md` para passar contexto para outro agente.

### Validacoes executadas

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run functions:build`
- `npm run test:functions`
- `npm audit --omit=dev`
- Deploy de Firestore Rules/Indexes no projeto `zerou-26757`
- Smoke tests em `https://zerou-five.vercel.app`

### Limitacoes conhecidas

- `npm run test:rules` depende de Java local. Neste computador, `java -version` falha com codigo `3221226505`, entao os emuladores ficam bloqueados ate corrigir Java/PATH.
- Bundle inicial ainda passa de 500 kB. Code splitting deve ser feito depois.
- Billing Stripe existe como scaffold futuro, mas nao esta ativo no produto.
- Cloud Functions nao devem ser ativadas sem decisao de produto, Blaze, secrets e checklist operacional.
- Revisao juridica profissional ainda e recomendada antes de escala publica maior.
- App Check, backups, alertas de custo, dominio final e emails oficiais ainda precisam de configuracao externa.
