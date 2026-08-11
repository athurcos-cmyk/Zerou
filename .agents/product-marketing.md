# Product Marketing Context

**Document version:** v7
**Last updated:** 2026-08-10

> Rascunho V1 gerado a partir do repositório (landing, README, SESSAO.md, meta tags, docs).
> Itens marcados `[CONFIRMAR]` precisam da sua correção — são coisas que o código não sabe.

## Product Overview
**One-liner (tagline oficial desde 2026-08-09):** **Veja pra onde vai seu dinheiro. Sozinho ou a dois.**

**What it does:** App financeiro no celular onde a pessoa registra gastos, contas, cartões e metas em poucos toques e enxerga pra onde o dinheiro foi no mês. Quando quiser, abre um espaço de casal pra dividir despesas, acertar quem deve quanto e guardar junto num cofrinho — sem que as finanças pessoais de cada um apareçam pro outro.

**Product category:** App de finanças pessoais / controle de gastos (a "prateleira" onde as pessoas buscam: *app de controle financeiro*, *app pra organizar as contas*, *substituir a planilha*). O sub-nicho real e menos disputado: **finanças de casal sem abrir mão da privacidade individual**.

**Product type:** SaaS / PWA (web app instalável, sem loja de aplicativos). Mobile-first, pt-BR, Brasil.

**Business model:** Gratuito **hoje** — sem cobrança, checkout ou cartão de crédito. O código de billing foi removido do repositório em 2026-08-08 (vive na tag `billing-stripe-v0`). **⚠️ Vai ser pago no futuro (decisão do dono, 2026-08-09).**

✅ **Corrigido em 2026-08-09:** a landing prometia **"R$ 0 pra sempre"** — promessa que o produto ia quebrar, feita justamente aos 5 primeiros usuários, que são amigos e família. Virou **"R$ 0 · sem cartão"** ([LandingSections.tsx:82](../src/landing/LandingSections.tsx:82)).

⚠️ **Regra que fica:** enquanto não houver preço definido, **nenhuma peça de marketing pode dizer "sempre", "para sempre" ou "de graça pra todo mundo"**. A linha segura é "grátis", "sem cartão de crédito" ou "grátis enquanto estamos construindo".

**URL:** https://granativa.com.br (`zerou-five.vercel.app` legado)

---

## Target Audience
**Target audience:** B2C — pessoas físicas no Brasil, adultas, que usam o celular como computador principal. `[CONFIRMAR]` faixa de idade, renda e região de quem já usa.

**Decision-maker:** a própria pessoa. No modo casal, há um segundo ator: **quem convida** (o organizado) e **quem é convidado** (que aceita por adesão, não por busca própria) — isso é um canal de crescimento embutido, não só uma feature.

**Primary use case:** parar de terminar o mês sem saber pra onde foi o dinheiro.

**Jobs to be done:**
- "Me mostra pra onde foi meu dinheiro esse mês, sem eu ter que virar contador."
- "Me deixa registrar o gasto agora, em 3 toques, antes de eu esquecer."
- "Deixa a gente organizar o dinheiro do casal sem eu ter que mostrar tudo o que eu gasto."

**Use cases:**
- Substituir a planilha do Excel/Google Sheets que ninguém mantém depois do segundo mês.
- Saber quanto do limite do cartão ainda dá pra usar, com a fatura separada do saldo da conta.
- Dividir contas da casa entre o casal e acertar o saldo sem virar cobrança constante.
- Juntar pra um objetivo comum (viagem, mudança) vendo quanto cada um colocou.
- Registrar gasto pelo WhatsApp, falando com a Vic, sem abrir o app.

---

## Personas
B2C — sem cadeia de compra. Mas há dois papéis distintos no modo casal:

