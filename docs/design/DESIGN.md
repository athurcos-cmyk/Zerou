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

## Componentes-base (reutilizar sempre)

| Componente | Uso |
|---|---|
| `BottomSheet` | Folha que sobe de baixo (portal, ESC, backdrop, **swipe-to-dismiss** desde 2026-07-18 — drag só no grabber/header via `.sheet-drag-zone`, nunca no corpo). Base de todos os pickers/modais, **inclusive o menu mobile** (`.menu-sheet` no `AppShell`). |
| `SelectField` | Campo que abre sheet com lista de opções + ícones. Substitui `<select>`. |
| `CategoryField` | Sheet de categorias com ícone+cor, criar/editar/excluir. |
| `ConfirmDialog` (`useConfirm`) | Confirmação destrutiva em sheet — nunca `window.confirm`. |
| `EmptyState` | Estado vazio com ilustração SVG própria. 6 variantes: `transactions`, `cards`, `wallet`, `shared`, `goals`, `bills`. Sempre usar uma ilustração existente ou criar uma nova nesse padrão — nunca cair pra texto seco sem ilustração num card que tem vizinho ilustrado (inconsistência perceptível lado a lado). |
| `categoryIcons` / `palette` | 36 ícones + paleta de cores de categoria/meta. |
| `.metric-card` / `.metric-icon` / `.metric-strip` (`global.css`) | Cartão de métrica/KPI compacto (usado em `SearchPage.tsx`). `.metric-card--accent` para o destaque principal (mesmo tratamento gradiente do `.dash-hero`). Valor de **texto longo** (não dinheiro/porcentagem) precisa do modificador `.metric-card-value--compact` — a tipografia padrão do card é grande demais e corta nomes como "Alimentação". |
| `.form-accordion-toggle` (`global.css`) | Botão de expandir/recolher formulário (usado em AccountsPage, BillsPage, CardsPage, ReceivablesPage). Substitui o inline style de 7 propriedades que estava duplicado 4×. |
| `.list-toggle` (`global.css`, 2026-07-23) | "Ver todas as N / Ver menos" no fim de uma lista `.item-list` colapsada (ex.: Compras de uma fatura longa em `InvoicePage.tsx`, limite de 5 linhas). Link discreto (`--action-primary`), não botão cheio. |
| `.icon-button` (`global.css`) | Botão circular 2.75rem só com ícone — não é só destrutivo: também usado pra "voltar" (`InvoicePage.tsx`) e editar (`CardDetailPage.tsx`). Hover vermelho é o padrão, mas não obrigatório semanticamente. |
| Tokens de duração | `--duration-fast: 120ms`, `--duration-normal: 200ms`, `--duration-slow: 300ms` (`themes.css:root`). Usar em toda transição/animação CSS. Exceção: `.button:active` (80ms, micro-interação) e animações de loop (spinner). |
| Tokens utilitários | `--bg-input: var(--bg-surface-subtle)`, `--text-placeholder: var(--text-muted)`, `--shadow-lg`, `--radius-md` (`themes.css:root`). Ajustam-se automaticamente por tema. |

## Padrões de UX

- **Grupos de botões mutuamente exclusivos** usam `role="radiogroup"` no container + `role="radio"` + `aria-checked` em cada botão. Nunca `aria-pressed` para seleção exclusiva (toggle). CSS: seletores `.theme-card[aria-checked='true']` e `.segmented button[aria-checked='true']` em `global.css`. Exceções legítimas de `aria-pressed`: toggle "Seguir aparência do dispositivo" e estrela de conta primária.
- Seleção (conta, categoria, bandeira, parcelas): bottom-sheet, não dropdown nativo.
- **Lista de itens no mobile = linha inteira como alvo de toque** (`.list-row--tap`,
  extrato de Transações, 2026-07-18): nada de "Editar"/lixeira inline por linha — as ações
  vivem num sheet de detalhe. Destrutivo nunca a um toque em lista rolável.
- **Extrato agrupado por dia** (`.day-group`/`.day-group-header`, 2026-07-18): header sticky
  "Hoje/Ontem/12 jul" + líquido do dia. Cuidado: sticky dentro do `.app-main` mobile exige
  `overflow-x: clip` (não `hidden`, que vira scroll container e mata o sticky).
- **CTA de conclusão de formulário longo é sticky** (`.entry-actions`): no mobile o offset
  usa `--bottom-nav-space` (fonte única da folga da bottom nav, definida no media query
  de 900px) — nunca hardcodar 5.75rem de novo.
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
- **Excluir algo que guarda dinheiro de verdade (meta, cofrinho) precisa perguntar o destino do valor** (aprendido nas Metas, 2026-07-18): nunca decidir sozinho se o dinheiro some ou volta. Sheet de duas opções no molde `.choice-list`/`.choice-card` (ver `AvailableModeSheet`) — "devolver pra uma conta" (pede pra escolher qual, nunca assume a conta original) ou "deixar sumir" — e só oferecer a devolução quando fizer sentido ter "guardado" pra devolver (não numa meta de dívida, onde o valor já foi pago a um credor real).

## Landing (`src/landing/`)

Zona de marketing, identidade Sol clara, com liberdade de cor literal (exceção do teste). Hero com mockup do app em CSS (`AppMockup`) num phone 3D, bento de recursos, faixa do casal (cofrinho), FAQ, CTA. Voz de copy: dor + reframe (PAS), CTA em 1ª pessoa.
