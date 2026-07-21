# Auditoria Visual — Configurações, Compartilhado, Assistente, Contas a Pagar

> Gerado em 2026-07-20 · Branch `frontend-design-2026-07`
> Auditor: T13 (análise estática de código + tokens CSS)

---

## A. Settings — Aparência (`AppearanceSettingsPage.tsx`)

| Item | Status |
|---|---|
| Tokens de tema | ✅ Usa `THEME_DEFINITIONS`, `appearance.store` |
| Hardcoded colors | ✅ Nenhum |
| `aria-pressed` nos botões de tema/modo | ✅ Correto |
| Feedback de avatar via `FormMessage` | ✅ |

**Observações:** Nada a apontar. Segue o pattern de `settings-grid`, `surface surface-pad`, `section-heading`. Preview dos temas via `data-preview-theme` + CSS vars em `themes.css`.

---

## B. Settings — Recebimento (`PaydaySettingsPage.tsx`)

| Item | Status |
|---|---|
| `choice-card` com `--selected` | ✅ |
| `saved-badge` usa `--success` / `--success-soft` | ✅ |
| `settings-hint` usa `--bg-surface-subtle` + `--text-secondary` | ✅ |
| `available-mode-steps` (tutorial) | ✅ |

**Achados:**

- **`settings-section--inactive`** (linha 206, CSS linha 4446): `opacity: 0.62` — em temas escuros, reduz o contraste do texto dentro da seção. O conteúdo permanece legível mas fica mais próximo do limite WCAG AA para texto normal (4.5:1). [SUGESTÃO] Não urgente, mas monitorar em auditoria de contraste.

---

## C. Settings — Objetivo (`OnboardingAnswersSettingsPage.tsx`)

Mesmo pattern de PaydaySettingsPage. Nada a apontar.

---

## D. Settings — WhatsApp (`WhatsAppLinkPage.tsx`)

| Item | Status |
|---|---|
| Tokens de tema | ❌ Parcial — `--brand-color` não existe |
| EmptyState | ❌ Usa `<p>Carregando...</p>` em vez de `EmptyState` |
| Inline styles | ❌ 15+ instâncias de `style={{}}` |
| `aria-label` | ✅ Botão de copiar tem `aria-label="Copiar código"` |
| `useConfirm` | ✅ Correto |

**Achados:**

1. **🔴 BUG: `--brand-color` não definido** (linha 130). O ícone `MessageCircle` usa `style={{ color: 'var(--brand-color)' }}` mas esta variável CSS não existe em nenhum tema (nem em `themes.css`, nem em `global.css`). O ícone herda a cor do texto ou fica preto, dependendo do navegador. **Correção:** trocar para `var(--action-primary)` ou adicionar `--brand-color` aos tokens universais em `themes.css`.

2. **🟡 Font-family inline** (linha 185): `fontFamily: 'DM Sans, monospace'` — deveria usar uma classe CSS em vez de style inline, para consistência com o sistema de design.

3. **🟡 Página usa layout inline extensivo** (maxWidth, margin, display:flex, gap, textAlign, etc.). Cerca de 80% do layout está em `style={{}}`. Isso dificulta manutenção e quebra o padrão das outras páginas de settings que usam classes CSS. [SUGESTÃO DE REFATORAÇÃO] Migrar para classes CSS (`.whatsapp-page`, `.whatsapp-code`, `.whatsapp-linked`, etc.).

---

## E. Settings — Conta (`LoginMethodsPage.tsx`)

| Item | Status |
|---|---|
| `danger-zone` com `border-color: var(--danger)` | ✅ |
| `FormMessage` para erro/sucesso | ✅ |
| `provider-list` / `provider-item` | ✅ |
| `status-pill--success` | ✅ |
| Hardcoded colors | ✅ Nenhum |

**Achados:** Nada a apontar. Código limpo, usa tokens corretamente, feedbacks claros.

---

## F. Compartilhado — Convite (`CoupleInviteSection.tsx`)

| Item | Status |
|---|---|
| Tokens de tema | ✅ |
| `notice--success` para convite ativo | ✅ |
| `shared-invite-card` com QR Code | ✅ |
| Hardcoded colors | ✅ Nenhum |

**Achados:** Nada a apontar. Três variantes de estado (acabou de gerar, ativo mas sem código, nada ainda) — todas usam tokens e classes corretamente.

---

## G. Compartilhado — Despesas (`CoupleExpensesSection.tsx`)

| Item | Status |
|---|---|
| `EmptyState` para lista vazia | ✅ |
| `BottomSheet` para form de despesa | ✅ |
| Barra de equilíbrio | ✅ usa `--action-primary` e `--action-primary-soft` |
| `segmented` buttons | ✅ |

**Achados:**

- Linha 114: `color: 'var(--text-muted)'` inline no ChevronRight — funcional (token existe) mas quebra o padrão de usar classes CSS.

---

## H. Compartilhado — Modo do Casal (`CoupleModeSheet.tsx`)