| Papel | Cuida de | Desafio | Valor que prometemos |
|---|---|---|---|
| Organizador(a) | Ter o número certo, ver o mês inteiro | Sente que carrega a organização do casal sozinho(a) | Vê o quadro completo sem precisar cobrar o parceiro toda hora |
| Parceiro(a) convidado(a) | Não ser fiscalizado(a) | Não quer abrir a vida financeira inteira pra conversar sobre a conta de luz | Só o que vocês decidem dividir é compartilhado; o resto continua 100% seu |

`[CONFIRMAR]` — esses papéis são hipótese minha lendo o produto, não pesquisa. Bate com o que você viu com usuários reais?

---

## Problems & Pain Points
**Core problem:** o mês acaba e o dinheiro sumiu, sem que a pessoa consiga apontar onde. Não é falta de disciplina — é falta de registro no momento em que o gasto acontece.

**Why alternatives fall short:**
- **Planilha:** exige disciplina diária num formato que não cabe no celular; morre no segundo mês.
- **App de banco:** mostra só o dinheiro daquele banco, não o cartão de outro, não o dinheiro em espécie, não o que vem pela frente. E nunca junta a vida de duas pessoas.
- **Apps de finanças "completos":** pedem cadastro de tudo, sincronização bancária, categorização automática que erra, e cobram assinatura pra ver o próprio dado.
- **Anotar no papel/notas do celular:** registra, mas não soma nada.
- **Ninguém resolve casal direito:** ou é tudo compartilhado (invasivo) ou tudo separado (não organiza nada).

**What it costs them:** juros de cartão pago sem entender por quê, limite estourado sem aviso, meta que nunca sai do papel, e — no casal — a mesma discussão sobre dinheiro todo mês.

**Emotional tension:** vergonha de não saber quanto tem; medo de olhar a fatura; a sensação de trabalhar o mês inteiro e não ter nada pra mostrar. No casal: desconfiança de "quem gasta mais" e o desconforto de ser vigiado.

---

## Competitive Landscape
`[CONFIRMAR]` — os concorrentes abaixo são o mapa óbvio do mercado brasileiro; não fiz pesquisa de campo nesta rodada. Se quiser profundidade real, o próximo passo é `/marketing-skills:competitors`.

**Direto:** Mobills, Organizze, Minhas Economias, Fintz — mesma promessa de controle de gastos. Falham porque monetizam justo o que a pessoa precisa (relatório atrás de assinatura), pedem muito cadastro pra dar o primeiro valor, e tratam casal como um adendo ("conta compartilhada"), não como um espaço com privacidade.

**Secundário:** app do banco (Nubank, Inter, C6) — resolve *parte* do problema pra quem centraliza tudo num banco só, mas nunca enxerga a vida financeira inteira nem a de duas pessoas.

**Indireto:** planilha do Google Sheets, o bloco de notas, e "vou acompanhar de cabeça" — grátis, familiar, e é contra isso que a maioria das pessoas realmente decide.

---

## Differentiation
**Key differentiators:**
1. **Privacidade por desenho no modo casal.** As finanças pessoais nunca vazam pro espaço compartilhado — é regra de segurança no servidor, não uma configuração que dá pra errar.
2. **Cartão que não mente.** Compra fica na fatura; o saldo da conta só muda quando o pagamento é registrado.
3. **Funciona sem internet.** Registra offline e sincroniza depois — o app responde na hora, não fica esperando servidor.
4. **Registro pelo WhatsApp (Vic).** Manda "gastei 40 no mercado" e está lançado, sem abrir o app.
5. **Sem loja de aplicativos, sem cartão de crédito, em 2 minutos.** Abre no navegador e adiciona na tela inicial.
6. **Grátis.** Não há relatório trancado atrás de assinatura.

**How we do it differently:** o produto assume que o registro precisa ser instantâneo e que privacidade não é configuração, é arquitetura. E parte do princípio de que **o app não move dinheiro** — ele registra fatos. Por isso a linguagem é sempre de registro ("Já foi paga"), nunca de comando ("Pagar").

**Why customers choose us:** é o único que serve as duas vidas — a individual e a a dois — sem obrigar a escolher entre organização e privacidade.

---

