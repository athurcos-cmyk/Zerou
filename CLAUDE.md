# Zerou — instruções para agentes (Claude)

## Leitura inicial obrigatória

1. Leia `SESSAO.md` (brief curto do estado atual).
2. Use `docs/BUSCA_RAPIDA.md` para decidir qual contexto abrir.
3. Não abra arquivos grandes por padrão. Use `rg`/Grep primeiro em `docs/history/` e nos docs de referência.

## ✅ `npm run test:rules` voltou a funcionar (2026-07-10)

Rode-o **sempre** que mexer em `firestore.rules`. Ele é a única defesa automática contra o padrão de bug mais caro deste projeto (ver a REGRA PRINCIPAL sobre enums/campos novos, mais abaixo) — 3 incidentes reais até hoje.

O Java desta máquina estava quebrado: dois JDK 25 sem a pasta `bin/` e um stub órfão da Oracle (`Common Files\Oracle\Java\javapath`) primeiro no PATH do sistema, morrendo com `0xC0000409` (3221226505). Sem admin não dá pra corrigir o PATH do sistema, então `npm run test:rules` e `npm run emulators` passam por `scripts/with-java.mjs`: ele testa `java -version` nos candidatos e coloca o primeiro que funciona na frente do PATH só daquele comando. Um JDK Temurin 21 foi extraído em `%USERPROFILE%\tools\jdk` — se sumir, o wrapper diz como reinstalar. `firebase-tools` chama `spawn("java")` cru e **ignora `JAVA_HOME`**, por isso não adianta só apontar a variável.

## Mapa de contexto

| Tema | Arquivo |
|---|---|
| Estado atual | `SESSAO.md` |
| Mudanças recentes | `CHANGELOG.md` |
| Busca por assunto | `docs/BUSCA_RAPIDA.md` |
| Histórico mensal | `docs/history/YYYY-MM.md` |
| Design/UI (Sol) | `docs/design/DESIGN.md` |
| Pendências/roadmap | `docs/planning/TODOS.md` |
| Testes/QA | `docs/qa/TESTES.md` |
| Arquitetura | `docs/ARCHITECTURE.md` |
| Segurança/privacidade | `docs/SECURITY.md`, `docs/PRIVACY.md` |
| Operação/deploy | `docs/RUNBOOK.md`, `docs/PRODUCTION_CHECKLIST.md` |
| Custos/Firebase (leituras, gravações, limites grátis, break-even) | `docs/COSTS.md` |
| Billing futuro (inativo) | `docs/BILLING.md`, `docs/BOOTSTRAP_FIREBASE_STRIPE.md` |
| Contas de teste (login p/ verificação em navegador) | `TEST_ACCOUNTS.local.md` (local, fora do git — não existe se ninguém criou na sua máquina) |

## Projeto

SaaS/PWA financeiro mobile-first. Duas frentes: **controle individual** das finanças e **organização a dois** (casal). Tagline: "Controle individual. Organização a dois." Produção: https://granativa.com.br (domínio próprio; `zerou-five.vercel.app` continua funcionando como URL legada do Vercel) · Repo: `athurcos-cmyk/Zerou` · Branch: `main` (direto, sem PR, por pedido do dono).

## Stack

React 19, TypeScript strict, Vite, Firebase Web SDK (Auth + Firestore + Storage), Vercel, Vite PWA Plugin, React Router, React Hook Form, Zod, Zustand, Lucide React. Node >= 22. Testes: Vitest, Playwright, Firebase Rules Unit Testing.

## ⚠️ REGRA PRINCIPAL: o app deve funcionar offline

O Zerou é mobile-first e usuários perdem sinal o tempo todo. **O app precisa funcionar offline**. Toda escrita no Firestore deve usar o padrão fire-and-forget para que a UI responda imediatamente do cache local, sem depender do servidor.

**Padrão correto (fire-and-forget):**
```ts
// Escrita: dispara e trata erro se aparecer
minhaEscrita(dados).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Mensagem amigável.')));
// Feche o sheet, limpe o form — ANTES de chamar o write
setOpen(false);
```

**Padrão ERRADO (bloqueia na rede):**
```ts
// ❌ NÃO FAÇA — trava com spinner se o transporte oscilar
await minhaEscrita(dados);
setOpen(false);
```

