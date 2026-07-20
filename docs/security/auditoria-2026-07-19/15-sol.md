# Auditoria: Sistema de Design (Sol)

**Data:** 2026-07-19
**Escopo:** `themes.css`, `global.css`, `palette.ts`, `categoryIcons.tsx`, componentes-base (`BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState`), `docs/design/DESIGN.md`, teste `noHardcodedColors`

---

## Sumário

| ID | Título | Severidade |
|---|---|---|
| SOL-01 | Empty states com texto seco sem ilustração em 5 telas | Média |
| SOL-02 | Framer Motion instalado mas NUNCA usado no app (só na landing) | Média |
| SOL-03 | `prefers-reduced-motion` do SO ignorado — só configuração manual | Baixa |
| SOL-04 | CSS `.custom-select-*` é morto (dead code) | Baixa |
| SOL-05 | Transições CSS com durações inconsistentes (120ms a 400ms) | Baixa |
| SOL-06 | Inline `fontFamily` em 4 componentes em vez de classe CSS | Informativa |
| SOL-07 | `overflow-x: hidden` no `<html>` e `<body>` conflita com recomendações de sticky do próprio DESIGN.md | Informativa |
| SOL-08 | `.metric-card` definido duas vezes em `global.css` (sobrescrita silenciosa) | Baixa |
| SOL-09 | Nenhuma animação de entrada/saída em páginas ou transições de rota | Informativa |
| SOL-10 | Temas claros e escuros têm valores semânticos diferentes (esperado, mas documentar) | Informativa |
| SOL-11 | Avatar colors em `palette.ts` estão corretos e passam no teste | — |

---

## SOL-01 — Empty states com texto seco sem ilustração em 5 telas

**Severidade:** Média
**Local:**
- `src/pages/InvoicePage.tsx` — linhas 321, 355
- `src/pages/CardDetailPage.tsx` — linha 255
- `src/pages/NewTransactionPage.tsx` — linha 186
- `src/pages/SearchPage.tsx` — linhas 875, 934
- `src/pages/shared/CoupleExpensesSection.tsx` — linha 148

**Descrição:** O design system define `EmptyState` como o componente padrão para estados vazios, com 6 variantes de ilustração SVG. Porém, 5 telas usam elementos HTML nativos (`<p className="text-secondary">`) ou `<div className="notice">` em vez de `<EmptyState>` para renderizar estado vazio, criando inconsistência visual.

**O que o usuário ve:** Ao lado de telas que mostram ilustrações caprichadas (transações com cifrazo, carteira com moedas, goals com argola), o InvoicePage mostra apenas "Nenhuma compra nesta fatura ainda." em texto secundário simples — sem ilustração, sem CTA. A quebra de padrão é perceptível navegando entre abas.

**Solução sugerida:** Substituir os textos secos por `<EmptyState>` com a ilustração adequada (provavelmente `illustration="cards"` para faturas) e um CTA quando aplicável (ex.: "Lançar primeira compra").

**Confiança:** 10

---

## SOL-02 — Framer Motion instalado mas NUNCA usado no app (só na landing)

**Severidade:** Média
**Local:**
- `package.json` linha 32: `"framer-motion": "^12.40.0"`
- Único uso: `src/landing/LandingCss.tsx` (exclusivamente)

**Descrição:** Framer Motion está listado como dependência de produção (`dependencies`, não `devDependencies`) mas é usado **exclusivamente** na landing page (`src/landing/LandingCss.tsx`). Nenhum componente do app (telas logadas, sheets, formulários, transições de rota) usa Framer Motion — nem `motion.div`, nem `AnimatePresence`, nem `useAnimation`.

Toda animação no app é feita via CSS puro (`transition`, `@keyframes`). O bundle inclui ~30KB+ de JS de animação que nunca executa no contexto do app.

**Impacto:** Peso adicional de bundle para funcionalidade não utilizada. Se a intenção é usar Framer Motion no app futuramente, manter é ok; se não, é dead weight.

**Solução sugerida:**
- Opção A: Mover para `devDependencies` se for só da landing (landing é carregada separadamente).
- Opção B: Remover se não houver plano de usar no app.

**Confiança:** 10

---

## SOL-03 — `prefers-reduced-motion` do SO ignorado — só configuração manual

**Severidade:** Baixa
**Local:** `src/styles/global.css` linhas 92-98, `src/theme/ThemeRuntime.tsx`