## Objections
`[CONFIRMAR]` — objeções abaixo são as previsíveis; substitua pelas que você realmente ouviu.

| Objeção | Resposta |
|---|---|
| "Vou ter que lançar tudo na mão? Não conecta no meu banco?" | Não conecta — e é de propósito: não pedimos sua senha do banco. Lançar leva 3 toques, ou você manda uma mensagem no WhatsApp e a Vic registra. |
| "Se é grátis, o produto sou eu?" | Não vendemos nem cruzamos seu dado. Analytics vem desligado por padrão, e você pode exportar ou apagar tudo. |
| "Meu parceiro vai ver meus gastos?" | Só o que vocês colocarem no espaço do casal. Suas contas, cartões e lançamentos pessoais continuam invisíveis pra ele — garantido no servidor. |
| "Já tentei uns três apps e desisti." | Por isso a primeira tela pede 2 respostas, não 20. Se em 2 minutos não fizer sentido, não custou nada. |
| "Não está na Play Store, é confiável?" | É um app web: abre no navegador e vira ícone na tela inicial. Menos permissões no seu celular, e atualiza sozinho. |

**Anti-persona:** investidor que quer acompanhar carteira e rentabilidade como produto principal; MEI/pequena empresa querendo controle de caixa da empresa; quem quer conciliação bancária automática (Open Finance) e não vai lançar nada manualmente.

---

## Switching Dynamics
**Push:** a planilha morreu; o app do banco não mostra o cartão do outro banco; a fatura chegou maior do que o esperado de novo; briga com o parceiro sobre conta.

**Pull:** ver em 2 minutos pra onde foi o dinheiro; o cofrinho do casal crescendo na tela; poder lançar pelo WhatsApp; ser grátis de verdade.

**Habit:** "eu acompanho de cabeça"; o extrato do banco como fonte única; a planilha que ainda existe mesmo desatualizada.

**Anxiety:** "vou ter que lançar tudo de novo desde o começo"; "vou abandonar em duas semanas como os outros"; "meu parceiro vai ver o que eu gasto"; "e se meus dados vazarem".

---

## Customer Language
`[CONFIRMAR]` — o verbatim abaixo é o que a landing usa hoje; falta o verbatim REAL de usuário. Se você tiver prints de conversa, mensagens de quem testou ou áudios, é o insumo mais valioso que existe pra copy.

**Como descrevem o problema:**
- "Não sei pra onde vai meu dinheiro."
- "Chego no fim do mês no zero."
- "A fatura veio e eu não sei o que eu comprei."
- "A viagem dos sonhos some todo mês nas pequenas contas."

**Como descrevem a solução:** `[CONFIRMAR]` — sem depoimento real ainda.

**Palavras a usar:** organizar, registrar, ver pra onde foi, sobrar, guardar junto, privado, simples, no celular, em 2 minutos, "o que é seu é só seu".

**Palavras a evitar:** investir, rendimento, patrimônio, conciliação, fluxo de caixa, gestão financeira, "controle total", jargão de banco. Nada que soe a planilha de contador ou a coach financeiro. Nunca prometer que o app *paga* algo — ele registra.

**Glossário:**
| Termo | Significado |
|---|---|
| Espaço do casal | Área compartilhada; só o que os dois decidem dividir mora lá |
| Cofrinho | Meta de poupança conjunta, mostra quanto cada um colocou |
| Acerto | Quitar "quem deve quanto a quem" entre o casal |
| Comprometido | Dinheiro do mês que já tem destino (contas, recorrências, fatura) |
| Projeção | Quanto deve sobrar mês que vem, a partir do salário que você declara |
| Vic | Assistente do app e do WhatsApp que registra gastos e responde dúvidas |
| Contas e assinaturas | Boletos e cobranças recorrentes (era "Contas a Pagar") |
| Dinheiro a receber | O que vão te pagar (era "Contas a Receber") |

---

## Brand Voice
**Tone:** direto, caloroso e sem julgamento. Fala de dinheiro como quem senta ao lado, não como quem corrige.

