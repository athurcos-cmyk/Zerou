# Achados Visuais — Passada Front-end (2026-07-20)

**Data:** 2026-07-20
**Branch:** `frontend-design-2026-07`
**Escopo:** App logado + páginas públicas, 6 temas (Paper, Perola, Floresta, Lavanda, Rosa, Areia / Noturno, Carbono, Cobalto, Ametista, Grafite, Vinho), 30 agentes de auditoria + 5 meta-revisores.
**Metodologia:** Análise estática de código por 25 agentes + 5 meta-revisores cruzados. Correções dentro do sistema Sol; identidade/marca é [DONO].

---

## Sumário

| Categoria | Encontrados | Corrigidos | [DONO] |
|---|---|---|---|
| Contraste tema escuro | 9 | 6 (temas escuros) | — |
| A11Y (roles, labels, foco) | 8 | 4 | — |
| CSS (variáveis, duplicatas, tokens) | 12 | 6 | — |
| EmptyState / UI | 8 | 0 (contexto adequado) | — |
| Perf / Config | 5 | 3 | — |
| **Total** | **42** | **19** | **—** |

---

## Itens Discretos — Status Final

| ID | Item | Status | Commit |
|---|---|---|---|
| A11Y-02/11 | Focus trap (useFocusTrap) | ✅ Já feito | `f202db0` |
| A11Y-05/10 | Radiogroup no type-switch | ✅ Já feito (New/EditTransaction) | `1934df5` |
| A11Y-05/10 | Radiogroup nos demais aria-pressed | 🟡 Pendente (~20 padrões em 10 arquivos) | — |
| SOL-01/UX-07 | EmptyState em InvoicePage | ✅ Já feito | anterior |
| SOL-01/UX-07 | EmptyState em CardDetailPage | ✅ Já feito | anterior |
| SOL-01/UX-07 | EmptyState em NewTransactionPage | ⚠️ Não aplicável (é formulário) | — |
| SOL-05 | Tokens de duração | 🟡 Tokens existem, ~35 valores mágicos restantes | — |
| PERF-10 | Workbox maxFileSize | ✅ Já feito (2MB) | `a247438` |
| PERF-5 | favicon.png removido | ✅ Já feito | `a084eef` |
| A11Y-16 | Reduced-motion no boot JS | 🔴 Corrigido (hydration bug + listener) | `a6f8773` |
| A11Y-16 | data-reduce-motion listener runtime | 🟡 Listener pendente em ThemeRuntime | — |
| REACT-06/07 | React.memo + useCallback | ✅ memo existe; useCallback pendente | — |
| A11Y-07 | span→button delete categoria | ✅ Já feito | anterior |
| A11Y-08 | focus-visible nav-link | ✅ Já feito | `7ba7b8a` |
| A11Y-12 | aria-label BottomSheet sem título | ✅ Já feito (fallback 'Painel') | anterior |
| A11Y-14 | TagInput aria-label | ✅ Já feito | `4e48bd5` |
| A11Y-17 | SelectField busca aria-label | ✅ Já feito | `4e48bd5` |
| A11Y-13 | aside→nav sidebar | ✅ Já feito | anterior |
| SOL-04 | CSS .custom-select-* morto | ✅ Já removido | `7ba7b8a` |
| SOL-08 | .metric-card--accent duplicado | 🟡 Pendente (unificar 2 blocos) | — |
| A11Y-06 | aria-live chat / Carregando mais | ✅ Já feito | anterior |
| A11Y-06 | role="alert" Dashboard error | 🔴 Corrigido | `d8d3219` |

---

## Temas Escuros — Contraste

### Corrigido (commit `1febb1e`)

| Tema | Token | Antes | Depois | Contraste |
|---|---|---|---|---|
| Noturno | --text-muted | #556677 | #8899BB | 2.86→4.8:1 |
| Carbono | --text-muted | #555565 | #8888A0 | 2.51→4.7:1 |
| Cobalto | --text-muted | #445577 | #7788AA | 2.39→4.6:1 |
| Grafite | --text-muted | #60646e | #90949E | 2.74→4.9:1 |
| Vinho | --text-muted | #7a5a64 | #9A7A84 | 3.07→4.6:1 |
| 6 temas escuros | --border-subtle | hex escuro | rgba(255,255,255,0.08) | 1.10→1.5:1 |
| 6 temas escuros | --border-default | hex escuro | rgba(255,255,255,0.13) | 1.15→1.9:1 |
| Noturno | --action-primary-hover | #1565C0 | #3789d9 | 3.15→4.8:1 |

### [DONO]

- Bordas em temas escuros não atingem 3:1 WCAG 1.4.11 (non-text contrast). Fundos muito escuros tornam impossível atingir 3:1 sem bordas muito claras que destoam visualmente. Decisão de identidade.

---

## Páginas — Achados por Tela

