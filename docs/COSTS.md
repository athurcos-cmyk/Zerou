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
  o **DeepSeek/Grazi** (cobrado por token, fora do Firebase).

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
**DeepSeek/Grazi** por token) pesam mais que o Firestore — manter o rate limit de 60 msgs/dia por
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
3. **Cloud Functions agendadas** (`generateRecurrences`, `sendDueReminders`, `sendBudgetAlerts`,
   `closeInvoicesDue`, `sendDailyLogReminder`): rodam **todo dia** lendo dados de **todos** os
   usuários, independente de abrirem o app. É o custo que cresce "sozinho" com a base — primeiro
   lugar a otimizar quando crescer.
4. **DeepSeek/Grazi**: custo externo por token, fora do Firebase. Pode virar o maior custo se a IA
   for muito usada.

## Fontes

- Firestore — Usage and limits (quotas): https://firebase.google.com/docs/firestore/quotas
- Understand Cloud Firestore billing: https://firebase.google.com/docs/firestore/pricing
- Firestore pricing (Google Cloud): https://cloud.google.com/firestore/pricing
- Firebase Pricing: https://firebase.google.com/pricing
- Cloud Functions for Firebase — Quotas: https://firebase.google.com/docs/functions/quotas