**Como funciona:** Firestore usa `persistentLocalCache` + `experimentalAutoDetectLongPolling` (`src/firebase/config.ts`). O write vai pro cache local imediatamente e o `onSnapshot` reflete a mudança. A sync com o servidor acontece em background. Se offline, a operação fica na fila e sincroniza quando voltar.

**Exceção permitida:** operações que *leem* resultado do servidor (gerar convite, preview de invite, confirm dialog) podem usar `await`/`.then()` — mas o *write* subsequente ainda deve ser fire-and-forget.

```ts
// Correto para fluxo confirm → write:
const ok = await confirm({ ... });    // await OK — é leitura de UI
if (!ok) return;
setEstadoOtimista(...);               // atualiza UI imediatamente
minhaEscrita(dados).catch(...);      // write é fire-and-forget
```

### ⚠️ ÚNICA exceção: o espaço do casal exige internet (2026-08-03, pedido do dono)

**Não "conserte" isso de volta pra offline-first.** Tudo que grava no espaço a dois — despesa
dividida, acerto, cofrinho, convite, modo, sair/remover parceiro — passa por `useCoupleWriteGate`
(`src/shared/coupleWriteGate.ts`), que bloqueia quando o aparelho está offline **ou** quando um
write passa de 8s sem o servidor confirmar. E as escritas do casal **devolvem a promise** em vez de
passar por `fireWrite`.

O motivo: offline-first pressupõe **uma pessoa por dado**. No espaço pessoal a fila local nunca
briga com ninguém. No espaço a dois são duas filas subindo em momentos diferentes na MESMA coleção —
dá duplicata invisível e, pior, acerto calculado sobre um saldo que já mudou no servidor quita
dívida que não existe mais. Aqui `fireWrite` engolindo o erro não é proteção, é divergência silenciosa
entre duas pessoas.

Leitura continua livre: dado que já está no cache aparece normalmente offline, só não dá pra gravar.

---

## ⚠️ REGRA PRINCIPAL: todo valor novo de enum num payload do Firestore precisa atualizar a regra no MESMO commit

Já aconteceu **duas vezes** neste projeto — cada uma quebrando uma feature inteira, silenciosamente, por semanas:

1. **`createCategory` ganhou o campo `createdBy`** (17/06) mas `validCategoryCreate` (`firestore.rules`) nunca foi atualizada — toda criação de categoria personalizada foi rejeitada pelo servidor silenciosamente por **~3 semanas**. Só apareceu quando o próprio dono recarregou a página e notou que a categoria tinha sumido.
2. **`InvoiceLedgerEntryType` (TypeScript) ganhou `'installment_anticipation_credit'`** desde a criação da feature "antecipar parcelas", mas `validInvoiceLedgerEntryType` (`firestore.rules`) nunca incluiu esse valor na lista `in [...]` — a feature inteira estava **rejeitada pelo servidor desde que foi criada**, e ninguém percebeu porque o padrão fire-and-forget do app suprime o erro de propósito. Só foi descoberta meses depois, testando manualmente ao vivo em produção (2026-07-09).

**Por que isso acontece**: o TypeScript nunca reclama — o tipo/schema do cliente aceita o valor novo numa boa. A regra do Firestore é um arquivo **separado**, escrito numa linguagem diferente, que ninguém lembra de abrir de novo depois. E como o app é offline-first (`fireWrite` engole o erro de propósito, por design — não expor erro técnico ao usuário), a rejeição do servidor é **completamente invisível**: a UI mostra sucesso, o dado entra no cache local, e só some quando a página recarrega e busca o estado real do servidor.

**Regra**: sempre que um campo ou valor de enum novo for adicionado a um payload que o cliente grava no Firestore (`setDoc`/`updateDoc`/`batch.set`/`batch.update` em `financeService.ts`, `cardService.ts`, `sharedService.ts`, `workspaceService.ts`, etc.), **no mesmo commit**:

1. Abrir `firestore.rules` e conferir se a função `valid*Create`/`valid*Update` correspondente já aceita esse campo/valor — em `hasOnly([...])` (chaves) e em `in [...]` (valores de enum).
2. Conferir se o payload de teste em `tests/firestore.rules.test.ts` (`ledgerPayload`, `categoryPayload`, etc.) reflete o payload real do cliente, não uma versão simplificada — senão o teste passa mesmo com a regra desatualizada, igual aconteceu nos dois incidentes acima.
3. Rodar `npm run test:rules` antes de considerar a mudança pronta. **Voltou a funcionar em 2026-07-10** (via `scripts/with-java.mjs`) — não há mais desculpa pra pular. Deploy da regra só com autorização explícita do dono.