**Descrição:** O CSS em `global.css` já respeita `html[data-reduce-motion='true']` e reduz animações/transições para 1ms. Mas a única forma de ativar isso é via configuração manual no perfil do usuário (`preferences.reduceMotion`). Não há deteccao automática de `prefers-reduced-motion: reduce` do sistema operacional.

O `ThemeRuntime.tsx` escuta `prefers-color-scheme` para o tema automático, mas **não** escuta `prefers-reduced-motion`.

**O que o usuário ve:** Um usuário que configurou "Reduzir movimento" no sistema operacional (acessibilidade) continua vendo todas as animações no Zerou — sheets que sobem, fade de backdrop, transições de hover — até lembrar de desligar manualmente em Configuracoes > Aparencia.

**Solução sugerida:** Adicionar listener em `ThemeRuntime.tsx` para `prefers-reduced-motion: reduce` (análogo ao listener de `prefers-color-scheme`) e propagar para o store.

**Confiança:** 10

---

## SOL-04 — CSS `.custom-select-*` é morto (dead code)

**Severidade:** Baixa
**Local:** `src/styles/global.css` linhas 1482-1618 (~135 linhas)

**Descrição:** As classes `.custom-select*` (`.custom-select-trigger`, `.custom-select-dropdown`, `.custom-select-option`, etc.) estão definidas em `global.css` com 135 linhas de CSS, mas **nenhum** componente TSX as utiliza — nem como className, nem como referência. O Grep por `custom-select` em todos os `.tsx` retornou zero resultados.

Trata-se de um dropdown nativo-like (com `position: absolute`, animação `dropdown-in`), que **não** segue o padrão BottomSheet do design system. Provavelmente sobrou de uma implementação anterior ou foi planejada e nunca usada.

**Impacto:** CSS morto aumenta o bundle em ~2KB e polui o arquivo. Futuros devs podem estranhar a presenca de dois padrões de seletor concorrentes.

**Solução sugerida:** Remover o bloco `.custom-select-*` inteiro.

**Confiança:** 10

---

## SOL-05 — Transições CSS com durações inconsistentes

**Severidade:** Baixa
**Local:** `src/styles/global.css` (múltiplas linhas)

**Descrição:** As duracoes de transição no `global.css` variam sem padrão claro:

| Duração | Onde |
|---|---|
| 80ms | `.button:active` |
| 120ms | `background` de hover em opções, `border-color` de avatar, `category-option`, `category-icon-option` |
| 140ms | `background` de hover em list-row, `border-color` de category-option |
| 160ms | `.button`, `.input`, `.select-row` hover/focus |
| 200ms | backdrop fade (`sheet-fade`), transição `.custom-select-chevron`, `.welcome-tour-dot` |
| 220ms | sheet retract (`transform` no BottomSheet.tsx) |
| 260ms | sheet slide-up (`sheet-up` keyframe) |
| 300ms | `card-limit-bar-fill` width |
| 400ms | SearchPage opacity/width |
| — | Nao há token CSS como `--duration-fast`, `--duration-normal` |

Não há um sistema de tokens de timing. Cada componente define sua própria duração.

**Impacto:** Baixo para o usuário (as diferenças são sutis), mas dificulta manutenção consistente. Um novo componente pode escolher um valor que destoa dos vizinhos.

**Solução sugerida:** Criar tokens CSS `--duration-fast: 120ms`, `--duration-normal: 200ms`, `--duration-slow: 300ms` e referenciá-los.

**Confiança:** 8

---

## SOL-06 — Inline `fontFamily` em 4 componentes em vez de classe CSS

**Severidade:** Informativa
**Local:**
- `src/pages/CardDetailPage.tsx` linha 168
- `src/components/AnnualSummarySheet.tsx` linha 108
- `src/pages/NetWorthPage.tsx` linha 129
- `src/settings/WhatsAppLinkPage.tsx` linha 185

**Descrição:** Quatro componentes usam `style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}` inline em vez de usar a classe `.display-number` ou outra classe CSS definida em `global.css`. Esse padrão, embora funcional, cria duplicação: se a font-family do sistema de design mudar, precisará ser alterada em 5 lugares (4 inlines + 1 CSS) em vez de só no CSS.

**O que o usuário ve:** Nada — o resultado visual é idêntico. O problema é de manutenibilidade.

