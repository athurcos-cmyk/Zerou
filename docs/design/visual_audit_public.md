# Auditoria visual — páginas públicas

**Data:** 2026-07-20
**Método:** Análise de código (sem browser disponível)
**Tema:** Paper (claro, forçado) — confirmado em todas as páginas

---

## Landing page (`LandingShell.tsx` + `LandingCss.tsx`)

- `data-theme="paper"` forçado no `<main>` — correto, nunca escura
- Framer Motion envolto em `<MotionConfig reducedMotion="user">` desde commit `1934df5` — correto
- Header tem logo + nav links (Recursos, Casal, Como funciona) + CTAs (Entrar, Começar agora)
- "Entrar" não some em mobile (corrigido em 2026-07-18) — confirmar ao vivo
- Footer tem links: Segurança, Ajuda, Termos, Privacidade — OK

**Achados [DONO]:**
- Kicker "Modo casal" usa cor literal `#f8a07a` (rosa salmão) que não corresponde a nenhum token do tema (UX-20). [DONO] decidir se mantém ou usa `var(--action-primary)`.

## Auth pages (`AuthLayout.tsx`)

- `data-theme="paper"` forçado — OK
- Login (`/login`), Register (`/register`), Forgot Password (`/forgot-password`)
- Não foi possível verificar visualmente sem browser
- A11Y-17: aria-describedby ausente nos erros de formulário — ainda pendente

## Public pages (`PublicLayout.tsx`)

- `data-theme="paper"` forçado — OK
- Features, Security, Help, Contact, Privacy Center, Termos, Privacidade, Data Deletion
- Não foi possível verificar visualmente sem browser

## Resumo

| Página | Tema forçado | OK? |
|---|---|---|
| Landing `/` | Paper | Confirmei via CSS |
| `/login` | Paper | `AuthLayout.tsx` linha 14 |
| `/register` | Paper | `AuthLayout.tsx` |
| `/forgot-password` | Paper | `AuthLayout.tsx` |
| `/features` | Paper | `PublicLayout.tsx` |
| `/security` | Paper | `PublicLayout.tsx` |
| `/help` | Paper | `PublicLayout.tsx` |
| `/contact` | Paper | `PublicLayout.tsx` |
| Páginas legais | Paper | `PublicLayout.tsx` |

**Nenhuma página pública usa tema escuro.** Todas forçam `data-theme="paper"` via layout. ✅