Isso vale tanto pra campo novo (`createdBy`) quanto pra valor novo dentro de um enum já existente (`installment_anticipation_credit`) — os dois incidentes reais foram um de cada tipo.

**Caso especial — `InvoiceLedgerEntryType` tem um TERCEIRO ponto de sincronia (Cloud Function).** Além do enum TS (`src/types/contracts.ts`) e da regra (`validInvoiceLedgerEntryType`, `firestore.rules`), os totais da fatura (Compras/Créditos/Tarifas/Pagamentos e o saldo) são mantidos por uma Cloud Function que bucketiza cada `type` em `functions/src/cards/invoiceTotals.ts` (`invoiceTotalsDeltaForEntry`). Um tipo novo que caia no `return zero` final **não move total nenhum** — o lançamento até existe, mas o saldo da fatura fica errado, em silêncio (mesma invisibilidade offline-first). Então, ao adicionar um valor de ledger novo, são **três** lugares no mesmo commit: (1) enum TS, (2) `firestore.rules` + `test:rules`, (3) `invoiceTotals.ts` — e lembrar que **`git push` NÃO reimplanta functions**: precisa de deploy manual (`npx firebase deploy --only functions`, ver `docs/RUNBOOK.md`). Auditado em 2026-07-19: os 14 tipos estão em sincronia nos três lugares.

---

## ⚠️ Payload de teste que satisfaz a invariante que o CLIENTE viola (2026-08-07)

A REGRA PRINCIPAL acima fala do payload de teste **simplificado demais**, que esconde regra
desatualizada. Existe o espelho disso, e ele custou um bug de "pagar fatura não funciona, sempre":

`validInvoiceLedgerCreate` (`firestore.rules`) exige **`idempotencyKey == entryId`** — o campo tem
que ser igual ao id do documento. O cliente derivava o id com `slice(0, 140)`, e a chave real de um
pagamento tem **150** caracteres numa conta real (o `invoiceId` já começa com o `cardId`, e a chave
reprefixava o cartão). Id truncado, chave intacta, regra recusando, batch atômico caindo,
`fireWrite` engolindo. **Pagar fatura de cartão era impossível desde sempre.**

O teste de regras não pegou porque o helper dele montava `idempotencyKey: entryId` **à mão** — o
payload de teste satisfazia a invariante que o cliente violava. O teste testava a si mesmo.

**Regra**: quando a regra do Firestore impõe uma relação entre dois campos (ou entre um campo e o id
do documento), o teste **não pode montar essa relação à mão**. Ou ele usa a mesma função do cliente
que deriva o valor (extraia pra módulo puro se preciso — foi o que `src/cards/ledgerEntryId.ts` virou),
ou o guarda tem que morar do lado do cliente, afirmando o payload que ele realmente grava.

E o mais eficaz: **faça a invariante impossível de violar em vez de testável**. `ledgerPayload` passou
a derivar `idempotencyKey` do próprio `id`, no único lugar que monta payload de ledger — nenhuma
escrita futura pode divergir, independentemente de como o id foi calculado.

Corolário sobre truncar id: `slice(n)` num id determinístico **colide em silêncio** (duas chaves que
diferem depois do caractere n viram o mesmo documento, e a segunda escrita "vira duplicata"). Já
tinha custado uma correção em 23/07/2026 nos ids de estorno de antecipação e voltou em 07/08 no
pagamento, porque a correção de julho foi pontual. Truncou? Use hash no excedente.

---

## ⚠️ Query (`list`) com `where()` contra uma regra em OR: precisa fechar UM ramo inteiro, não todo campo (2026-07-31)

Achado auditando exclusão de conta: uma query `where('usedBy', '==', uid)` em `coupleInvites` falhava com `"Property workspaceId is undefined for 'list'"` — nenhum documento real tinha esse campo faltando. A causa é o motor de regras do Firestore, não o dado.