**Style:** frase curta, verbo na segunda pessoa, número concreto. Nunca jargão de banco. **Regra de produto que virou regra de voz: o Granativa não move dinheiro, ele registra fatos** — por isso todo botão que confirma algo usa passado ou voz passiva ("Já foi paga", "Recebi"), nunca imperativo de comando ("Pagar").

**Personality:** honesto, prático, discreto, acolhedor, brasileiro.

**Nome:** "Granativa" fica.

**Tagline: "Veja pra onde vai seu dinheiro. Sozinho ou a dois."** (decidida e aplicada em 2026-08-09).

A anterior — *"Controle individual. Organização a dois."* — saiu por dois motivos apontados pelo dono:
1. **Falava demais do casal.** Metade da frase era sobre "a dois", e quem ia usar sozinho podia achar que o app não era pra ele. O casal é diferencial, mas é o *segundo* movimento, não a identidade.
2. **Não dizia o que o app faz.** Quem nunca ouviu falar não distinguia se era banco, planilha ou app de investimento.

**Por que esta:** abre com a função literal (*veja pra onde vai*), que é o próprio job-to-be-done, e rebaixa o casal a uma opção de três palavras. E ela repete o CTA que já está no site — "Quero ver meus gastos": promessa e botão dizendo a mesma coisa reduz a hesitação no clique.

**Descartadas:** *"Todo o seu dinheiro num lugar só. Sozinho ou a dois."* (mais ampla, mas "num lugar só" é o que todo concorrente fala) e *"Organize seus gastos. Compartilhe só o que quiser."* (carregava a privacidade, mas vendia o casal de novo, por outro ângulo).

**Onde a tagline vive (8 lugares, atualizar todos no mesmo commit):** `index.html` (og:description), `README.md`, `package.json`, `vite.config.ts` (manifest do PWA), `src/components/BrandLogo.tsx` (×2, inclusive o `alt`), `src/components/AuthLayout.tsx`, `src/pages/PublicLayout.tsx`, `functions/src/email/templates/EmailLayout.tsx` (rodapé de todo e-mail). O `CLAUDE.md` também cita.

---

## SEO — como aparecemos no Google

**Título indexado (`/`):** `Granativa — veja pra onde vai seu dinheiro` (43 caracteres, cabe inteiro). Marca na frente, benefício logo depois — mudou de "termo de busca primeiro" (v4) pra "marca + mini-descrição" em 2026-08-10, pedido do dono depois de ver o resultado real no Google mostrando só "Granativa" sem contexto.

**Descrição (`/`):** *"Registre um gasto em 3 toques e veja pra onde foi seu dinheiro. Funciona sem internet, é grátis, com modo casal opcional — o que é seu continua só seu."* (151 caracteres.) Troca o "num lugar só" genérico (clichê de concorrente, já sinalizado acima) pelos diferenciais reais — offline, grátis, privacidade — e deixa claro que o modo casal é opcional, não algo que todo mundo já tem.

Fica em [LandingShell.tsx:20](../src/landing/LandingShell.tsx:20) — mesmo texto pras três tags (`description`, `og:description`, `twitter:description`), porque `Seo.tsx` usa uma description só pras três. A cópia estática em `index.html` (a que robôs sem JavaScript enxergam) é mantida idêntica à dinâmica, de propósito: as duas já haviam divergido silenciosamente uma vez (título estático virou só "Granativa" num commit anterior, sem tocar no `Seo.tsx` — só um crawler sem JS ou uma leitura ao vivo do Google revelava isso).

**⚠️ A descrição não faz o site subir no Google — ela faz a pessoa clicar.** Quem decide a posição é o título, o conteúdo da página e quem aponta links pra você. A descrição é o texto de venda embaixo do link; escrever bem aumenta o clique, não o ranking.

