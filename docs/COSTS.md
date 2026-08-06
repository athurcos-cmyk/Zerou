# Custos — Firebase, cache e limites grátis

> Análise de como o Granativa usa leituras/gravações do Firebase, quanto isso custa, e até
> quantos usuários dá pra crescer no grátis. Criado em **2026-07-18**. Números de preço
> pesquisados nas fontes oficiais (ver o fim). **São estimativas com premissas explícitas** —
> o número real está sempre no Firebase Console → *Usage*. Traga o real quando tiver usuários
> e a conta se refina.

## TL;DR

- **O cache que fizemos (localStorage) não custa nada no Firebase** — é 100% local, sobrescreve
  uma foto pequena no lugar (não empilha).
- **Blaze não significa pagar**: inclui as mesmas cotas grátis do Spark; só cobra o que passar.
- Dá pra rodar **de graça até ~250 usuários ativos/dia** (a **leitura** é o gargalo). Isso
  equivale a uns **600–1.000 cadastrados**.
- Passando disso, o custo é **minúsculo**: ~US$ 5/mês por 1.000 ativos/dia; ~US$ 50–60/mês por
  10.000. Custo por usuário < 1 centavo de dólar/mês.
- Os custos que pesam **antes** do Firestore: domínio, Vercel (se precisar do Pro) e sobretudo
  o **DeepSeek/Vic** (cobrado por token, fora do Firebase).

## 1. Os dois caches locais (e por que não incham)

São coisas diferentes, as duas no **celular** e as duas **sem custo Firebase**:

| Cache | O que é | Cresce? | Tamanho | Papel |
|---|---|---|---|---|
| **IndexedDB** (do Firestore) | Banco embutido no navegador/PWA onde o SDK guarda **cópias dos documentos** sincronizados | Sim, mas o SDK limita e faz coleta de lixo | KB a poucos MB | Faz o app funcionar offline; leitura servida daqui **não é cobrada** |
| **localStorage** (nosso) | Chave→texto simples com a "foto" do que pintar na hora (`dashboardViewCache`, `profileCache`) | **Não — sobrescreve** a mesma chave | Poucos KB, fixo | Acelerador de exibição (pinta síncrono no boot, mata o "pisca") |

**IndexedDB** é um banco de dados dentro do próprio navegador (bem maior que o localStorage, que
tem ~5–10 MB). O Firestore usa ele por baixo do `persistentLocalCache`: cada documento que
sincroniza vira uma cópia lá. É isso que deixa o app abrir com dado offline e **não recobrar
leitura** do que já está local. A diferença crucial: ler do IndexedDB é **assíncrono** (tem um
custo de ~1–2s no boot frio, principalmente no celular) — por isso a gente pôs a "foto" no
**localStorage**, que é **síncrono** e pinta no primeiro frame enquanto o IndexedDB carrega.

**"Cada transação salva um cache novo?"** Não. Cada workspace tem **uma** chave no localStorage;
o app reescreve a mesma foto por cima. Lançar 10 ou 10.000 transações dá na mesma: uma foto de
tamanho fixo, trocada no lugar. Não acumula, não gasta rede nem bateria.

## 2. Limites grátis atuais (2026)

O **Blaze inclui as cotas grátis do Spark**; paga-se só o excedente. As cotas de leitura/gravação
**zeram todo dia** (~4–5h da manhã no Brasil), não por mês.

| Recurso | Cota grátis | Preço além do grátis |
|---|---|---|
| Leituras | **50.000 / dia** | US$ 0,06 / 100 mil |
| Gravações | **20.000 / dia** | US$ 0,18 / 100 mil |
| Exclusões | **20.000 / dia** | US$ 0,02 / 100 mil |
| Armazenamento | **1 GiB** | ~US$ 0,18 / GiB·mês |
| Cloud Functions | **2 mi invocações / mês** | US$ 0,40 / milhão |

## 3. Como o app usa leituras/gravações (já bem econômico)