**Por quê**: pra uma operação `list` (query), o Firestore precisa **provar estaticamente** que a regra vale pra *qualquer* documento que a query poderia tocar — não avalia documento por documento como faz num `get()`. Se a regra é um `||` de vários ramos (ex.: `whatsappPhoneIndex`/`coupleInvites`/`adminMessages`, que testam `status`, `expiresAt`, `isActiveMember(workspaceId)`, `isAdmin()`), a `list()` só é permitida se os `where(...)` da query fixarem, por igualdade, **todos os campos de PELO MENOS UM ramo inteiro** — não devolve resultado parcial, nem erro "sem permissão" claro, lança um erro de campo indefinido que parece bug de dado.

**Cuidado com a generalização errada** (foi minha primeira leitura, corrigida só depois de testar): NÃO é preciso fixar todo campo que aparece em qualquer ramo — só fechar UM ramo inteiro já basta, os outros nunca são avaliados. Prova viva: `collectCoupleInvites` (`accountDeletionService.ts`, código de 2026-06-17) fixa **só** `workspaceId` — e funciona, porque sozinho já fecha o ramo do `isActiveMember(workspaceId)`. Um campo que não participa de ramo nenhum da regra (como `usedBy` na mesma regra) nunca ajuda, não importa com o que for combinado.

**Regra**: antes de escrever uma query nova (`getDocs(query(collection(...), where(...)))`) contra uma coleção cuja regra de leitura tenha mais de uma cláusula (`||`), verificar se os `where()` cobrem os campos de **um ramo inteiro** da regra (não precisa ser todos os ramos, só um). Se o campo que você quer filtrar não participa de ramo nenhum, **não force a query** — leia um campo já persistido que aponte pro doc certo (padrão usado em `accountDeletionService.ts`: `acceptedInviteId` gravado no doc do membro) e resolva por `get()`/`deleteDoc()` de um id específico, que não passa por essa checagem de "provabilidade de lista".

Teste isolado o mais rápido pra confirmar: `node scripts/with-java.mjs firebase emulators:exec --only firestore,storage "npx vitest run tests/firestore.rules.test.ts --config vite.config.ts -t \"nome do teste\""`.

---

## ⚠️ Limpeza manual no Firestore (script/console) pode deixar cache local do cliente mentindo (2026-07-31)

Apaguei tokens FCM residuais direto no Firestore via script (fora do fluxo do app, pra corrigir um bug de notificação duplicada). Esperado: o app detecta "sem token salvo" e registra um novo sozinho. Na prática, o aparelho ficou **3 reaberturas completas** sem registrar nada.

**Causa**: `src/pwa/notifications.ts` comparava o token obtido contra um cache em `localStorage` (`pushTokenCache.ts`) só pra evitar escrita redundante no Firestore a cada boot — uma otimização legítima, mas que **assume que o Firestore sempre reflete o que o cache diz**. Como o token FCM raramente muda (mesma inscrição de push = mesmo token), `getToken()` devolveu o valor de sempre, o cache disse "igual, nada a fazer", e o código nunca soube que o documento correspondente tinha sido apagado por fora.

**Regra**: qualquer cache local (`localStorage`, `sessionStorage`, cache em memória) que existe só pra **evitar reescrever algo que já está certo no servidor** precisa, cedo ou tarde, verificar a suposição — não confiar cegamente que "já escrevi isso antes" ainda vale. Se uma limpeza manual no banco (script, console do Firebase, correção ad-hoc) é sequer remotamente possível no ciclo de vida de um dado, o código que lê o cache precisa de uma forma de perceber que o servidor mudou por fora, ou vai se autoconvencer de que está tudo certo enquanto o servidor está vazio. No caso do push, a correção foi um `getDoc` extra (1 leitura, só no caminho "cache diz que não mudou") confirmando que o documento existe antes de pular a escrita — barato, e fecha essa classe de bug pra sempre, não só pra este incidente.

## ⚠️ Trocar o produtor NÃO apaga o acervo: dado que já vazou continua no aparelho de todo mundo (2026-08-07)

O PWA instalado do dono passou a abrir em **tela branca** — com internet e sem internet, sobrevivendo
a fechar e reabrir o app. A causa raiz foi uma correção **anterior, correta, e mesmo assim incompleta**.

Em 24/07/2026, `persistentMultipleTabManager` foi trocado por `persistentSingleTabManager` porque as
chaves `firestore_clients_*`/`firestore_targets_*` que ele grava no `localStorage` só se limpam num
fechamento de aba limpo (`beforeunload`) — evento que um PWA mobile nunca dispara — e acumulam até
estourar a quota, derrubando o SDK com `INTERNAL ASSERTION FAILED`.

