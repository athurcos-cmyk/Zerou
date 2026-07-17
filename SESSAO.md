# Brief — Granativa (ex-Zerou)

## Estado atual

SaaS/PWA financeiro mobile-first (React 19 + Firebase Firestore + Vercel). Duas frentes: controle individual e organizacao a dois (casal). App em **lancamento gratuito** — sem cobranca, checkout ou pagina de planos ativa. Projeto Firebase no **Blaze**, produto gratuito, sem Cloud Functions no fluxo principal. Producao: https://granativa.com.br (dominio registro.br, DNS no Cloudflare, deploy Vercel). Trabalho direto na `main`.

**Saldo de conta e total de fatura mantidos incrementalmente** (2026-07-16): `Account.currentBalanceCents` (client, `increment()` no mesmo batch da transação, mesmo padrão de `goals.savedCents`) e os totais de `Invoice` (`outstandingBalanceCents` e cia, Cloud Function `invoiceLedgerEntryTrigger.ts` no ledger) — os dois nunca mais recalculam do zero somando histórico/ledger inteiro. Corrigiu um bug real (Grazi/WhatsApp sempre reportava fatura em aberto como R$ 0,00) e reduziu bastante o custo de leitura (o boot do app não assina mais ledger de fatura nenhum — `useCardsData.ts` só usa os totais já persistidos; ledger detalhado agora é sob demanda via `src/cards/useInvoiceLedger.ts`, só quando Cartão/Fatura/Análise abrem). Compra no cartão excluída passa a gerar `purchase_reversal` no ledger (`reverseCardPurchaseOnDelete.ts`), já que o ledger é imutável. Backfill (`scripts/backfillAccountBalances.mjs`, `scripts/backfillInvoiceTotals.mjs`) já rodado em produção. Detalhes e riscos residuais em `docs/history/2026-07.md`.

**Lição operacional importante** (2026-07-16): essa correção acima ficou commitada por horas sem ir ao ar, porque `git push` **não** reimplanta Cloud Functions — precisa de `firebase deploy` manual (sem CI/CD nesse projeto), e o deploy anterior tinha rodado antes da correção existir. Aviso permanente em `docs/RUNBOOK.md`: toda mudança em `functions/src/` só termina no deploy, não no commit.

**Patrimônio Líquido desativado** (2026-07-16, pedido do dono): removido da navegação (sidebar desktop, menu mobile) e a rota `/app/net-worth` agora redireciona pro dashboard. Código (`NetWorthPage.tsx`, `netWorthCalculations.ts`) mantido intacto de propósito — passo a passo pra religar em `docs/planning/TODOS.md`.

**Objetivo/desafio do onboarding editável + alimenta a Grazi** (2026-07-17): as respostas do cadastro ("qual seu objetivo", "qual desafio") não influenciavam nada e nunca podiam ser mudadas — achado pelo dono. Agora dá pra editar em `/app/settings/onboarding`, e a Grazi (app e WhatsApp, mesmo `buildFinancialContext.ts`) usa a resposta como tempero de tom na seção SEU CICLO. `firestore.rules` (regra `onlyOnboardingAnswersChanged`) e `functions:billing` já deployados e verificados ao vivo em produção. Detalhes em `docs/ai/GRAZI.md`.

**Exclusão de conta: WhatsApp não desvinculava + race condition mandava pro onboarding** (2026-07-17, achado ao vivo pelo dono): dois bugs sem relação um com o outro. (1) Nem a auto-exclusão nem a exclusão via admin (`adminDeleteUser`, já existia — botão em `AdminPage.tsx`) desvinculavam o WhatsApp — corrigido nos dois. (2) `deleteAccountData()` apaga `users/{uid}` antes de excluir o usuário do Auth (ordem deliberada); o `onSnapshot` ao vivo em `AuthContext.tsx` zera o perfil na hora, e o guard de rota mandava a pessoa pro onboarding **no meio da própria exclusão** — corrigido com uma flag transiente (`accountDeletion.store.ts`) que suspende esse redirect. Verificado de ponta a ponta com conta descartável (sem flash de onboarding, WhatsApp simulado desvinculado). `functions:admin:adminDeleteUser` já deployado. Detalhes em `docs/history/2026-07.md`.

**Admin ganha aba WhatsApp: desvincular número, inclusive órfão** (2026-07-17): consequência direta do fix acima — o dono excluiu a própria conta antes da correção existir, e o número dele ficou preso num vínculo órfão (apontando pra conta já excluída), impedindo religar mesmo numa conta nova com o mesmo email. Nova aba no painel Admin (`src/pages/AdminPage.tsx`) lista `whatsappPhoneIndex`, marca "Órfão" quando o dono não existe mais, com botão "Desvincular" (`adminUnlinkWhatsappNumber`, novo, `functions-admin`, Admin SDK). Já deployado (IAM verificada — deploy de criação aplica corretamente, ver lição de 2026-07-09). Dono ainda precisa entrar no painel e usar pra resolver o próprio número. Detalhes em `docs/whatsapp/WHATSAPP.md`.