Otimizações que já existem e mantêm o custo baixo — **não desfazer**:

- **Persistência offline**: leitura do cache local **não é cobrada**. Reabrir sem nada ter mudado
  gera quase zero leitura.
- **Janela de 300 transações** (`subscribeTransactions`, `limit(300)`): o app não lê o histórico
  inteiro (ver a limitação na seção 6).
- **Saldos e faturas incrementais** (2026-07-16): antes o app re-somava o histórico a cada
  abertura — chegava a **1.500+ leituras por reabertura**. Eliminado; hoje lê o total já pronto.
- **Ledger de fatura sob demanda**: só carrega ao abrir Cartão/Fatura/Análise, não no boot.
- **Soft-delete**: excluir no app marca `deletedAt` (conta como **gravação**, não exclusão) — a
  cota de exclusões fica quase intocada.

Gravações por ação: lançar uma transação ≈ 1–3 gravações (transação + ajuste de saldo + às vezes
total da fatura via Cloud Function).

## 4. Até quantos usuários no grátis

Modelo com premissas de um usuário ativo típico (ajuste com o número real do console):

- ~**200 leituras/dia** por ativo (uma carga fria + deltas + funções agendadas). Faixa 100–400.
- ~**20 gravações/dia** por ativo. Faixa 10–40.

| Limite | Conta | Teto (ativos/dia) |
|---|---|---|
| Leituras (50k/dia) | 50.000 ÷ 200 | **~250** (faixa 125–500) |
| Gravações (20k/dia) | 20.000 ÷ 20 | ~1.000 |

**A leitura bate primeiro: ~250 usuários ativos/dia.** Como nem todo cadastrado abre no mesmo dia
(~30–40%), equivale a **~600–1.000 cadastrados** antes de pagar qualquer coisa.

## 5. Custo além do grátis + quanto cobrar

Custo marginal por usuário (< 1 centavo de dólar/mês):

- Leituras: ~6.000/mês × US$0,06/100k = **~US$ 0,004/usuário/mês**
- Gravações: ~600/mês × US$0,18/100k = **~US$ 0,001/usuário/mês**

| Usuários ativos/dia | Custo Firestore/mês (estimado) |
|---|---|
| até ~250 | **US$ 0 (grátis)** |
| 1.000 | ~US$ 5 |
| 5.000 | ~US$ 20–25 |
| 10.000 | ~US$ 50–60 |

**Quanto cobrar pra não sair do bolso:** o custo por usuário é meio centavo de dólar/mês, então o
Firebase quase não é o problema. Cobrir 1.000 ativos (~US$5/mês) exige **5 pessoas pagando
~R$5/mês** ou **30 pagando R$1/mês**. Um apoio simbólico (**R$5–10/ano** de quem quiser) já
cobre uma base grande de usuários grátis. Os custos fixos (domínio ~R$40/ano, Vercel, e o
**DeepSeek/Vic** por token) pesam mais que o Firestore — manter o rate limit de 60 msgs/dia por
workspace é o que segura o custo da IA.

## 6. Limitação atual: só as 300 transações mais recentes aparecem

`subscribeTransactions` traz as **300 mais recentes por data**, e nem Transações nem Análise têm
"carregar mais" — as duas filtram esse mesmo pacote no cliente. Consequências:

- Transações **além da 300ª mais recente não aparecem** hoje no app. **Não são apagadas** — ficam
  seguras no Firestore, só não são carregadas.
- Um usuário ativo (~5–10 lançamentos/dia) chega a 300 em **~1–2 meses**. Hoje ninguém chegou
  (app tem ~2 meses), mas é uma feature a fazer antes que os primeiros ativos acumulem tanto.
- É um **trade-off deliberado de custo/velocidade**: carregar histórico ilimitado a cada boot
  seria lento e caro em leituras. Por isso a janela.