**Expectativa honesta de posição.** Um site novo, com 5 usuários e nenhum link apontando pra ele, **não vai aparecer** em buscas como "app de controle financeiro" ou "controle de gastos" — essas páginas são de Mobills, Organizze e da própria Play Store, que têm anos de vantagem. Por enquanto o Granativa só aparece bem pra quem digitar "Granativa".

**Onde dá pra ganhar:** a busca de cauda longa do nicho de casal — mas **não como eu escrevi na v4**. ⚠️ **Correção (v5):** eu disse que esse nicho tinha "quase nenhum concorrente". A pesquisa de 2026-08-09 provou o contrário:

| Quem | O que é | Ameaça |
|---|---|---|
| **ZapGastos** | Concorrente direto: registra gasto e divide conta **pelo WhatsApp** — mesma ideia da Vic. Já tem 3+ artigos ranqueando em "aplicativo financeiro para casal". | **Alta** |
| **Couple Finance** | App "100% focado em relacionamentos", proposta de **mesclar as contas**. | Média — proposta oposta à nossa |
| **Junto$** (juntos.life) | Blog + produto de finanças de casal. | Média |
| **C6 Bank, PagBank, meutudo** | Blogs de banco ocupando "como dividir as contas do casal". Autoridade altíssima. | **Alta nos termos genéricos** |
| ~~casalquesoma.com.br, remindoo.com.br~~ | **⚠️ Refutado em 2026-08-10, verificado pelo dono ao vivo**: `casalquesoma.com.br` nem existe (domínio fora do ar) e `remindoo.com.br` é ele mesmo um app financeiro, não um blog com lista "melhores apps para casal". A pesquisa de 2026-08-09 estava errada nesses dois — não são oportunidade de link/menção, não citar de novo sem reverificar ao vivo primeiro. | — |

O território que sobra, e que é defensável, é mais estreito e mais nosso: **quem quer organizar a dois sem juntar tudo**. Todo concorrente vende fusão ("mesclem suas contas"); ninguém escreve pra quem não quer fundir. É por isso que o título carrega "e do casal" mesmo depois de a tagline ter sido enxugada.

**⚠️ Conteúdo de SEO foi tentado e revertido em 2026-08-09** (ver `docs/planning/TODOS.md`). Não é que a análise estivesse errada — é que o canal é lento demais pro estágio. **Com 5 usuários que são amigos e família, ainda não se sabe se um estranho quer o produto**, e SEO leva 3 a 6 meses. A ordem correta é: falar com os 5 → conseguir os primeiros estranhos na mão (as listas de "melhores apps para casal" acima trazem visita em semanas) → só então investir em canal de longo prazo.

**Infra já pronta:** `public/robots.txt` (libera o site, bloqueia `/app`, `/verify-email` e `/privacy-center`) e `public/sitemap.xml` com as 9 páginas públicas. `/pricing` foi removido do sitemap em 2026-08-09 — a rota só redireciona pra `/` desde a remoção do billing, e apontar o Google pra um redirecionamento gasta rastreio à toa.

## Proof Points
**Métricas reais (2026-08-09):** **5 usuários, todos amigos e família.** Todos ativos, mas não diariamente. Nenhum usuário estranho ainda.

Leitura honesta: isso **não é tração, é cortesia**. Amigo e família usam por afeto e não reclamam por educação — o sinal deles não prova demanda. O que ainda não sabemos: se alguém que não te deve nada volta na segunda semana.

**Métricas da landing (declaração de produto, não resultado):** 100% no celular · 2 min pra começar · R$ 0 sem cartão.

**Customers:** nenhum nome público.

**Testimonials:** nenhum coletado — **e essa é a lacuna mais cara do documento**. Mas os 5 usuários atuais são 5 conversas disponíveis hoje, de graça: são a única fonte de verbatim real que existe. Enquanto não houver, toda copy nasce da minha suposição de como as pessoas falam, não de como elas falam.