A troca parou de **criar** chaves novas. **Não apagou nenhuma das já existentes**, e nenhum outro
caminho do app apaga (`clearAccountLocalCaches`, do logout, filtra só `zerou.*`). Ou seja: todo
aparelho que rodou a versão anterior continuou carregando o acervo até estourar. Duas semanas depois,
estourou. Diagnosticado sem cabo USB pelo teste **aba normal (branca) × aba anônima (abre)** — a
anônima tem `localStorage` vazio, o que isola estado local de rede/CSP/build de uma vez só.

**Regra**: quando o bug for da forma *"isto acumula e nunca é removido"*, trocar o produtor **não
fecha o caso**. A correção precisa das **duas metades no mesmo commit**:

1. Parar de produzir (a parte que todo mundo lembra).
2. **Apagar o que já existe**, num caminho que roda no **boot de todo aparelho** — não no logout, não
   numa tela específica, não atrás de um erro que precisa ser capturado primeiro.

E onde colocar a limpeza importa: `purgeLegacyFirestoreTabMarkers` (`src/firebase/legacyStorageCleanup.ts`)
é chamada **de dentro do `getFirebaseServices()`, imediatamente antes do `initializeApp`** — ali a
ordem é garantida **por construção**, não por quem lembra de chamar primeiro no `main.tsx`. Mesma
filosofia do `ledgerPayload` derivando `idempotencyKey` do próprio `id`.

Num app offline-first isso é pior do que parece: não há erro na tela, não há log no servidor, e o
aparelho afetado é justamente o de quem usa há mais tempo.

## ⚠️ Error boundary do React NÃO pega erro assíncrono — e era onde a autorrecuperação morava (2026-08-07)

Achado na mesma investigação. O `firestoreRecovery.ts`, criado em 24/07 exatamente pro
`INTERNAL ASSERTION FAILED`, só era acionado pelo `componentDidCatch` do `AppErrorBoundary`. Mas esse
erro **nasce assíncrono** dentro do SDK (entrega de snapshot, callback de IndexedDB), e error boundary
do React só enxerga erro de render/lifecycle. A rede de segurança estava **inalcançável no caminho
mais provável** — e `rg` por `window.onerror`/`unhandledrejection` no `src/` inteiro dava **0
ocorrências**. Resultado: `#root` vazio, tela branca, muda, permanente.

Somava-se a isso o `AppErrorBoundary` estar **abaixo** do `AuthProvider` na árvore — justo o provider
que mexe com Firebase Auth, Firestore e IndexedDB. Provider quebrando acima do boundary = árvore
inteira sem montar.

**Regra**: erro que nasce assíncrono precisa de handler global (`src/utils/globalErrorHandler.ts`,
primeiro import do `main.tsx` de propósito — imports estáticos avaliam na ordem em que aparecem).
Boundary de React cobre render; **não** cobre callback de SDK, `setTimeout` nem promise.

⚠️ **E o inverso é regra também: erro assíncrono NUNCA pode pintar tela de falha neste app.** Duas
armadilhas reais encontradas ao escrever o handler, as duas quebrariam o uso **offline**, que aqui é
operação normal e não erro:

- O `<link>` de fonte do Google falha **sempre** que o aparelho está sem rede. Handler que trate
  qualquer recurso como fatal cobriria com tela de erro um app que está funcionando. Só conta
  `HTMLScriptElement` com `src` **da própria origem**.
- Promise rejeitada é **rotina**: a REGRA PRINCIPAL offline-first manda gravar fire-and-forget. Por
  isso `unhandledrejection` só faz log e checa o caso auto-recuperável — **nunca** pinta tela. Só boot
  que não montou (`#root` vazio) pinta.

## ⚠️ Hash no `vercel.json` é calculado sobre BYTES — CRLF do Windows ≠ LF do git (2026-08-07)

O `script-src` do CSP libera o script inline do `index.html` por hash SHA-256. O hash foi gerado a
partir da **cópia de trabalho no Windows** (CRLF, 1242 bytes), mas o git guarda o arquivo em **LF**
(1219 bytes) e é isso que a Vercel serve. Os dois **nunca bateram**: o bootstrap de tema esteve
**bloqueado em produção desde o commit que introduziu o CSP** (`61bad23`), e nada acusava — build,
typecheck e testes passam, e o único sinal era um erro no console.

