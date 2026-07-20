# Contexto da Auditoria — 2026-07-19

## Stack e versões exatas

| Componente | Versão | Notas |
|---|---|---|
| React | 19.2.7 | SPA client-side (sem RSC). CVEs 2026-23864/23869 (Server Components DoS) **não afetam** este projeto. |
| React DOM | 19.2.7 | |
| React Router DOM | 7.17.0 | |
| TypeScript | 6.0.3 | Strict mode |
| Vite | 8.0.16 | Corrige CVE-2026-53571 (NTFS bypass), CVE-2026-39363 (WebSocket file read), CVE-2026-39364 (query bypass), CVE-2026-39365 (path traversal) |
| Firebase Web SDK | 12.14.0 | persistentLocalCache + experimentalAutoDetectLongPolling |
| Firebase Admin | 13.10.0 (dev) / 13.6.0 (functions) | |
| Firebase Functions | 7.0.0 | Sem vulnerabilidades diretas (Snyk) |
| Firebase Tools | 15.20.0 | |
| Zod | 4.4.3 | Validação de schemas |
| Zustand | 5.0.14 | Gerenciamento de estado |
| Framer Motion | 12.40.0 | Animações |
| Vite PWA Plugin | 1.3.0 | Service worker |
| DeepSeek | deepseek-chat (API HTTP) | Usado pela Grazi (app) e WhatsApp |
| Stripe | 20.0.0 (functions) | Billing scaffold (inativo) |
| Node | >= 22.0.0 | |

## Resultados npm audit (raiz)

13 vulnerabilidades: 12 moderadas, 1 alta (undici < 7.28.0 — HTTP request smuggling). Todas transitivas via firebase-admin e firebase-tools. Nenhuma crítica.

## Superfícies de risco

1. **firestore.rules** — Perímetro principal de autorização. Toda escrita do cliente passa por aqui. Histórico de 3 incidentes de dessincronização enum/campo.
2. **Cloud Functions WhatsApp** — Webhook público (`onRequest`), sem autenticação Firebase. Validação HMAC atualmente **desativada**. Processa mensagens de qualquer pessoa que conheça a URL.
3. **Grazi/DeepSeek** — Prompt injection via histórico de conversa. Rate limit 60/dia sem limite por minuto. System prompt contém regras de produto.
4. **Dados pessoais financeiros** — Isolamento pessoal↔casal depende das regras do Firestore. Sem criptografia client-side.
5. **Service worker PWA** — Escopo de cache, atualização, possibilidade de cache poisoning.
6. **CSP headers (Vercel)** — `script-src: 'unsafe-inline'` permite XSS se houver injeção.
7. **Segredos** — `.env.zerou-26757` contém tokens do WhatsApp. Service account keys em `scripts/`.

## O que não é achado (já decidido)

Ver `docs/planning/TODOS.md` para lista completa. Destaques:
- Offline-first é intencional (fire-and-forget)
- Patrimônio Líquido desativado de propósito
- Projeção de Fluxo de Caixa removida de propósito
- Paleta de cores com problema de daltonismo — decisão de manter
- Grazi nunca sugere produto específico — regra de produto
- Rate limit generoso (60/dia) — produto 100% gratuito

## Cobertura da auditoria

16+ domínios distribuídos em 5 camadas:
- Camada 1: Auditores por domínio
- Camada 2: Revisores 1:1
- Camada 3: Meta-auditor
- Camada 4: Meta-meta-auditor
- Camada 5: Consolidação (laudo final)