**Value themes:**
| Tema | Prova |
|---|---|
| Privacidade no casal | Isolamento garantido por Security Rules no servidor; o pessoal nunca entra no espaço compartilhado |
| Funciona no mundo real | Offline-first: registra sem internet e sincroniza depois |
| Cartão sem susto | Fatura separada do saldo da conta |
| Começa em 2 minutos | Onboarding de 3 passos, 2 perguntas, sem cartão de crédito |
| Sem fricção pra registrar | 3 toques no app, ou uma mensagem no WhatsApp |

---

## Goals
**Business goal (proposto, dono respondeu "não sei" — corrigir se discordar):** com 5 usuários que são amigos e família, o objetivo desta fase **não é volume de cadastro**. É responder uma pergunta: **um estranho, que não deve nada ao fundador, continua usando na segunda semana?**

Por quê: gastar em aquisição antes dessa resposta escala algo que ainda não se provou — traz gente pra uma porta que talvez não segure ninguém, e queima o dinheiro e a impressão de primeira vez ao mesmo tempo. Primeiro a retenção, depois o volume.

**Meta concreta sugerida:** 20–30 usuários *sem vínculo pessoal* com o fundador, e medir quantos registram algo na semana 2. `[CONFIRMAR]` o número.

**Conversion action:** criar conta em `/register` (CTA atual: "Quero ver meus gastos" · "Grátis · sem cartão de crédito · em 2 minutos").

**Métrica que ainda não existe e precisa existir:** retenção semana-2. Sem ela, não dá pra saber se marketing está funcionando ou só enchendo balde furado.

---

## Changelog
*Newest first. One line per revision: what changed and why.*
- v7 (2026-08-10) — Título e descrição de `/` reescritos (dono pediu depois de ver "Granativa" pelado no Google) e sincronizados entre `index.html` (estático) e `LandingShell.tsx`/`Seo.tsx` (dinâmico) — os dois haviam divergido em silêncio. `Seo.tsx` ganhou um bypass pra título já-com-marca não duplicar "| Granativa". Description trocou "num lugar só" (clichê) por diferenciais reais e por "modo casal opcional" (não dar a entender que todo mundo já tem espaço de casal).
- v6 (2026-08-09) — Conteúdo de SEO **tentado e revertido no mesmo dia** por decisão do dono: canal lento demais pra quem ainda não sabe se um estranho quer o produto. O mapa de concorrentes foi absorvido aqui (o doc `content-strategy.md` deixou de existir); ordem correta registrada — falar com os 5 usuários, conseguir estranhos na mão, e só depois canal de longo prazo.
- v5 (2026-08-09) — **Correção factual:** o nicho de casal não está vazio (ZapGastos, Couple Finance, Junto$ + blogs de banco nos termos genéricos). Território redefinido para "organizar a dois sem juntar tudo", o único ângulo que nenhum concorrente ocupa.
- v4 (2026-08-09) — Seção **SEO** nova: título e descrição do Google reescritos (a antiga não trazia termo de busca nenhum e era pesada de casal), com a expectativa honesta de posição e a aposta na cauda longa do nicho de casal. `/pricing` removido do sitemap.
- v3 (2026-08-09) — **Tagline nova fechada e aplicada no código**: "Veja pra onde vai seu dinheiro. Sozinho ou a dois." nos 8 lugares; "R$ 0 pra sempre" saiu da landing por "R$ 0 · sem cartão", fechando a contradição com o plano de cobrar no futuro.
- v2 (2026-08-09) — Números reais (5 usuários, amigos/família, ativos não-diários); modelo de negócio corrigido para "grátis hoje, pago no futuro" e sinalizada a contradição do "R$ 0 pra sempre" na landing; objetivo de fase proposto (retenção de estranho na semana 2, não volume); tagline movida para EM REVISÃO com a direção definida pelo dono (individual primeiro + concreta) e o inventário dos 8 lugares onde ela vive.
- v1 (2026-08-09) — Contexto inicial, auto-rascunhado do repositório (landing, README, SESSAO.md, meta tags). Lacunas de audiência real, concorrência pesquisada, verbatim de cliente, prova social e metas marcadas como `[CONFIRMAR]`.
