# Design system — "Sol"

Direção visual do Zerou. Antes de mexer em UI, leia este arquivo. Tokens de cor vivem em `src/styles/themes.css`; nunca use hex/rgba literal em componentes (teste `noHardcodedColors`).

**Atenção ao criar `<button>`/`<input>`/`<select>`/`<textarea>` nativos sem classe**: o preflight do Tailwind não roda neste projeto (v4 instalado, diretivas `@tailwind` legadas em `global.css` — ver `SESSAO.md`), então `color`/`font` não herdam do contexto por padrão nesses elementos nativos. `global.css` tem um reset manual (`button, input, select, textarea { font: inherit; color: inherit; }`) cobrindo o caso geral — mas prefira sempre reaproveitar os componentes-base (`.button`, `.input`, `SelectField`) em vez de elemento nativo cru.

## Princípio

Claro, quente e direto. O número (dinheiro) é o herói. Mobile-first, com cara de app nativo — não de painel web.

## Cor

- Base: areia quente `--bg-page: #FAF8F5`, superfícies brancas.
- Primária: tangerina `--action-primary: #EE5524` (hover `#D44A1C`, soft `#FEF0EB`).
- Semânticas: `--success`, `--danger`, `--warning`, `--info` (+ `*-soft`).
- Gradientes de marca e overlays on-accent são tokens em `themes.css`: `--gradient-brand` (tangerina), `--gradient-income` (verde), `--gradient-slate`, `--on-accent-*`, `--accent-foreground`, sombras `--shadow-*`.
- Paleta de cor-dado (categorias/metas) e `ACCENT_FOREGROUND` ficam em `src/theme/palette.ts` (único lugar JS com literais permitidos).
- 6 temas via `data-theme` no `<html>`: Paper (Sol), Sakura, Obsidian, Midnight, Aurora, Rose Gold. Tema é individual por usuário.
- **Landing e páginas públicas sempre claras (Paper)**, mesmo com device em dark.

## Tipografia

- Números/valores: **DM Sans 800**, `font-variant-numeric: tabular-nums` (classe `.display-number`).
- Corpo/UI: **Instrument Sans**.

## Layout mobile

- Shell: `AppShell.tsx`. Desktop = sidebar; mobile = **nav inferior com FAB central** elevado (tangerina) para "Lançar".
- Header do app logado: sem logo persistente; a tela deve priorizar a tarefa.
- Telas de lançamento (transação, cartão): **header de valor gigante** colorido por contexto, com o valor em DM Sans 800. Tipo via segmented "type-switch". Mesmo tratamento (gradiente `--gradient-brand` + `--shadow-brand-26`, texto em tokens `--on-accent-*`) já replicado em `CardDetailPage.tsx` (limite disponível) e `InvoicePage.tsx` (valor a pagar) desde 2026-07-23 — referência viva de como aplicar em qualquer tela nova que precise do mesmo destaque.
- **Hero cheio (`--gradient-brand`) é só pra tela de UMA entidade (detalhe).** Numa **lista** de várias entidades (cartões, contas), usar a versão "calma": gradiente sóbrio `--gradient-slate` + rodapé branco pra metadado/ação (`.account-card-hero*` em `AccountsPage.tsx`, `.card-list-hero*` em `CardsPage.tsx` desde 2026-07-23 — mesma receita, classes duplicadas por tela de propósito, ver `docs/history/2026-07.md`). Gradiente vívido repetido em 2+ cards de uma lista compete cor com cor e com o FAB.

## Componentes-base (reutilizar sempre)

