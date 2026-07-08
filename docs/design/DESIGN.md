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
- Telas de lançamento (transação, cartão): **header de valor gigante** colorido por contexto, com o valor em DM Sans 800. Tipo via segmented "type-switch".

## Componentes-base (reutilizar sempre)

| Componente | Uso |
|---|---|
| `BottomSheet` | Folha que sobe de baixo (portal, ESC, backdrop). Base de todos os pickers/modais. |
| `SelectField` | Campo que abre sheet com lista de opções + ícones. Substitui `<select>`. |
| `CategoryField` | Sheet de categorias com ícone+cor, criar/editar/excluir. |
| `ConfirmDialog` (`useConfirm`) | Confirmação destrutiva em sheet — nunca `window.confirm`. |
| `EmptyState` | Estado vazio com ilustração SVG própria. |
| `categoryIcons` / `palette` | 36 ícones + paleta de cores de categoria/meta. |
| `.metric-card` / `.metric-icon` / `.metric-strip` (`global.css`) | Cartão de métrica/KPI compacto (usado em `SearchPage.tsx`). `.metric-card--accent` para o destaque principal (mesmo tratamento gradiente do `.dash-hero`). Valor de **texto longo** (não dinheiro/porcentagem) precisa do modificador `.metric-card-value--compact` — a tipografia padrão do card é grande demais e corta nomes como "Alimentação". |

## Padrões de UX

- Seleção (conta, categoria, bandeira, parcelas): bottom-sheet, não dropdown nativo.
- Chips para presets (datas Hoje/Ontem/Outra, tipo de divisão).
- Empty states sempre com ilustração + CTA, não texto seco.
- Barras de progresso para limite de cartão, metas e cofrinho.
- Nunca expor termo técnico ao usuário (sem "ledger", "workspace", "checkout").
- **Navegação por mês/período** (`.month-switcher`, `global.css`): `‹ Mês de Ano › ` com `.icon-button`, introduzido em `SearchPage.tsx` (2026-07-08) — padrão a reaproveitar se outra tela precisar filtrar por mês, em vez de inventar um novo controle.
- Ação em cartão do casal/despesa que muda estado do servidor (gerar/regenerar/revogar convite): sempre com `confirm()` explicando a consequência antes de agir, principalmente se for destrutiva ou invalidar algo que já foi compartilhado com outra pessoa.

## Landing (`src/landing/`)

Zona de marketing, identidade Sol clara, com liberdade de cor literal (exceção do teste). Hero com mockup do app em CSS (`AppMockup`) num phone 3D, bento de recursos, faixa do casal (cofrinho), FAQ, CTA. Voz de copy: dor + reframe (PAS), CTA em 1ª pessoa.