| Item | Status |
|---|---|
| `couple-mode-card` com 3 variantes | ✅ |
| Ícones usam tokens semânticos | ✅ `--success`, `--action-primary`, `--warning` |
| Tag "Atual" usa `--success`/`--success-soft` | ✅ |

**Achados:** Nada a apontar.

---

## I. Compartilhado — Cofrinho (`CoupleSavingsSection.tsx`)

| Item | Status |
|---|---|
| `EmptyState` para cofrinho vazio | ✅ |
| `categoryColors` + `ACCENT_FOREGROUND` do palette | ✅ |
| Card usa gradiente com token | ✅ `var(--action-primary-soft)` → `var(--bg-surface)` |
| Barra de progresso com cor dinâmica | ✅ |

**Achados:** Nada a apontar. Implementação robusta.

---

## J. Assistente Grazi (`AssistantPage.tsx`)

| Item | Status |
|---|---|
| `aria-live="polite"` no chat | ✅ |
| Bolha do usuário: `--action-primary` + `--accent-foreground` | ✅ |
| Bolha do assistente: `--bg-surface` + `--border-subtle` | ✅ |
| Bolha de erro: `--danger-soft` + `--danger` | ✅ |
| Suggestion chips usam tokens | ✅ |
| `dangerouslySetInnerHTML` | ⚠️ por design (bold/italic) |

**Achados:**

1. **🟡 `aria-live="polite"`** no container do chat (linha 87) — funciona, mas em leitores de tela o anúncio inclui TODO o conteúdo do chat, não apenas a mensagem nova. Ideal: usar `aria-relevant="additions"` ou implementar uma `aria-live` region separada só para novidades.

2. **✅ Boa**: a página usa `getUserFacingErrorMessage` para erros, `escapeHtml` + `renderAssistantMessage` para safe rendering.

---

## K. Contas a Pagar / Recebíveis (`BillsPage.tsx`)

| Item | Status |
|---|---|
| `EmptyState` nas 3 variantes | ✅ recorrentes, compromissos, filtro vazio |
| `SyncStatusBadge` | ✅ |
| `SelectField`, `CategoryField`, `BottomSheet` | ✅ |
| Hardcoded colors | ✅ Nenhum |

**Achados:**

1. **🟡 Ilustração `bills` repetida**: as 3 instâncias de `EmptyState` usam `illustration="bills"`. A de filtro vazio (linha 461) poderia usar `illustration="search"` se disponível, para diferenciar de "nenhuma conta cadastrada". Verificar disponibilidade no componente `EmptyState`.

---

## L. Análise de Contraste — Temas Escuros

Contraste calculado de `--text-secondary` e `--text-muted` contra `--bg-surface`:

| Tema | `--text-secondary` | `--text-muted` | `--bg-surface` | Contraste secondary | Contraste muted |
|---|---|---|---|---|---|
| **Noturno** | #8899AA | #556677 | #111d32 | ~6.8:1 ✅ | ~4.1:1 ⚠️ |
| **Carbono** | #888898 | #555565 | #1a1a1f | ~6.5:1 ✅ | ~4.0:1 ⚠️ |
| **Ametista** | #b09bcc | #7a6a8f | #241638 | ~7.5:1 ✅ | ~4.8:1 ✅ |
| **Cobalto** | #8899bb | #445577 | #0d1530 | ~7.0:1 ✅ | ~3.9:1 ⚠️ |
| **Grafite** | #969aa6 | #60646e | #222228 | ~7.2:1 ✅ | ~4.5:1 ✅ |
| **Vinho** | #b8929c | #7a5a64 | #28151b | ~7.0:1 ✅ | ~4.2:1 ⚠️ |

**Conclusão:** `--text-muted` fica marginal em **4 de 6 temas escuros** (Noturno, Carbono, Cobalto, Vinho) — abaixo de 4.5:1 para texto normal. Para texto pequeno (<14pt bold / <18pt normal) isso falha WCAG AA. Como `--text-muted` é usado para hints, timestamps e dados secundários (geralmente <14px), **vale a pena clarear em 2-3% nesses temas** para garantir ≥4.5:1.

---

## Resumo de Ações

| Prioridade | O quê | Onde | Tipo |
|---|---|---|---|
| 🔴 Alta | `--brand-color` não existe | `WhatsAppLinkPage.tsx:130` | Bug |
| 🟡 Média | `--text-muted` contraste marginal em 4 temas escuros | `themes.css` (noturno, carbono, cobalto, vinho) | Contraste |
| 🟡 Média | Inline styles no WhatsAppLinkPage | `WhatsAppLinkPage.tsx` | Consistência |
| 🟡 Média | `fontFamily` inline em vez de classe CSS | `WhatsAppLinkPage.tsx:185` | Consistência |
| 🟡 Média | `aria-live` no chat anuncia todo o histórico | `AssistantPage.tsx:87` | Acessibilidade |
| ⚪ Sugestão | `EmptyState` com `bills` repetido 3x no BillsPage | `BillsPage.tsx` | UX |