Mesma família dos outros incidentes deste arquivo: **uma invariante entre dois arquivos que nenhuma
ferramenta verificava**. Fechado pelos dois lados, seguindo a lição de tornar a invariante impossível
de violar em vez de só testável:

- `.gitattributes` fixa `index.html` em `text eol=lf` — a cópia local passa a ser **byte-idêntica** à
  que a Vercel serve, então recalcular o hash à mão no Windows não erra mais.
- `src/test/cspInlineScriptHash.test.ts` recalcula o hash de **todo** script inline normalizando pra
  LF e afirma que o `script-src` libera cada um (+ trava `'unsafe-inline'` de voltar escondido).

**Regra**: mexeu no script inline do `index.html`, rode `npm test` — o teste acima falha sozinho. E
qualquer hash/assinatura calculado sobre conteúdo de arquivo neste repo precisa normalizar line
ending antes, ou fixar o arquivo em LF no `.gitattributes`.

**Corolário separado, do mesmo dia**: o rewrite catch-all do SPA (`"/(.*)"` no `vercel.json`) engolia
`/assets/`, então um chunk que sumiu do servidor voltava **`200 text/html`** em vez de 404. Módulo JS
que recebe HTML falha ao parsear **sem erro acionável** — outra fonte de tela branca. Agora é
`"/((?!assets/).*)"`. Rewrite de SPA nunca deve cobrir o diretório de assets com hash no nome.

## ⚠️ Notificação push chegando em dobro — NÃO RESOLVIDO apesar de 3 tentativas (2026-07-31)

A documentação do Firebase Messaging dá a entender que `onBackgroundMessage` (service worker) e `onMessage` (página) são mutuamente exclusivos: com o app em foco, quem recebe é `onMessage`, e o SDK não mostra notificação sozinho; sem foco, quem recebe é o SW. Num Android real (PWA instalado) isso não se sustentou, e **nenhuma das 3 correções tentadas na mesma sessão eliminou a duplicação**, cada uma descartada só depois de testada ao vivo contra a function real de produção (`gcloud scheduler jobs run`, não um script à parte):

1. `tag` igual (`título|corpo`) nos dois `showNotification()` — já existia, insuficiente sozinha.
2. `document.visibilityState === 'visible'` como trava no handler de foreground — pareceu funcionar num primeiro teste, depois voltou a duplicar. `visibilityState` não é confiável em todo Android/WebView (pode reportar `'visible'` em segundo plano).
3. Cache Storage (`caches`) como dedup real entre os dois contextos — a `shouldDisplayPush()` em `src/pwa/notifications.ts`/`vite.config.ts` ainda está no código (é uma melhoria real, testada com 14 casos), mas **a duplicação persistiu mesmo assim**, testada ao vivo depois do deploy.

**O que isso ensina**: o fato de a tentativa 3 (que fecha especificamente a corrida SW-vs-página) não ter resolvido é evidência de que a causa pode não ser essa corrida — hipóteses não confirmadas em `docs/planning/TODOS.md` (check-then-write não-atômico no dedup; redelivery na camada de transporte do Web Push, que nenhuma dedup client-side resolveria sozinha). **Regra pra quem retomar**: não assumir que a próxima ideia "óbvia" vai resolver sem testar contra a function real de produção — as 3 tentativas anteriores pareciam corretas no código e nos testes automatizados, e nenhuma bateu na prática.

---

## ⚠️ Faixa embaixo da bottom nav no Android instalado: bug do PRÓPRIO Chrome, não do nosso CSS (2026-08-08)

Print de uma usuária (iPhone 16, PWA instalado) mostrou a bottom nav congelada no meio da tela.
Consertar isso virou uma sessão de **6 commits** no mesmo trecho, os 5 primeiros cegos (CSS
plausível, nunca medido no aparelho real), até medir de verdade e achar que a causa nem era nossa:

1. `54395ae` — `overflow-x: hidden` no `html`/`body` forçava o `<body>` a virar scroll container;
   no Safari iOS isso descola `position: fixed` (a nav "flutuava" no meio da tela rolando). Trocado
   por `clip`.