| Componente | Uso |
|---|---|
| `BottomSheet` | Folha que sobe de baixo (portal, ESC, backdrop, **swipe-to-dismiss** desde 2026-07-18 — drag só no grabber/header via `.sheet-drag-zone`, nunca no corpo). Base de todos os pickers/modais, **inclusive o menu mobile** (`.menu-sheet` no `AppShell`). |
| `SelectField` | Campo que abre sheet com lista de opções + ícones. Substitui `<select>`. |
| `CategoryField` | Sheet de categorias com ícone+cor, criar/editar/excluir. |
| `ConfirmDialog` (`useConfirm`) | Confirmação destrutiva em sheet — nunca `window.confirm`. |
| `EmptyState` | Estado vazio com ilustração SVG própria. 6 variantes: `transactions`, `cards`, `wallet`, `shared`, `goals`, `bills`. Sempre usar uma ilustração existente ou criar uma nova nesse padrão — nunca cair pra texto seco sem ilustração num card que tem vizinho ilustrado (inconsistência perceptível lado a lado). |
| `categoryIcons` / `palette` | **122 ícones em 11 grupos temáticos** (`categoryIconGroups` — fonte única; o mapa plano `categoryIcons` é derivado dela) + **24 cores** (`categoryColors`). **Nunca renomeie/remova chave de ícone nem reordene as 12 primeiras cores**: a chave fica gravada em `Category.icon`, e `resolveCategoryColor` faz hash sobre o array de cores — mexer troca ícone/cor de categorias que já existem. Só acrescente ao fim. |
| `.metric-card` / `.metric-icon` / `.metric-strip` (`global.css`) | Cartão de métrica/KPI compacto (usado em `SearchPage.tsx`). `.metric-card--accent` para o destaque principal (mesmo tratamento gradiente do `.dash-hero`). Valor de **texto longo** (não dinheiro/porcentagem) precisa do modificador `.metric-card-value--compact` — a tipografia padrão do card é grande demais e corta nomes como "Alimentação". |
| `.form-accordion-toggle` (`global.css`) | Botão de expandir/recolher formulário (usado em AccountsPage, BillsPage, CardsPage, ReceivablesPage). Substitui o inline style de 7 propriedades que estava duplicado 4×. |
| `.list-toggle` (`global.css`, 2026-07-23) | "Ver todas as N / Ver menos" no fim de uma lista `.item-list` colapsada (ex.: Compras de uma fatura longa em `InvoicePage.tsx`, limite de 5 linhas). Link discreto (`--action-primary`), não botão cheio. |
| `.icon-button` (`global.css`) | Botão circular 2.75rem só com ícone — não é só destrutivo: também usado pra "voltar" (`InvoicePage.tsx`) e editar (`CardDetailPage.tsx`). Hover vermelho é o padrão, mas não obrigatório semanticamente. |
| `.account-card-hero*` / `.card-list-hero*` (`global.css`) | Hero "calmo" pra **lista** de entidades (gradiente `--gradient-slate` + rodapé branco), usado em `AccountsPage.tsx` e `CardsPage.tsx` (2026-07-23). Ver nota acima sobre quando usar essa versão em vez do gradiente vívido de detalhe. |
| Tokens de duração | `--duration-fast: 120ms`, `--duration-normal: 200ms`, `--duration-slow: 300ms` (`themes.css:root`). Usar em toda transição/animação CSS. Exceção: `.button:active` (80ms, micro-interação) e animações de loop (spinner). |
| Tokens utilitários | `--bg-input: var(--bg-surface-subtle)`, `--text-placeholder: var(--text-muted)`, `--shadow-lg`, `--radius-md` (`themes.css:root`). Ajustam-se automaticamente por tema. |

## Padrões de UX

- **Grupos de botões mutuamente exclusivos** usam `role="radiogroup"` no container + `role="radio"` + `aria-checked` em cada botão. Nunca `aria-pressed` para seleção exclusiva (toggle). CSS: seletores `.theme-card[aria-checked='true']` e `.segmented button[aria-checked='true']` em `global.css`. Exceções legítimas de `aria-pressed`: toggle "Seguir aparência do dispositivo" e estrela de conta primária.
- Seleção (conta, categoria, bandeira, parcelas): bottom-sheet, não dropdown nativo.
- **Lista de itens no mobile = linha inteira como alvo de toque** (`.list-row--tap`,
  extrato de Transações, 2026-07-18): nada de "Editar"/lixeira inline por linha — as ações
  vivem num sheet de detalhe. Destrutivo nunca a um toque em lista rolável.
- **Extrato agrupado por dia** (`.day-group`/`.day-group-header`, 2026-07-18): header sticky
  "Hoje/Ontem/12 jul" + resumo do dia. Cuidado: sticky dentro do `.app-main` mobile exige
  `overflow-x: clip` (não `hidden`, que vira scroll container e mata o sticky).
- **Um adorno por canto no tile** (`.category-tile`, 29/07/2026): o modo "Editar categorias"
  desenhava lápis (`.category-tile-check`, top/right `0.4rem`) **e** lixeira
  (`.category-tile-delete`, top/right `-0.35rem`) no mesmo canto — os dois se sobrepunham. A
  lixeira saiu; excluir vive dentro do formulário de edição, que é onde já deveria estar pela
  regra de não pôr ação destrutiva a um toque em lista rolável. Dois indicadores absolutos
  ancorados no mesmo canto é sempre colisão esperando acontecer.