- **Solução quando precisar**: paginação ("carregar mais" com `startAfter` + `limit`) em
  Transações, e/ou fazer a Análise buscar o mês selecionado direto do servidor (em vez de filtrar
  as 300 em memória). Custa mais leitura só quando o usuário realmente pede o histórico antigo.

Registrado em `docs/planning/TODOS.md`.

## 7. O que vigiar

1. **Alerta de orçamento** no Google Cloud Billing (ex.: avisa em US$1 e US$5) — nunca ser
   surpreendido.
2. **Número real** no Firebase Console → *Usage* (Firestore). Vale mais que qualquer estimativa.
3. **Cloud Functions agendadas** (rodam todo dia no relógio; o custo delas aparece como **LEITURA**,
   não como invocação — uma função que roda 1×/dia mas lê 5 mil docs soma 5 mil na cota de leitura,
   não em "Functions"). Verificado no código em **2026-07-21**: a maioria é **enxuta**, usa `where`
   indexado e lê só a fatia acionável do dia, então quase não cresce com a base:
   - `closeInvoicesDue` (`where closingDay == hoje`), `generateRecurrences` (`where nextOccurrenceAt <= agora`)
     e `sendDueReminders` (`where dueDate` na janela) → leem só os cartões/recorrências/contas **do dia**. ✅ enxuto.
   - ~~`sendBudgetAlerts`~~ → **removida do ar em 06/08/2026** (lia todos os orçamentos ativos + 1
     consulta de gasto do mês por orçamento; ⚠️ era a de custo médio, crescia com quantos usuários
     usam orçamento). Saiu por **corretude**, não por custo: contava compra parcelada no cartão pelo
     valor cheio no mês da compra, contra a parcela que a Análise mostra. Efeito colateral bom: uma
     agendada a menos por dia. ⚠️ E registra o limite oposto: **o alerta de orçamento não voltou pro
     cliente** porque colocá-lo no Dashboard exigiria assinar o ledger da fatura **no boot** —
     estimado em ~700 leituras por boot frio numa conta com 2 cartões, ~3,5× a cota diária de um
     usuário ativo (ver § "Ledger de fatura sob demanda" acima e `docs/history/2026-08.md`).
   - **`sendDailyLogReminder`** → `collectionGroup('fcmTokens').get()` **sem filtro**: lê o token de push
     de **todos** os usuários, todo dia, ativo ou não. **É o único que cresce linear com a base total**
     (1.000 usuários → ~1.000 leituras/dia só nisso; 10.000 → ~10.000/dia) e o **primeiro a otimizar**
     quando crescer — paginar, ou mandar só pra quem não lançou no dia em vez de varrer todo mundo.
4. **DeepSeek/Vic**: custo externo por token, fora do Firebase. Pode virar o maior custo se a IA
   for muito usada.

## 8. Por que a Vic do WhatsApp "demora" — e o preço de resolver (2026-07-30)

Pergunta do dono: a Vic responde certo, mas às vezes demora, e ele suspeitou do prompt ter
crescido. **Não é o prompt.** Medido nos logs reais do `whatsappWebhook`, cruzando
`whatsapp_message_received` com a resposta pelo mesmo `execution_id`:

| Situação | Tempo até a resposta |
|---|---|
| Instância **quente** (mensagens em sequência) | **2,2 – 3,2 s** |
| Instância **fria** (primeira depois de uma pausa) | **4,8 – 6,2 s** |

O que fecha o caso: **a amostra mais lenta de todas (6,2 s) é de 28/07**, um dia *antes* de a lista
de ícones do prompt crescer; e a mais recente (5,1 s) tem um `Starting new instance` cinco segundos
antes dela nos logs. A lista de ícones tem 964 caracteres (~240 tokens) — prefill, na casa de
dezenas de milissegundos.

A causa é **cold start**: sem `minInstances`, o Cloud Run desliga a instância quando não há
tráfego, e cada mensagem depois de uma pausa paga 3,7–5,3 s de boot (visível como latência da
primeira requisição). Deploy piora a primeira mensagem seguinte — revisão nova, contêiner novo.

