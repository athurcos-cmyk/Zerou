# Brief — Granativa (ex-Zerou)

## Estado atual

SaaS/PWA financeiro mobile-first (React 19 + Firebase Firestore + Vercel). Duas frentes: controle individual e organizacao a dois (casal). App em **lancamento gratuito** — sem cobranca, checkout ou pagina de planos ativa. Projeto Firebase no **Blaze**, produto gratuito, sem Cloud Functions no fluxo principal. Producao: https://granativa.com.br (dominio registro.br, DNS no Cloudflare, deploy Vercel). Trabalho direto na `main`.

**WhatsApp** (2026-07-15): integracao oficial Meta Cloud API v25.0, **webhook funcionando end-to-end** (mensagem real testada, log `whatsapp_message_received` confirmado). Cloud Functions: `whatsappWebhook` (onRequest, webhook publico) + `generateWhatsappLinkCode` (onCall, vinculo de conta) — codigo em `functions/src/whatsapp/`. Client: pagina de vinculacao `/app/settings/whatsapp` (`src/settings/WhatsAppLinkPage.tsx`), com link no menu mobile e desktop. DeepSeek extrai gastos de mensagens em portugues. Numero real: +55 11 936192757. Phone Number ID: `1262339823619604`. WABA ID: `1431749015518519`. App Meta (URL canonica): https://developers.facebook.com/apps/1480907564073971/whatsapp-business/. Webhook URL: https://southamerica-east1-zerou-26757.cloudfunctions.net/whatsappWebhook — verify token: `granativa-whatsapp-verify-2026`. Token permanente gerado via System User (`business_management` + `whatsapp_business_messaging` + `whatsapp_business_management`). Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRANATIVA_WHATSAPP_NUMBER`. **Causa raiz do #133010/webhook silencioso**: WABA nunca tinha sido inscrita no app (`POST /{WABA_ID}/subscribed_apps` resolveu). **Bug corrigido** (commit `2f04984`): menu mobile nao tinha o link WhatsApp, so a sidebar desktop tinha. **Vinculacao de conta corrigida** (commit `b04cbd0`): faltava indice do Firestore (`whatsappLinkCodes.code`, escopo COLLECTION_GROUP) — `processLinkCode()` falhava silenciosamente, usuario mandava o codigo e nunca recebia resposta. Indice deployado e `READY`. **Paridade com a Grazi** (commit `fc48aa8`): bot agora cria categoria (so por pedido explicito), lanca despesa e receita, e responde perguntas financeiras (mesma persona/dados da Grazi do app, rate limit compartilhado). **Vinculo unico + desvincular**: so um numero ativo por workspace, com botao "Desvincular" em Configuracoes > WhatsApp (fechou gap de compliance ja prometido nos Termos/Data Deletion). Ver historico completo em `docs/whatsapp/WHATSAPP.md`.

**Cloudflare DNS** (2026-07-15): dominio migrado do registro.br. Nameservers: `kareem.ns.cloudflare.com`, `mia.ns.cloudflare.com`. DNS records: A `granativa.com.br` → `216.198.79.1` (cinza/DNS only), CNAME `www` → Vercel. Email Routing: `suporte`, `contato`, `privacidade` → `zerou.contato.net@gmail.com`.

**Politicas legais reescritas** (2026-07-15): 3 documentos em `src/pages/LegalPages.tsx` com 21 secoes (Termos), 16 secoes (Privacidade), 7 secoes (Data Deletion). Identificacao completa: Arthur Olimpio Lima, CPF 487.655.288-67, Sao Paulo/SP. LGPD, CDC, Marco Civil cobertos. WhatsApp, DeepSeek e Grazi explicitamente tratados. Canais oficiais: `suporte@granativa.com.br`, `privacidade@granativa.com.br`. ANPD linkada.

**Assistente de IA — Grazi** (`/app/assistant`, 2026-07-14): chat via DeepSeek, rate limit 60 msgs/dia, 9 secoes de contexto. Cloud Function `financialAssistantChat` em `functions/src/ai/`. Doc canonica: `docs/ai/GRAZI.md`. Cobertura legal: Termos secoes 8-9, Privacidade secoes 3.5, 4(e), 13.3.

**5 novas features** (2026-07-14): Patrimonio Liquido, Projecao de Fluxo de Caixa, Comparacao Ano contra Ano, Resumo Anual, Alertas de Orcamento.

**Unificacao Contas a Pagar** (2026-07-14): avulsas + recorrentes na mesma tela (`/app/bills`). Rota `/app/recurring` removida.

**Nav mobile com avatar** (2026-07-13): slot "Mais" trocado por avatar com label "Menu". 24 avatares.

**Rebrand**: app renomeado para **Granativa** (grana + ativa). Assets em `public/brand/granativa-*.png`.

## Stack

React 19 (TS strict), Vite, Firebase Web SDK (Auth + Firestore + Storage), Vercel, Vite PWA, React Router, React Hook Form, Zod, Zustand, Lucide React, Recharts. Node >= 22.

## Onde procurar

| Assunto | Arquivo |
|---|---|
| Mapa geral | `docs/BUSCA_RAPIDA.md` |
| Historico por mes | `docs/history/YYYY-MM.md` |
| Design/UI (Sol) | `docs/design/DESIGN.md` |
| Pendencias | `docs/planning/TODOS.md` |
| Testes/QA | `docs/qa/TESTES.md` |
| Arquitetura | `docs/ARCHITECTURE.md` |
| Seguranca/privacidade/operacao | `docs/SECURITY.md`, `docs/PRIVACY.md`, `docs/RUNBOOK.md` |
| WhatsApp | `functions/src/whatsapp/` — `metaClient.ts`, `webhookHandler.ts`, `extractExpense.ts`, `createTransactionFromMessage.ts`, `linkAccount.ts` |
| Grazi (assistente IA) | `docs/ai/GRAZI.md`, `functions/src/ai/financialAssistant.ts` |

## Pontos sensiveis

- Ver `CLAUDE.md` para regras completas (offline-first, firestore.rules, deploy).
- URL canonica do painel Meta WhatsApp: https://developers.facebook.com/apps/1480907564073971/whatsapp-business/
- Secrets do WhatsApp no Firebase: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRANATIVA_WHATSAPP_NUMBER`
- Token permanente gerado via System User no Business Settings da Meta. Se expirar, regerar la.
- `.env.zerou-26757` contem valores dos secrets (nao commitar o token em plaintext em outro lugar).