2. `348721d` — `clip` no `html` corta a caixa do próprio root: o fundo da página parava de pintar
   fora dela e as barras do sistema caíam na cor padrão do SO (preta no Android, branca no iPhone).
   `clip` saiu do `html`, ficou só no `body`.
3. `4da2e12` — a faixa preta foi diagnosticada (errado, ver commit 4) como `env(safe-area-inset-bottom)`
   sendo **dinâmico** no Chrome 135+ Android (zera com o "chin" de gestos visível). Nav passou a
   usar `--safe-area-max-inset-bottom` (estático, com fallback pro iOS) + o truque
   `bottom: calc(dinâmico - estático)` recomendado pelo Chrome.
4. `d27ea04` — o dono corrigiu a conclusão do commit 3: a faixa preta era regressão do PRÓPRIO
   commit 2, não bug antigo do Android. `overflow-x` saiu de vez do `html` e do `body`.
5. `ad1e839` — como a faixa **continuou** depois do commit 4 (confirmado ao vivo, reinstalando o
   PWA pra descartar WebAPK com manifest desatualizado), entrou um diagnóstico temporário
   (`?debugSafeArea=1`, gravando em `localStorage` porque o PWA instalado não tem barra de endereço
   pra digitar query string) medindo ao vivo `--safe-area-max-inset-bottom`, `env(safe-area-inset-bottom)`
   cru e a posição real da `.mobile-nav`.

**O print do diagnóstico no aparelho real mudou tudo**: `env(safe-area-inset-bottom)` e
`--safe-area-max-inset-bottom` vinham **0px** tanto numa aba comum quanto no PWA instalado
(`display-mode: standalone`), e a `.mobile-nav` já terminava exatamente em cima de `window.innerHeight`
nos dois casos (gap ≈ 0). Ou seja: a nossa nav já pintava até o último pixel que o navegador
disponibiliza — não sobrava CSS nenhum pra escrever. A faixa preta existia **fora** da área que
`window.innerHeight` mede, em qualquer contexto — é a barra de navegação do próprio Android, numa
faixa separada, fora do alcance de qualquer CSS/JS da página.

Confirmado com uma pesquisa (não achado no código): existe um bug do Chromium aberto desde março de
2025 — PWA **instalado** no Android (WebAPK, via "Adicionar à tela inicial") não recebe renderização
edge-to-edge mesmo com `viewport-fit=cover` implementado certinho, embora uma ABA comum do mesmo
Chrome funcione. Um engenheiro do Chrome confirmou publicamente em 24/03/2026: "*this is a known
shortcoming*", bug "assigned" mas **sem previsão de lançamento**. Fonte:
https://tech-ish.com/2026/07/15/google-chrome-for-android-pwa-edge-to-edge/ (a implementação de
"short-edges cutout mode" ainda nem saiu do Canary/Beta em jul/2026).

**Regra**: se aparecer de novo um relato de "faixa/barra estranha embaixo da bottom nav" no PWA
instalado Android — **não tente mais CSS**. É esse bug do Chrome, confirmado e sem fix disponível.
Confirmar rápido sem escrever nada: alternar o tema claro/escuro do **sistema operacional** (não do
app) — se a faixa mudar de cor junto, é o SO pintando aquela área, não a nossa página. Mitigação
possível hoje (não é fix, é paliativo): deixar o modo de tema do app em "Sistema" pra ele acompanhar
o tema do celular — a faixa continua lá, mas para de destoar visualmente porque as duas cores batem.

**Lição maior, pra qualquer bug de CSS/layout que sobreviva a mais de 2 tentativas**: parar de
ajustar CSS às cegas e **medir o valor real no aparelho** (um diagnóstico temporário rápido,
removido depois, como o `?debugSafeArea=1` acima) é mais barato que outra rodada de tentativa e
erro — principalmente quando a "correção" de uma vez já criou regressão nova duas vezes seguidas no
mesmo dia (commits 1→2 e 2→3 acima). Mesmo padrão já registrado na seção de push em dobro, logo
abaixo.

---

## Regras de código