**Preço de matar o cold start** (`minInstances: 1`), com a config atual desta function
(`cpu=1`, `memory=512Mi`, **`cpu-throttling=false`** — CPU cobrada o tempo todo em que a instância
existe, não só durante a requisição), em `southamerica-east1` (região tier 2), ~730 h/mês:

```
CPU:      1 vCPU × 2.628.000 s × ~US$0,0000216/vCPU-s  ≈  US$ 57
Memória:  0,5 GiB × 2.628.000 s × ~US$0,0000024/GiB-s  ≈  US$  3
                                                    total ≈ US$ 60/mês (~R$ 330)
```

⚠️ **Confirme as tarifas em https://cloud.google.com/run/pricing antes de decidir** — preço muda e
a região tier 2 tem tabela própria. A ordem de grandeza é o que importa aqui: **dezenas de dólares
por mês**, num app gratuito com 9 usuários. O free tier do Cloud Run (180 mil vCPU-s/mês) cobre
menos de 2 dias de uma instância sempre ligada.

Não dá pra baratear tirando o `--no-cpu-throttling`: ele existe porque o webhook responde 200 à
Meta e **processa depois**; com a CPU cortada, a confirmação demora dezenas de segundos
(`docs/RUNBOOK.md`). Manter quente com ping do Cloud Scheduler também não ajuda no preço — instância
viva com CPU sempre alocada é cobrada igual.

### "Do jeito que está hoje, eu pago?" — não, mas é uso cobrável

Pergunta do dono, e a distinção importa: o Cloud Run **cobra pelo tempo em que a instância existe**
(com `cpu-throttling=false`, o ocioso enquanto ela espera mais tráfego conta também). O que salva é
o **free tier permanente** — ~180 mil vCPU-s, ~360 mil GiB-s e 2 milhões de requisições/mês.

Medido nos logs de julho/2026: **108 mensagens** e **49 cold starts**. Com a instância ociosa
vivendo de 5 a 15 min (o Google não publica esse tempo), dá **15.000–44.000 vCPU-s** no mês — entre
**8% e 25% da cota grátis**. Dá pra multiplicar o tráfego por 4 e continuar em R$ 0.

É a mesma conta que explica por que `minInstances: 1` é caro: 2.628.000 vCPU-s/mês ≈ **15× o free
tier inteiro** (que cobre menos de 2 dias de instância sempre ligada). Não é diferença de
eficiência, é de ordem de grandeza.

O custo que **não** é zero nesse fluxo é a **DeepSeek** — por token, externo ao Firebase, fora de
qualquer free tier. Centavos por mensagem, mas é o único que já sai do bolso hoje.

**Alternativa gratuita, ainda não feita**: `functions/src/index.ts` re-exporta **17 functions**, e o
contêiner do `whatsappWebhook` carrega esse índice inteiro no boot — Stripe, Resend, automações,
tudo. Separar o WhatsApp num **codebase próprio** faria o contêiner carregar só o que ele usa.
Não elimina o cold start, mas ataca a parte cara dele sem custo mensal nenhum.

### A Vic do app também roda no Google — mas cobra por outro caminho

Dúvida do dono: *"eu pensei que a Vic do app usava só a DeepSeek"*. Usa a DeepSeek **para pensar**,
mas quem executa é uma Cloud Function (`financialAssistantChat`), que roda em Cloud Run igual ao
webhook do WhatsApp. Toda mensagem tem **três** superfícies de custo: CPU do Google, leituras do
Firestore e tokens da DeepSeek.

O que muda entre as duas Vics — e é a parte não óbvia:

| | WhatsApp (`whatsappWebhook`) | App (`financialAssistantChat`) |
|---|---|---|
| CPU | **sempre alocada** (`--no-cpu-throttling`) | só **durante a requisição** (padrão) |
| Paga o tempo ocioso? | **Sim** — é o que a seção acima mede | **Não** |
| Memória | 512 MiB | 256 MiB |
| Custo dominante | tempo de instância (cold start × ~15 min) | **leituras do Firestore** |