**Solução sugerida:** Substituir os inlines por classes CSS existentes (`.display-number` nos casos de valores monetários, ou criar uma nova classe se necessário).

**Confiança:** 9

---

## SOL-07 — `overflow-x: hidden` no `<html>` e `<body>` conflita com recomendações do DESIGN.md sobre sticky

**Severidade:** Informativa
**Local:**
- `src/styles/global.css` linhas 23 e 48: `overflow-x: hidden`
- `docs/design/DESIGN.md` seção "Extrato agrupado por dia": recomenda `overflow-x: clip` (não `hidden`)
- `src/styles/global.css` linha 3055: `.app-main` em mobile usa `overflow-x: clip`

**Descrição:** O DESIGN.md documenta que `overflow-x: hidden` transforma o elemento em scroll container e **mata** `position: sticky` dos elementos filhos. Por isso o `.app-main` em mobile usa `overflow-x: clip`. No entanto, o `<html>` e o `<body>` globais continuam com `overflow-x: hidden`.

Isso é um problema conhecido (documentado na sessão de 2026-07-08 em `docs/history/2026-07.md`), onde `overscroll-behavior-y: contain` foi tentado e falhou justamente por interagir mal com o `overflow-x: hidden` do body.

**Impacto:** Potencialmente, se algum elemento com `position: sticky` for inserido fora do `.app-main` (ou se a estrutura mudar), o sticky pode falhar silenciosamente — e o desenvolvedor vai perder tempo debugando.

**Solução sugerida:** Documentar esta limitação explicitamente perto das regras de `overflow-x` no CSS, ou investigar se `clip` no `<html>` e `<body>` resolveria sem quebrar o scroll.

**Confiança:** 7

---

## SOL-08 — `.metric-card` definido duas vezes em `global.css` (sobrescrita silenciosa)

**Severidade:** Baixa
**Local:** `src/styles/global.css`
- Linha 686: `.metric-card { display: grid; gap: 0.55rem; }`
- Linha 796: `.metric-card { min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }`

**Descrição:** A classe `.metric-card` é declarada duas vezes. A segunda declaracao (linha 796) sobrescreve `display` (grid → flex), `gap` (0.55rem → 0.3rem) e adiciona `min-width`, `flex-direction`. A primeira declaracao (linha 686) é completamente ignorada.

**O que o usuário ve:** Nada — a segunda declaracao vence por vir depois no CSS.

**Impacto:** Manutenção: um desenvolvedor que editar a primeira declaracao pensando que está mudando o componente vai descobrir que nada mudou. Código confuso.

**Solução sugerida:** Remover a primeira declaracao (linhas 686-689), unificar num único bloco.

**Confiança:** 10

---

## SOL-09 — Nenhuma animação de entrada/saída em páginas ou transições de rota

**Severidade:** Informativa
**Local:** App inteiro — transições entre rotas, abertura/fechamento de páginas

**Descrição:** O app React Router não tem nenhuma animação de transição de página. Quando o usuário navega entre telas (ex.: Dashboard → Contas), a troca é instantânea e seca — sem fade, slide, ou qualquer transição. As únicas animações existentes são:
- Sheet: fade do backdrop e slide-up do painel (CSS keyframes)
- Hover/focus: transições de cor/borda em botões e inputs
- Barra de progresso do cartão: transição de width em 300ms

Não há `AnimatePresence`, nem CSS de transição de página, nem layout animations.

**O que o usuário ve:** Navegação entre abas no mobile é instantânea — o que é funcional, mas pode parecer abrupto comparado com apps nativos que usam transições de tela.

**Solução sugerida:** Considerar adicionar transições sutis de página (ex.: fade de 150ms) via Framer Motion ou CSS. Depende de prioridade de produto — não crítico.

**Confiança:** 8

---

## SOL-10 — Temas claros e escuros têm valores semânticos diferentes (esperado, mas documentar)

**Severidade:** Informativa
**Local:** `src/styles/themes.css`

**Descrição:** Os temas claros e escuros usam valores diferentes para cores semânticas:

| Token | Claros (paper, perola, etc.) | Escuros (noturno, carbono, etc.) |
|---|---|---|
| `--success` | `#388E3C` (verde escuro) | `#66BB6A` (verde claro) |
| `--danger` | `#D32F2F` (vermelho escuro) | `#EF5350` (vermelho claro) |
| `--warning` | `#F9A825` (amarelo escuro) | `#FFD54F` (amarelo claro) |
| `--info` | `#0288D1` (azul escuro) | `#42A5F5` (azul claro) |