- **Dinheiro sempre em centavos inteiros** (`amountCents`); exibir via `formatMoney()`.
- **Firestore** (não Realtime Database). Não mudar sem redesenhar.
- **IDs client-side** + `clientMutationId` para idempotência.
- Onboarding e fluxos financeiros rodam **client-side com Security Rules** restritivas — sem Cloud Functions no fluxo principal, mesmo com o projeto Firebase no Blaze.
- **Offline-first**: ver seção acima. Nunca use `guardAction` ou wrapper async que dê `await` em escrita pra liberar UI.
- Coleções por workspace: `workspaces/{id}/{accounts|categories|transactions|bills|recurring|goals|goalContributions|cards|...}`.
- UI mobile-first. Componentes-base de UX: `BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState` (ver `docs/design/DESIGN.md`).
- Cores: tokens em `src/styles/themes.css`. **Não** usar hex/rgba literal fora de `themes.css` e `src/theme/palette.ts` (teste `noHardcodedColors` falha). Zona de marketing `src/landing/` é exceção.
- Edição cirúrgica: não reescrever arquivo inteiro para mudar poucas linhas.
- Antes de mexer em UI, leia `docs/design/DESIGN.md`.

## Pontos sensíveis (nunca fazer)

- Não commitar `.env.local` nem service account.
- Não hardcodar `firebaseConfig` (somente variáveis `VITE_`).
- Não ativar Cloud Functions, billing de produto, recursos pagos novos ou serviços Google Cloud extras sem pedido explícito. O projeto Firebase está no Blaze, mas o app segue gratuito e sem checkout ativo.
- Não mudar a landing/páginas públicas para dark por padrão (sempre claras/Paper).
- Não expor erro técnico ao usuário final (usar `getUserFacingErrorMessage`).
- Não usar logo de banco sem fonte confiável.
- Dados financeiros pessoais não vazam para o espaço do casal.

## Validação antes de entregar

`npm run typecheck` · `npm test` · `npm run build`. Deploy de regras: `npx firebase deploy --only firestore:rules --project zerou-26757` (somente regras; não toca billing/functions/hosting).

## Atualização de docs no fim da sessão

Cada arquivo tem uma função. Não duplique histórico no `SESSAO.md`.

| Arquivo | Atualizar quando | Não atualizar quando | Como escrever |
|---|---|---|---|
| `CHANGELOG.md` | Entregou código, docs, config, bugfix, decisão de produto ou reorganização relevante | Conversa, análise sem mudança, ajuste mínimo | Resumo curto no topo, 3-8 bullets, linkando para `docs/history/` se houver detalhe |
| `SESSAO.md` | Mudou estado atual, stack, fluxo, caminhos importantes ou regra essencial | Foi só mais uma sessão/bugfix comum/UI pontual | Brief vivo e curto, sem virar diário |
| `docs/history/YYYY-MM.md` | A sessão precisa de mais de 8 bullets, tem contexto de decisão, auditoria, plano ou detalhe útil depois | Mudança pequena que cabe no changelog | Registro por mês, título datado, detalhes técnicos/produto |
| `docs/BUSCA_RAPIDA.md` | Mudaram caminhos, nomes, pastas, assuntos ou comandos de busca | Feature comum que não muda onde procurar | Mapa de navegação, tabelas e comandos `rg` |
| `docs/planning/TODOS.md` | Abriu, fechou ou repriorizou pendência | A tarefa já entrou no changelog e não gerou pendência | Item acionável ou concluído, critério claro |
| `docs/ai/VIC.md` | **SEMPRE** que mexer na assistente Vic — prompt, modelo, rate limit, UI, fluxo, secrets, bug, correção, nova capacidade | Feature que não toca na IA | Documento canônico da feature; toda informação relevante vive lá, não espalhada |
| `docs/design/DESIGN.md` | Mudou token, fonte, componente-base ou regra visual | Ajuste de conteúdo sem mudar o sistema | Sistema vivo: tokens, layout, componentes |
| `README.md` | Mudou setup, comandos ou entrada do projeto | Mudança interna sem impacto pra quem entra no repo | Onboarding curto |

Regras sem ambiguidade:

- Se nada mudou em arquivo, não atualize docs.
- Entrega relevante → atualize `CHANGELOG.md`.
- Detalhe que não cabe em 3-8 bullets → vai pro `docs/history/YYYY-MM.md`, e o `CHANGELOG.md` fica só com o resumo + referência.
- `SESSAO.md` descreve o presente. Não vire diário.
- `docs/BUSCA_RAPIDA.md` só muda quando a forma de achar contexto muda.

## Observação de contexto

Arquivos grandes ficam fora da raiz, em `docs/`, de propósito. Não traga histórico gigante de volta pra raiz.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