O webhook precisa da CPU sempre alocada porque responde 200 à Meta e **processa depois**. A Vic do
app é `onCall`: ela processa e só então devolve a resposta — tudo acontece dentro da requisição,
então o modelo barato (padrão) serve, e o ocioso não custa nada. **CPU não é o gargalo dela.**

O gargalo é **leitura**. `buildFinancialContext` monta o contexto lendo, a cada mensagem: perfil,
categorias, transações dos últimos 90 dias (limite 2.000), contas a pagar, recorrências, cartões +
faturas de cada cartão, contas, orçamentos, metas e o espaço do casal. Para alguém com ~200
transações no período, isso é da ordem de **~250 leituras por mensagem**.

Com 50.000 leituras/dia grátis no Firestore, isso dá **~200 mensagens/dia** somando todo mundo antes
de encostar no limite — e o rate limit de 60 msg/dia por workspace já segura naturalmente. Quando
apertar, o caminho é encolher o contexto (menos dias, menos coleções), não CPU.

### Quando o WhatsApp começa a custar (e a conta se inverter)

**Não dá pra encurtar o tempo ocioso**: o Cloud Run decide sozinho quanto tempo mantém a instância
de pé (~15 min na prática) e não expõe isso como parâmetro. O botão que existiria — CPU cobrada só
durante a requisição, que é o padrão — está fora de alcance por causa do `--no-cpu-throttling`, que
essa function precisa porque responde 200 à Meta e **processa depois**. O custo ocioso é o preço
dessa decisão, não um descuido. *(Saída arquitetural, só se o volume crescer muito: enfileirar a
mensagem e processar numa segunda function, que trabalha durante a própria requisição e volta pro
modelo de cobrança barato.)*

**A cota que aperta é vCPU-segundo, nunca requisição**: em julho foram 108 mensagens (0,005% das 2
milhões grátis) contra 8–25% dos 180 mil vCPU-s. O custo escala com **cold starts × ~15 min**, não
com mensagens.

| Cenário | Cold starts/mês | vCPU-s | Custo |
|---|---|---|---|
| Hoje (1 usuário ativo, 108 msg) | ~49 | 15–44 mil | **R$ 0** |
| Limite do grátis | ~200 | 180 mil | **R$ 0** (~440 msg/mês, ~15/dia) |
| 10 usuários como o dono, sem sobreposição | ~490 | 441 mil | **~US$ 5,60/mês** |
| `minInstances: 1` (sempre ligada) | — | 2,63 mi | ~US$ 60/mês |

Duas ressalvas: o free tier é **do projeto inteiro**, não desta function — `financialAssistantChat`
(a Vic do app) é outro serviço com a mesma dinâmica e divide a mesma cota. E as mensagens que se
sobrepõem na mesma janela de ~15 min **dividem a instância**, então o cenário de 10 usuários acima é
o pessimista.

**A conta se inverte com escala**: por volta de **60–70 usuários pesados de WhatsApp**, o
scale-to-zero passa dos US$60 do `minInstances: 1` — a partir daí, deixar sempre ligada fica mais
barato *e* mata o cold start. **Decisão do dono em 2026-07-30: não mexer**, o que está certo pro
tamanho de hoje. Revisar quando o uso de WhatsApp passar de ~400 mensagens/mês.

## Fontes

- Firestore — Usage and limits (quotas): https://firebase.google.com/docs/firestore/quotas
- Understand Cloud Firestore billing: https://firebase.google.com/docs/firestore/pricing
- Firestore pricing (Google Cloud): https://cloud.google.com/firestore/pricing
- Firebase Pricing: https://firebase.google.com/pricing
- Cloud Functions for Firebase — Quotas: https://firebase.google.com/docs/functions/quotas