Isso é esperado e correto: em fundos escuros, cores mais claras mantêm contraste legível. Mas não há documentação explícita dessa intencionalidade. Um futuro mantenedor pode "corrigir" achando que é erro.

**Solução sugerida:** Adicionar comentário em `themes.css` acima dos blocos escuros explicando que os valores semânticos em temas dark são propositalmente mais claros para manter contraste com fundos escuros.

**Confiança:** 10

---

## SOL-11 — Paleta de categorias e avatar colors: corretos e passam no teste

**Severidade:** N/A
**Local:** `src/theme/palette.ts`, `src/test/noHardcodedColors.test.ts`

**Descrição:** A paleta de 12 cores de categoria está registrada exclusivamente em `palette.ts`. As cores de avatar (pele, cabelo, acessórios) também estão em `palette.ts`. O teste `noHardcodedColors.test.ts` cobre todos os arquivos `.ts`, `.tsx`, `.css` em `src/` (excluindo `palette.ts`, `themes.css` e `landing/`).

O teste escaneia recursivamente `src/` por qualquer hex (`#[0-9a-fA-F]{3,8}`) ou `rgba(`. Verifiquei manualmente que as únicas ocorrências estão em `src/landing/` (exceção documentada). As cores de `serviceBrandColors` em `palette.ts` (12 serviços) também estão cobertas.

**Conclusão:** Nenhuma violação de cor hardcoded encontrada. O teste é eficaz.

---

## Aderência ao design system — resumo

| Padrão | Status |
|---|---|
| `EmptyState` com ilustração | Parcial — 5 telas ainda usam texto seco |
| `BottomSheet` para seletores/pickers | OK — sem exceções |
| `SelectField` substitui `<select>` | OK — zero `<select>` nativos |
| `ConfirmDialog` substitui `window.confirm` | OK — zero `window.confirm` |
| `CategoryField` para seleção de categoria | OK |
| `display-number` para valores monetários | OK — mas 4 inlines de fontFamily |
| DM Sans para números / Instrument Sans para corpo | OK — fontes carregadas e aplicadas |
| `data-theme="paper"` em páginas públicas | OK — AuthLayout e landing forçam paper |
| Tema salvo no perfil, aplicado no boot | OK — ThemeRuntime + AppearanceSyncBridge |
| `overflow-x: clip` no app-main mobile | OK (mas html/body ainda usam `hidden`) |
| `--bottom-nav-space` como fonte única | OK — usado só no CSS |
| `chip-row--scroll` para chips roláveis | OK — Transactions e Receivables |
| `.month-switcher` para navegação por mês | OK — SearchPage |
| `.metric-card` com modificadores | OK — mas definido duas vezes |
| `.entry-actions` sticky com `--bottom-nav-space` | OK — New/EditTransaction |
| Framer Motion | Instalado, usado só na landing — morto no app |
| `prefers-reduced-motion` | Só manual, sem deteccao automática do SO |
| Animação de transição de páginas | Ausente |

---

## Itens não encontrados (sem achados)

- **Hardcoded colors em componentes**: Nenhum — cobertura do `noHardcodedColors` é eficaz.
- **window.confirm**: Nenhum — todos substituídos por `useConfirm`.
- **Native `<select>`**: Nenhum — todos substituídos por `SelectField`.
- **Botao de editar/excluir inline em listas roláveis**: Nenhum — todas as acoes vivem em sheet de detalhe (padrão `list-row--tap`).
- **Barra de progresso com borda arredondada dos dois lados**: Nenhuma — todas usam `border-radius: 0 4px 4px 0`, conforme especificado.
- **Exposição de termo técnico ao usuário**: Nenhum — sem "ledger", "workspace", "checkout" na UI.

---

## Estatisticas do teste `noHardcodedColors`

- Cobre: todos `.ts`, `.tsx`, `.css` em `src/` recursivamente
- Exclui: `src/styles/themes.css`, `src/theme/palette.ts`, `src/landing/`
- Padrão: `#[0-9a-fA-F]{3,8}` + `rgba(`
- Offenders encontrados: 0
- Efetividade: Alta — mas verificar manualmente se arquivos novos com extensão diferente (`.js`?) escapariam do filtro