### Dashboard (`/app/dashboard`)
- **Corrigido:** Error notice sem `role="alert"` → adicionado (`d8d3219`)
- **[DONO]:** Label "Compromissos" no atalho leva para "Contas a Pagar" — inconsistência de nomenclatura (UX-25)

### NetWorth (`/app/net-worth` — desativado)
- **Corrigido:** h1 usava `page-title--compact` sem `page-title` base → adicionado (`d8d3219`)
- **Nota:** Página desativada, rota redireciona para dashboard. Código intacto.

### AssistantPage (`/app/assistant`)
- **Pendente:** h1 "Grazi" sem classe CSS (bare `<h1>`)

### Faturas/Compras (InvoicePage)
- **OK:** EmptyState com `illustration="cards"` para compras vazias
- **Contexto:** Mensagens inline em sheets de antecipação/pagamento são adequadas

### Nova Transação (NewTransactionPage)
- **OK:** Aviso "sem conta financeira" com Link para `/app/accounts`
- **Contexto:** É formulário, não lista — EmptyState seria inadequado

### Contas a Pagar/Receber (BillsPage/ReceivablesPage)
- **OK:** EmptyStates com `illustration="bills"` em seções de recorrentes/avulsas

---

## Componentes — Achados

### CSS (global.css)
- **Corrigido:** Seletores `.theme-card[aria-pressed]` e `.segmented button[aria-pressed]` estendidos para `[aria-checked]` (`d8d3219`)
- **Corrigido:** Variáveis `--bg-input`, `--text-placeholder`, `--shadow-lg`, `--radius-md` adicionadas ao `:root` (`a6f8773`)
- **Pendente:** ~400 linhas de CSS morto (`.launch-*`, `.app-preview`, `.pricing-*`, `.feature-grid`, `.faq-grid`, `.cookie-banner`)
- **Pendente:** 5 inputs sem substituto de focus indicator (`outline: none` sem box-shadow/border): `.amount-hero-input`, `.tag-input-field`, `.card-limit-hero-input`, `.admin-search-input`, `.admin-modal__input`

### Touch Targets (mobile)
- **Pendente:** `.icon-button` (34px), `.sheet-close` (36px), `.chip` (~35px) abaixo de 44px WCAG 2.5.8

### Inline Styles
- **Pendente:** 4 `fontFamily` inline (AnnualSummarySheet:108, CardDetailPage:169, NetWorthPage:129, WhatsAppLinkPage:185)
- **Pendente:** Accordion toggle duplicado 4× (Accounts, Bills, Cards, Receivables) com ~7 propriedades inline idênticas

---

## Páginas Públicas

### Landing
- **OK:** Força `data-theme="paper"`, MotionConfig com `reducedMotion="user"`
- **OK:** CSS morto de dark variant preservado para reuso (comentado)

### Auth (Login/Register/ForgotPassword)
- **OK:** `aria-describedby` implementado em Login e Register
- **Pendente:** ForgotPasswordPage sem `aria-describedby` no campo email

---

## PRECISA DEPLOY DO DONO

**Nenhuma alteração em `firestore.rules` ou `functions/src/` foi feita nesta passada.**
Todos os commits são front-end puro (CSS/TSX/TS). Nenhum deploy Firebase necessário.

---

## Commits nesta Branch

| Commit | Descrição |
|---|---|
| `1febb1e` | fix: contraste dos temas escuros — --text-muted, bordas e botao hover |
| `d8d3219` | fix: a11y — role=alert no Dashboard, page-title no NetWorth, aria-checked no CSS |
| `a6f8773` | fix: variaveis CSS faltantes + reduced-motion respeita SO no boot |

(Commits anteriores já estavam na branch: focus trap, reduced-motion CSS, duration tokens, aria-labels, dead CSS, workbox, favicon)

---

## Pendências para Futura Passada

1. Converter ~20 `aria-pressed` para `role="radiogroup"` em 10 arquivos (A11Y-05/10)
2. Substituir ~35 durações CSS mágicas por `var(--duration-*)` (SOL-05)
3. Adicionar focus indicators nos 5 inputs sem substituto visual
4. Remover ~400 linhas de CSS morto
5. Unificar `.metric-card--accent` (2 blocos → 1)
6. Adicionar listener `prefers-reduced-motion` no ThemeRuntime
7. Corrigir 4 `fontFamily` inline → classes CSS
8. Extrair accordion toggle inline → classe CSS reutilizável
9. Aumentar touch targets (`.icon-button`, `.sheet-close`, `.chip`) para ≥44px
10. Adicionar `aria-describedby` no ForgotPasswordPage

---

## [DONO] — Decisões de Identidade/Marca (não alteradas)

- Cor de marca `--action-primary: #EE5524` mantida (decisão registrada A11Y-03)
- Paleta de categorias com falha de daltonismo mantida (identidade do app)
- Rename "Contas a Pagar" → "Compromissos" pendente de decisão
- Bordas em dark themes não atingem 3:1 — limitação física dos fundos muito escuros
- Navegação, raio de input (pílula), labels mantidos como estão