- **Seletor com muitas opções se agrupa, não só cresce** (`.icon-picker`, 29/07/2026): ao passar
  de 36 pra 122 ícones, grade plana viraria rolagem cega. Grupos temáticos com rótulo **sticky**,
  e a rolagem no contêiner (`.icon-picker`), nunca em cada grade — senão cada grupo vira sua
  própria janelinha rolável e a pessoa rola dentro de rolagem.
- **Excluir dado que a pessoa criou pede confirmação que diz a consequência**, não só "tem
  certeza?". Categoria explicita que sai da lista, que lançamentos antigos ficam como estão e
  que **não dá pra desfazer** — a exclusão é lógica (`isActive: false`), mas não há UI de
  restauração e `ensureDefaultCategories` não recria (o documento continua existindo).
- **Cabeçalho do dia mostra SALDO, não um total de fluxo** (`.day-group-total` +
  `balanceByDayEnd`, 2026-07-29): o saldo consolidado no fim daquele dia — o mesmo número do
  "Saldo total" do Dashboard, voltando no tempo. **Por que não "gasto"**: resumo de fluxo sempre
  esbarra em "o que conta como gasto?" — num dia com pagamento de fatura de R$ 1.000 mais uma
  compra de R$ 1.000 no cartão, nem R$ 1.000 nem R$ 2.000 respondem bem. Saldo é a mesma
  pergunta todo dia e não depende da natureza do lançamento. Lido de cima pra baixo, vira a
  trajetória do dinheiro. **Dois dias seguidos com o mesmo saldo não é bug** — é dia em que só
  houve compra no cartão, que não tira do banco.
- **O saldo é rotulado "saldo do dia" — um rótulo só, em todos os dias.** Chegou a existir uma
  versão que alternava "saldo agora" (hoje) com "no fim do dia" (passado), pra deixar explícito
  que o número não é o saldo atual da pessoa; foi descartada pelo dono (29/07/2026) porque dois
  rótulos pro mesmo número confundem mais do que o rótulo genérico resolve. **Regra**: um número
  recorrente merece um rótulo estável — variação de texto por contexto faz o leitor procurar
  diferença de significado onde não existe.
- **Aviso de estado transitório espera antes de aparecer** (`SyncStatusBadge`, 2026-07-29): o
  "Salvando…" (`localSyncStatus: 'pending'`, vindo de `metadata.hasPendingWrites`) só entra na
  tela depois de **1,2s** de escrita pendente. Como o app é fire-and-forget, online o servidor
  confirma em frações de segundo e o aviso só piscava — bem no instante em que a UI deveria
  transmitir confiança. Offline ou em rede ruim ele aparece e fica, que é quando é legítimo.
  `failed` **não** espera: erro se mostra na hora. Vale como regra pra qualquer indicador de
  carregamento/sincronia novo — e note que **remover o badge não era opção**: ele é o único
  sinal visível de "isto ainda não está no servidor", num app cujo padrão offline-first engole
  o erro de propósito (ver os incidentes de enum em `CLAUDE.md`).
- **Microcópia de slot apertado se mede no DOM, não no olho.** "saldo no fim do dia" parecia
  caber e **não cabia**: com data de outro ano ("8 jul 2025") e valor de 6 dígitos faltavam 6px
  a 375px. `.day-group-header` tem ~301px úteis nessa largura — meça antes de escolher a frase.
- **Resumo não usa a mesma roupa do dado que resume** (`.day-group-total`, refeito 2026-07-29):
  o total do dia era vermelho peso 800 — igual ao valor de cada linha — e empilhado logo acima
  dele se disfarçava de transação. Agora é `--text-secondary` peso 700 com um rótulo micro em
  maiúscula (`.day-group-total-label`), recuando um nível abaixo das linhas. Duas regras que
  valem pra qualquer resumo novo: **(1) número sozinho não se explica** — um valor sem rótulo
  não diz se é gasto, saldo ou entrada; **(2) cor que nunca varia é decoração, não dado** — como
  todo dia tem gasto, vermelho em todo cabeçalho não informava nada; hoje o vermelho só aparece
  se o saldo ficar negativo, que é quando a cor diz algo.
- **Resumo que é um FATO do dia ignora o filtro da tela.** O saldo sai de `activeTransactions`
  (sem filtro), nunca das visíveis: escolher "Despesas" não pode mudar quanto a pessoa tinha.
  Vale a distinção — enquanto o cabeçalho mostrava um total, ele precisava sumir na busca (total
  de um subconjunto parece bug); um saldo continua verdadeiro com qualquer filtro.
