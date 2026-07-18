# Proposta: "Lança e vai" — captura relâmpago por long-press no FAB

> Status: **aguardando decisão do dono** (2026-07-18). Proposta de agente designer, revisada por agente crítico. Não implementada.

## Tese de produto

Mesmo com a tela de lançamento boa, o fluxo completo (valor → título → categoria → conta → salvar) leva 15–30s. No caixa do mercado, no busão, ninguém preenche formulário — e aí o gasto não é registrado nunca. Nenhum app BR resolve isso bem: Mobills/Organizze têm o mesmo formulário. O diferencial real de retenção em finanças é **custo de captura perto de zero** — e o Granativa tem a arma perfeita: a arquitetura offline-first fire-and-forget, onde um write custa zero espera.

Registro real: 2 toques + digitar o valor, ~4 segundos, funcionando offline no subsolo do metrô.

## Como funciona (v1 aprovada pelo crítico)

1. **Long-press (~350ms) no FAB** (`AppShell.tsx`; pointer events, sem lib) abre uma mini-sheet de captura com só duas coisas: teclado de valor (mesmo `amount-hero` compacto, autofocus) e botão "Lançar". Toque curto no FAB continua indo pro formulário completo.
2. Salva na hora como despesa comum com:
   - `categoryId` **ausente** — "sem categoria" É o marcador de "pra revisar" (ver decisão abaixo);
   - conta = última usada (**localStorage**, sem mudança de schema);
   - `description` default (ex.: "Lançamento rápido") — **obrigatório**: a regra exige 2–120 chars (`validShortText`, `firestore.rules:514`).
3. Dashboard mostra card discreto "N lançamentos sem categoria" → abre o extrato filtrado ou o sheet de detalhe da transação com o picker de categoria aberto. Categorizar remove do "inbox" naturalmente, sem write extra de flag.

## Decisão estrutural do crítico: SEM campo novo no payload (v1)

A proposta original usava um campo `pendingReview: true`. **Rejeitado na v1** — atravessaria o padrão de bug mais caro do projeto (2 incidentes reais de campo/enum novo sem atualizar `firestore.rules`, invisível por meses porque o fire-and-forget engole a rejeição). Verificado no código:

- `categoryId` já é opcional no servidor (`validOptionalString`, `firestore.rules:516`) e no cliente (`categoryId || undefined`);
- `DashboardPage.tsx:293` e `SearchPage.tsx:269/709` já agregam e exibem "Sem categoria";
- logo "sem categoria" já é o marcador semântico de revisão, com clearing natural. Zero mudança em rules, zero exposição ao padrão de bug.
- **Armadilha mapeada**: não usar o campo `source` existente como marcador — está no `hasOnly` do create mas **não** está no `affectedKeys` do update, ou seja, nunca poderia ser limpo depois.

Se a v1 comprovar uso e precisar distinguir "capturado às pressas" de "sem categoria de propósito", aí sim discutir o campo novo — com regra + payload de teste + `npm run test:rules` no mesmo commit (REGRA PRINCIPAL do CLAUDE.md).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| FAB é `NavLink` (`<a>`) — long-press no iOS abre callout/preview nativo | `-webkit-touch-callout: none` + prevenção de `contextmenu`; testar no PWA standalone de verdade |
| Gesto invisível (descoberta) | Feedback visual durante o press (FAB cresce levemente); ensinar uma vez no `WelcomeTour`; medir adoção antes de virar promessa de marketing |
| Long-press compete com toque normal | Threshold de tempo calibrado (~350ms) |
| Sem conta cadastrada | Long-press cai no formulário completo, sem estado quebrado |
| Transações sem categoria poluem Análise | Já mitigado: agregado "Sem categoria" existente |

## Dependências

- Fazer **depois** do sheet de detalhe da transação (implementado em 2026-07-18) — ele é o destino da revisão.
- Esforço estimado: G. Impacto: alto (ataca a causa nº 1 de abandono de apps de finanças: parar de registrar).