**Contas a Pagar redesenhada + filtros de Transações consolidados** (2026-07-16): recorrências e compromissos avulsos em seções separadas, edição de recorrência (valor/frequência/categoria) adicionada, testado no celular de verdade (375px) — achou e corrigiu um bug de sobreposição de texto em `.list-row--with-icon` (Dashboard/Transações/Contas a Pagar). Transações: 7 chips soltos consolidados em 4 chips de tipo + botão "Filtros". Conciliação manual ("marcar como conferido") removida — sem uso real. Tag interna `'bill'` renomeada pra `'conta'` (com backfill).

**WhatsApp** (2026-07-15): integracao oficial Meta Cloud API v25.0, **webhook funcionando end-to-end** (mensagem real testada, log `whatsapp_message_received` confirmado). Cloud Functions: `whatsappWebhook` (onRequest, webhook publico) + `generateWhatsappLinkCode` (onCall, vinculo de conta) — codigo em `functions/src/whatsapp/`. Client: pagina de vinculacao `/app/settings/whatsapp` (`src/settings/WhatsAppLinkPage.tsx`), com link no menu mobile e desktop. DeepSeek extrai gastos de mensagens em portugues. Numero real: +55 11 936192757. Phone Number ID: `1262339823619604`. WABA ID: `1431749015518519`. App Meta (URL canonica): https://developers.facebook.com/apps/1480907564073971/whatsapp-business/. Webhook URL: https://southamerica-east1-zerou-26757.cloudfunctions.net/whatsappWebhook — verify token: `granativa-whatsapp-verify-2026`. Token permanente gerado via System User (`business_management` + `whatsapp_business_messaging` + `whatsapp_business_management`). Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRANATIVA_WHATSAPP_NUMBER`. **Causa raiz do #133010/webhook silencioso**: WABA nunca tinha sido inscrita no app (`POST /{WABA_ID}/subscribed_apps` resolveu). **Bug corrigido** (commit `2f04984`): menu mobile nao tinha o link WhatsApp, so a sidebar desktop tinha. **Vinculacao de conta corrigida** (commit `b04cbd0`): faltava indice do Firestore (`whatsappLinkCodes.code`, escopo COLLECTION_GROUP) — `processLinkCode()` falhava silenciosamente, usuario mandava o codigo e nunca recebia resposta. Indice deployado e `READY`. **Paridade com a Grazi** (commit `fc48aa8`): bot agora cria categoria (so por pedido explicito), lanca despesa e receita, e responde perguntas financeiras (mesma persona/dados da Grazi do app, rate limit compartilhado). **Vinculo unico + desvincular**: so um numero ativo por workspace, com botao "Desvincular" em Configuracoes > WhatsApp (fechou gap de compliance ja prometido nos Termos/Data Deletion). **Compra no cartao** (a vista ou parcelada, "gastei 300 no cartao em 3x"): porta `cardService.createCardPurchase()` pro Admin SDK; se houver mais de um cartao ativo, o bot pergunta qual usar (lista numerada, TTL 3min) via `whatsappPendingActions/{phone}` — resposta que nao bate com nenhum cartao descarta a pergunta sem travar o bot. Fora do escopo de proposito: parcela ja em andamento, antecipar parcela/fatura, renegociar (direciona pro app). **Editar/excluir lançamento já feito** (intent `unsupported_action`, 2026-07-16): reconhecido e respondido com orientação pra usar o app, em vez de "não entendi" genérico. **Incidente 2026-07-16/17 — conta de desenvolvedor Meta bloqueada** ("atividade incomum", não é bug de código): WhatsApp parou de responder por ~12h (mensagens não chegavam nem no numero já vinculado), token retornava `"API access blocked"` em qualquer endpoint da Graph API. Resolvido pelo dono confirmando identidade no painel da Meta; nada precisou mudar em `subscribed_apps` ou config. Roteiro de diagnóstico ("WhatsApp parou de funcionar") em `docs/RUNBOOK.md`; detalhe completo em `docs/whatsapp/WHATSAPP.md`. Ver historico completo em `docs/whatsapp/WHATSAPP.md`.

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
| WhatsApp | `functions/src/whatsapp/` — `metaClient.ts`, `webhookHandler.ts`, `interpretMessage.ts`, `createTransactionFromMessage.ts`, `createCardPurchaseFromMessage.ts`, `linkAccount.ts`, `unlinkWhatsapp.ts` |
| Grazi (assistente IA) | `docs/ai/GRAZI.md`, `functions/src/ai/financialAssistant.ts` |

## Pontos sensiveis

- Ver `CLAUDE.md` para regras completas (offline-first, firestore.rules, deploy).
- URL canonica do painel Meta WhatsApp: https://developers.facebook.com/apps/1480907564073971/whatsapp-business/
- Secrets do WhatsApp no Firebase: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRANATIVA_WHATSAPP_NUMBER`
- Token permanente gerado via System User no Business Settings da Meta. Se expirar, regerar la.
- `.env.zerou-26757` contem valores dos secrets (nao commitar o token em plaintext em outro lugar).