- **Cor da linha = direção do dinheiro** (`transactionFlowByType`, `financeCalculations.ts`):
  verde/`+` para entrada (receita, ajuste, estorno, reembolso), vermelho/`−` para saída (despesa,
  compra no cartão), **neutro sem sinal** para movimento interno (transferência, pagamento de
  fatura). A direção é derivada da mesma leitura que `transactionAccountEffects` usa pra mover o
  saldo — nunca de uma regra paralela.
- **CTA de conclusão de formulário longo é sticky** (`.entry-actions`): no mobile o offset
  usa `--bottom-nav-space` (fonte única da folga da bottom nav, definida no media query
  de 900px) — nunca hardcodar 5.75rem de novo.
- **Input com fonte gigante dentro de flex/grid precisa de `min-width: 0` no contêiner**
  (achado no `NextMonthProjectionSheet`, 2026-07-27): um `<input>` sem `size` tem largura
  intrínseca de ~20 caracteres — com fonte de valor (DM Sans 800, ~34px) isso vira ~400px.
  Item de flex/grid nasce com `min-width: auto` e **não encolhe** abaixo disso, estourando o
  contêiner e sendo cortado por qualquer `overflow-x: hidden` acima. Sempre `min-width: 0` no
  wrapper do input (o input já precisa de `flex: 1; min-width: 0` também).
- **Chips que não cabem numa linha rolam** (`.chip-row--scroll`), não quebram; chip que
  carrega estado (ex.: "Filtros · N") vai primeiro pra nunca sair da viewport.
- Chips para presets (datas Hoje/Ontem/Outra, tipo de divisão).
- Empty states sempre com ilustração + CTA, não texto seco.
- Barras de progresso para limite de cartão, metas e cofrinho. **Forma da barra** (achado no `/dataviz`, 2026-07-18): quadrada na base (início), arredondada só na ponta (4px) — nunca pílula nos dois lados. Vale pra track e fill juntos (`.spending-bar-track`, `.goal-progress-track`, `.card-limit-bar-track` em `global.css`), senão o clip do container arredonda os dois lados mesmo que só o fill mude.
- Nunca expor termo técnico ao usuário (sem "ledger", "workspace", "checkout").
- **Pull-to-refresh bloqueado via JS cirúrgico** (`src/pwa/preventPullToRefresh.ts`, 2026-07-19): cancela o gesto só quando a página está no topo E o dedo vai pra baixo (o único caso que dispara o refresh), sem tocar no scroll normal. O PWA instalado no Android **tem** pull-to-refresh (confirmado com print do dono) — não some só por estar instalado. **NÃO usar `overscroll-behavior-y: contain`** pra isso: tentado antes e **travou todo o scroll no mobile** (interação com o `overflow-x: hidden` do body).
- **Navegação por mês/período** (`.month-switcher`, `global.css`): `‹ Mês de Ano › ` com `.icon-button`, introduzido em `SearchPage.tsx` (2026-07-08) — padrão a reaproveitar se outra tela precisar filtrar por mês, em vez de inventar um novo controle.
- Ação em cartão do casal/despesa que muda estado do servidor (gerar/regenerar/revogar convite): sempre com `confirm()` explicando a consequência antes de agir, principalmente se for destrutiva ou invalidar algo que já foi compartilhado com outra pessoa.
- **Estado exclusivo/progressivo precisa de indicador visível do que está ativo** (aprendido nos modos do casal, 2026-07-08): quando uma escolha é um valor único mas as opções são níveis cumulativos (cada uma mostra mais UI), o usuário acha que está "acumulando". Sempre mostrar um badge do estado atual na tela (não escondido em acordeão), usar verbo de troca ("Mudar pra X", não "Ativar X"), e no seletor marcar o valor vigente ("Atual") distinto do tentativamente selecionado.
- **Excluir algo que guarda dinheiro de verdade (meta, cofrinho) precisa perguntar o destino do valor** (aprendido nas Metas, 2026-07-18): nunca decidir sozinho se o dinheiro some ou volta. Sheet de duas opções no molde `.choice-list`/`.choice-card` (ver `GoalDeleteSheet.tsx`) — "devolver pra uma conta" (pede pra escolher qual, nunca assume a conta original) ou "deixar sumir" — e só oferecer a devolução quando fizer sentido ter "guardado" pra devolver (não numa meta de dívida, onde o valor já foi pago a um credor real).

## Landing (`src/landing/`)

Zona de marketing, identidade Sol clara, com liberdade de cor literal (exceção do teste). Hero com mockup do app em CSS (`AppMockup`) num phone 3D, bento de recursos, faixa do casal (cofrinho), FAQ, CTA. Voz de copy: dor + reframe (PAS), CTA em 1ª pessoa.
