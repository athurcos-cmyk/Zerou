# WhatsApp — Bot de lancamentos via Meta Cloud API

> **Regra permanente**: toda mudanca no WhatsApp (webhook, token, numero, fluxo, secrets, UI, permissoes, correcao de bug) **precisa ser registrada neste documento**. O historico mensal (`docs/history/`) e o `CHANGELOG.md` recebem so o resumo + link pra ca.

## Visao geral

Integracao oficial com a Meta Cloud API v25.0 para controle financeiro completo por mensagem de WhatsApp — paridade com a Grazi do app, e mais. O usuario vincula seu numero e pode: lancar despesa ("gastei 15 reais no mercado"), lancar receita ("recebi 200 de freela"), transferir entre contas ("transfere 100 do nubank pro itau"), lancar compra no cartao a vista ou parcelada ("gastei 300 no cartao em 3x"), criar categoria sob pedido explicito ("cria uma categoria chamada Pet") e fazer perguntas financeiras ("quanto gastei esse mes?", igual a Grazi do app). Uma unica chamada DeepSeek classifica a intencao da mensagem e ja extrai os dados (`interpretMessage.ts`).

**Editar/excluir algo ja lancado nao e suportado** (intent `unsupported_action`, 2026-07-16): pedidos como "exclui essa transacao", "apaga o gasto de mercado", "corrige o valor" sao reconhecidos e respondidos com orientacao pra fazer pelo app — em vez de cair no "nao entendi" generico ou, pior, ser silenciosamente ignorado.

**Cartao**: cobre so compra nova (a vista ou parcelada). Se o usuario tem mais de um cartao ativo, o bot pergunta qual usar (lista numerada) e espera a resposta por ate 3 minutos antes de descartar. Pedidos mais avancados — parcela que ja estava em andamento antes de usar o WhatsApp, antecipar parcela/fatura, renegociar — sao redirecionados pro app, nao executados pelo bot.

**Conta (despesa/receita/transferencia)** (2026-07-18): quando o workspace tem mais de uma conta ativa, o bot precisa saber qual debitar/creditar. Resolucao em 3 niveis, igual pro debito/credito de uma despesa/receita e pra cada lado (origem/destino) de uma transferencia:
1. **Nome citado na mensagem** ("gastei 30 no mercado itau", "transfere 50 do nubank pra poupanca") — `interpretMessage.ts` recebe a lista de contas do workspace e casa por nome/apelido (acentos e caixa sao normalizados).
2. **Conta principal** — se nenhuma conta foi citada, cai pra conta marcada como principal em Configuracoes > Contas (`Account.isPrimary`, no maximo uma por workspace, ver `src/pages/AccountsPage.tsx`).
3. **Pergunta** — se ainda restar ambiguidade (sem conta principal marcada e 2+ contas ativas), o bot pergunta, mesmo padrao do cartao (lista numerada, TTL 3min). Transferencia com os dois lados ambiguos pede os dois numeros numa tacada so ("responda tipo '1 2'"); com um lado so ambiguo, pergunta so esse lado. Logica pura em `functions/src/whatsapp/accountResolution.ts` (testada, `accountResolution.test.ts`).

Transferencia exige pelo menos 2 contas ativas cadastradas; com 0 ou 1 conta, o bot explica que precisa cadastrar outra primeiro em vez de tentar.

**Decisao financeira grande (emprestimo, financiamento, renegociar divida, cartao novo/anuidade) e QUALQUER pergunta de investimento** (intent `advisory_decision`, 2026-07-18, criterio de investimento ampliado no mesmo dia): o bot NAO tenta aconselhar — redireciona pro app. Motivo: a Grazi do app agora ajuda a pessoa a pensar em decisao de emprestimo/cartao (pergunta de volta usando os dados reais dela, ver `docs/ai/GRAZI.md` regra 10) e trata investimento com rigor redirecionando pra profissional (regra 11) — os dois exigem mais profundidade do que uma mensagem isolada de WhatsApp permite (sem historico de conversa, `answerFinancialQuestion.ts` nao recebe `history` nenhum, diferente do app que manda as ultimas mensagens a cada chamada). Decisao deliberada do dono: **nao levar esse comportamento pro WhatsApp** — aqui o foco continua sendo lancamento e pergunta rapida do dia a dia (`question` continua respondida direto). Rede de seguranca: `answerFinancialQuestion.ts` tambem ganhou instrucao pra redirecionar em vez de analisar, caso alguma mensagem escape da classificacao. Regra de nunca nomear banco/cartao/investimento especifico (mesmo se pedirem direto) tambem foi espelhada aqui. Diferente de `question` (consulta de dado tipo "quanto gastei") — so decisoes grandes/dificeis de desfazer e pergunta de investimento contam como `advisory_decision`.

**Importante**: a Grazi do app (`financialAssistantChat`) e so leitura/conversa — nunca cria dados. O bot do WhatsApp faz mais que ela: alem de responder perguntas (reusando o mesmo contexto e persona), tambem cria categorias e lanca transacoes.

**Nome no WhatsApp**: Grazi (a assistente de IA do Granativa)

**Numero do bot**: +55 11 936192757

**Fluxo**: mensagem do usuario → Meta Cloud API → webhook `whatsappWebhook` → DeepSeek extrai gasto → Admin SDK grava transacao no Firestore → bot responde confirmando

## URLs e IDs importantes

| Recurso | Valor |
|---|---|
| **Painel Meta (URL canonica)** | https://developers.facebook.com/apps/1480907564073971/whatsapp-business/ |
| **App Meta ID** | 1480907564073971 |
| **WABA ID** | 1431749015518519 |
| **Phone Number ID (producao)** | 1262339823619604 |
| **Phone Number ID (teste — obsoleto)** | 1231264580067541 |
| **Numero de teste Meta (obsoleto)** | +1 555 170 3901 |
| **Numero real** | +55 11 936192757 |
| **Webhook URL (cloudfunctions.net)** | https://southamerica-east1-zerou-26757.cloudfunctions.net/whatsappWebhook |
| **Webhook URL (Cloud Run)** | https://whatsappwebhook-rlmjm5dvwq-rj.a.run.app |
| **Verify token** | `granativa-whatsapp-verify-2026` |
| **API Base** | `https://graph.facebook.com/v25.0` |

## Arquivos

| Arquivo | Funcao |
|---|---|
| `functions/src/whatsapp/metaClient.ts` | Cliente HTTP para Meta Cloud API v25.0. Envia mensagens (`sendWhatsAppMessage`), define secrets (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRANATIVA_WHATSAPP_NUMBER`). |
| `functions/src/whatsapp/webhookHandler.ts` | Cloud Function `onRequest`. GET: verificacao de webhook. POST: le a mensagem, resolve `vincular XXXXXX` via regex (`processLinkCode`) ou chama `interpretMessage` (com a lista de contas ativas) e roteia por intencao: `create_category` → `createCategoryFromMessage`; `question` → `answerFinancialQuestion`; `expense`/`income`/`transfer` → resolve a conta via `accountResolution.ts` (nome citado → principal → pergunta) e chama `createTransactionFromMessage`; `advanced_card_action`/`unsupported_action`/`advisory_decision` → mensagem redirecionando pro app; `unclear` → mensagem de ajuda com exemplos. |
| `functions/src/whatsapp/interpretMessage.ts` | Uma chamada DeepSeek (JSON mode) classifica a mensagem em `expense`/`income`/`transfer`/`card_purchase`/`advanced_card_action`/`unsupported_action`/`create_category`/`question`/`advisory_decision`/`unclear` e ja extrai valor, descricao, categoria (a mais especifica entre as existentes), dados de categoria nova e conta(s) citada(s) (`accountId`, ou `sourceAccountId`/`destinationAccountId` pra transfer), tudo numa chamada so. Recebe a lista de contas ativas do workspace (id: nome) junto com a de categorias. Substitui o antigo `extractExpense.ts` (so cobria despesa). |
| `functions/src/whatsapp/accountResolution.ts` (2026-07-18) | Logica pura de resolucao de conta: `resolveDebitCreditAccount` (despesa/receita) e `resolveTransferSide` (cada lado de uma transferencia, excluindo a conta ja resolvida do outro lado) — prioridade nome citado → conta principal (`Account.isPrimary`) → conta unica → null (ambiguo, bot pergunta). `accountCandidates` monta a lista numerada. Testado (`accountResolution.test.ts`). |
| `functions/src/whatsapp/createCategoryFromMessage.ts` | Cria categoria via Admin SDK. Dois gatilhos: (1) pedido avulso explicito ("cria uma categoria X", intent `create_category`, sem transacao); (2) categoria nomeada explicitamente DENTRO de um lancamento que ainda nao existe ("gastei 50 no mercado, coloca na categoria trabalho" — cria "Trabalho" e ja usa nesse mesmo lancamento). Dedupe por nome (case-insensitive), icone validado contra `categoryPalette.ts` (fallback `sliders`), cor escolhida por rotacao na paleta Sol — nunca inventada pela IA. Payload identico a `financeService.createCategory()`. |
| `functions/src/whatsapp/categoryPalette.ts` | Espelha `src/components/categoryIcons.tsx` e `src/theme/palette.ts` (Cloud Functions nao importa `src/` do app cliente — pacotes separados). Mantenha em sincronia manualmente. |
| `functions/src/whatsapp/answerFinancialQuestion.ts` | Perguntas financeiras via WhatsApp — reusa `buildFinancialContext` + a mesma persona/regras da Grazi (`financialAssistant.ts`), com o negrito adaptado pro WhatsApp (`*um asterisco*`, nao `**dois**`). Rate limit compartilhado com a Grazi do app (`aiRateLimit.ts`, mesmo contador `workspaces/{id}/aiUsage/{data}`, 60/dia). |
| `functions/src/whatsapp/messageFormat.ts` (2026-07-22) | Templates das mensagens de saida do bot — confirmacoes de lancamento e prompts de escolha (cartao/conta/transferencia). Logica pura, sem Firestore, testada isoladamente (`messageFormat.test.ts`, mesmo padrao de `accountResolution.ts`). Fixa a convencao de emoji do bot inteiro: 💸 despesa · 💰 receita · 🔄 transferencia · 💳 cartao · 🏷️ categoria · 🏦 conta/banco. Nao mexer na paleta de emoji num arquivo isolado — sempre editar aqui pra nao divergir. |
| `functions/src/whatsapp/createTransactionFromMessage.ts` | Cria transacao no Firestore via Admin SDK (bypassa regras) — despesa, receita ou transferencia (`type` recebido, nao mais fixo em `'expense'`; `destinationAccountId` obrigatorio quando `type === 'transfer'`, categoria nunca gravada nesse caso). Mantenha em sincronia com `src/finance/financeService.ts:createTransaction()`. |
| `functions/src/whatsapp/createCardPurchaseFromMessage.ts` | Cria compra no cartao (a vista ou parcelada) via Admin SDK — porta `cardService.createCardPurchase()`: divide o total em parcelas, grava um `ledger` entry por parcela nas faturas certas (criando as que faltarem) e um doc de transacao `type:'card_purchase'`. Mantenha em sincronia com `src/cards/cardService.ts:createCardPurchase()`. |
| `functions/src/cards/cardDates.ts` | Porta de `src/cards/cardDates.ts` (`resolveInstallmentCycle`, `invoiceIdFor`) — Cloud Functions nao importa `src/` do app, mantenha em sincronia manualmente. |
| `functions/src/whatsapp/pendingAction.ts` (generalizado 2026-07-18, era `pendingCardAction.ts`) | Pergunta pendente do bot — doc unico por telefone em `whatsappPendingActions/{phone}`, TTL 3 min, discriminado por `kind`: `card_purchase` (qual cartao), `debit_credit` (qual conta, despesa/receita) ou `transfer` (origem e/ou destino de uma transferencia, campo `missing` indica qual lado falta). `resolveSingleSelection` aceita numero da lista ou nome/apelido (acento-insensivel); `resolveDualSelection` aceita dois numeros ("1 2", "1-2", "1,2") pra quando os dois lados de uma transferencia estao em aberto. Se a proxima mensagem nao resolver, a pendencia e descartada e a mensagem e tratada normalmente (bot nunca trava esperando resposta). Testado (`pendingAction.test.ts`). |
| `functions/src/whatsapp/linkAccount.ts` | `generateWhatsappLinkCode` (onCall): bloqueia se o workspace ja tiver um numero vinculado (`already-exists`), limpa codigos antigos nao usados do mesmo usuario, gera codigo 6 digitos em `users/{uid}/whatsappLinkCodes/{code}`, retorna link `wa.me`. `processLinkCode`: chamado pelo webhook quando usuario manda "vincular XXXXXX", grava vinculo em `whatsappPhoneIndex/{phone}` e `workspaces/{id}/whatsappLinks/{phone}`. |
| `functions/src/whatsapp/unlinkWhatsapp.ts` | `unlinkWhatsapp` (onCall): apaga `whatsappPhoneIndex/{phone}` + `workspaces/{id}/whatsappLinks/{phone}`, varre codigos residuais, avisa o numero desvinculado via WhatsApp (best-effort). Fecha o vinculo ja prometido em `src/pages/LegalPages.tsx` (Termos §7.4, Data Deletion). Reusado por `accountDeletionService.ts` (auto-exclusao de conta, 2026-07-17). |
| `functions-admin/src/index.ts` (`adminUnlinkWhatsappNumber`) | Desvincula qualquer numero pelo painel Admin, inclusive orfao (workspace/usuario ja excluido) — Admin SDK, apaga direto, nao depende do workspace existir. Codebase separado (`admin`), deploy: `npx firebase deploy --only functions:admin:adminUnlinkWhatsappNumber`. |
| `functions/src/ai/deepseekClient.ts` | Cliente HTTP compartilhado para API DeepSeek. Usado por `interpretMessage.ts`, `answerFinancialQuestion.ts` e pela Grazi (`financialAssistant.ts`). |
| `functions/src/ai/aiRateLimit.ts` | Rate limit de IA (60 msgs/dia por workspace, `workspaces/{id}/aiUsage/{data BRT}`) — extraido de `financialAssistant.ts`, compartilhado entre Grazi do app e perguntas via WhatsApp. |
| `src/settings/WhatsAppLinkPage.tsx` | UI de vinculacao. Le `workspaces/{id}/whatsappLinks` no mount pra mostrar "Vinculado: `<numero>`" + botao Desvincular (via `unlinkWhatsapp`), ou o fluxo de gerar codigo se ainda nao vinculado. |
| `src/App.tsx` | Rota `/app/settings/whatsapp`. |
| `src/layout/AppShell.tsx` | Link "WhatsApp" (icone `MessageCircle`) na sidebar desktop e na grade principal do menu mobile (logo apos Analise). |
| `functions/src/index.ts` | Export `whatsappWebhook`, `generateWhatsappLinkCode`, `unlinkWhatsapp`. |
| `firestore.rules` | Regras para `whatsappLinkCodes/{code}` (read: self, write: false) e `whatsappPhoneIndex/{phone}` (read: auth, write: false). `workspaces/{id}/whatsappLinks/{phone}` nao tem regra propria mas e coberta pelo catch-all `match /{document=**}` do workspace (read: membro ativo) — cliente ja pode ler sem mudanca de regra. |

## Fluxo completo

### Vinculacao do WhatsApp

```
1. Client: WhatsAppLinkPage → httpsCallable('generateWhatsappLinkCode', { workspaceId })
2. Server: valida auth + membership → gera codigo 6 digitos
3. Server: salva users/{uid}/whatsappLinkCodes/{code} com TTL 10min
4. Server: retorna { code, expiresInMinutes: 10, waLink }
5. Client: exibe codigo e link wa.me
6. Usuario: envia "vincular 123456" para o bot pelo WhatsApp
7. Meta: POST no webhook com a mensagem
8. webhookHandler: detecta regex /vincular \d{6}/ → processLinkCode()
9. processLinkCode: busca codigo via collectionGroup, valida TTL
10. processLinkCode: grava whatsappPhoneIndex/{phone} + workspaces/{id}/whatsappLinks/{phone}
11. processLinkCode: deleta codigo usado, envia confirmacao via sendWhatsAppMessage()
```

### Mensagem financeira (despesa, receita, transferencia, categoria, pergunta)

```
1. Usuario: envia qualquer mensagem financeira pelo WhatsApp (nao "vincular XXXXXX")
2. Meta: POST no webhook com a mensagem
3. webhookHandler: valida X-Hub-Signature-256 (se WHATSAPP_APP_SECRET configurado)
4. webhookHandler: responde 200 imediatamente (Meta espera resposta rapida)
5. webhookHandler: parseia body → object=whatsapp_business_account → entry[0].changes[0].value.messages[0]
6. webhookHandler: extrai phone (msg.from) e text (msg.text.body)
7. webhookHandler: consulta whatsappPhoneIndex/{phone} → workspaceId + linkedByUid
8. webhookHandler: ha pendencia (getPendingAction)? resolve a resposta contra os candidatos
   guardados (card_purchase/debit_credit/transfer) e ja cria o lancamento, sem gastar
   chamada DeepSeek nova — se nao resolver, descarta a pendencia e segue pro passo 9
9. webhookHandler: carrega categorias ativas (sem filtro de tipo) e contas ativas (id+nome+isPrimary)
10. webhookHandler: interpretMessage(texto, categorias, contas) → DeepSeek, uma chamada, retorna intent + dados
11. Roteamento por intent:
    - create_category: createCategoryFromMessage() → confirma criacao (ou dedupe)
    - question: checkAiUsageNotExceeded() → answerFinancialQuestion() → incrementAiUsage()
    - expense/income: resolveDebitCreditAccount (nome citado → principal → unica → pergunta) → createTransactionFromMessage({ type, ... })
    - transfer: resolveTransferSide pros dois lados (excluindo o lado ja resolvido) → createTransactionFromMessage({ type: 'transfer', destinationAccountId, ... }) ou pergunta o(s) lado(s) que faltar
    - advisory_decision: redireciona pro app (sem chamar DeepSeek de novo) — decisao grande precisa de ida-e-volta que o WhatsApp nao oferece
    - unclear: mensagem de ajuda explicando o que o bot faz
12. webhookHandler: sendWhatsAppMessage(phone, confirmacao/resposta formatada)
```

### Envio de mensagem (outbound)

```
1. sendWhatsAppMessage(phoneNumber, text)
2. POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages
3. Headers: Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
4. Body: { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }
```

## Configuracao

### Secrets (Firebase)

| Secret | Descricao | Como configurar |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token permanente (System User) | `npx firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do numero no Meta | `npx firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID` |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificacao do webhook | `npx firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN` |
| `GRANATIVA_WHATSAPP_NUMBER` | Numero do bot (E.164) | `npx firebase functions:secrets:set GRANATIVA_WHATSAPP_NUMBER` |

### Permissoes do token (System User)

O token permanente foi gerado via System User no [Business Settings](https://business.facebook.com/latest/settings) com estas permissoes:

- `business_management`
- `whatsapp_business_messaging`
- `whatsapp_business_management`
- `manage_app_solution`
- `whatsapp_business_manage_events`

**Se o token expirar**: voltar em Business Settings → System Users → Granativa API → Generate token → mesmo conjunto de permissoes → atualizar secret `WHATSAPP_ACCESS_TOKEN` → redeploy.

### Webhook (painel Meta)

Configurado em: WhatsApp > Configuration (dentro do app Meta)

- **Callback URL**: `https://southamerica-east1-zerou-26757.cloudfunctions.net/whatsappWebhook`
- **Verify token**: `granativa-whatsapp-verify-2026`
- **Webhook fields subscribed**: `messages`

**Se parar de receber mensagens**: verificar se o webhook continua verificado e se `messages` esta Subscribed. Apos publicar o app, a configuracao pode resetar.

### .env local (`functions/.env.zerou-26757`)

Necessario para deploy. Contem copias dos valores dos secrets. NAO commitar tokens em plaintext fora deste arquivo (ele ja e tracked, cuidado).

### Regras do Firestore (`firestore.rules`)

```
match /users/{uid}/whatsappLinkCodes/{code} {
  allow read: if isSelf(uid);
  allow write: if false; // Admin SDK only
}

match /whatsappPhoneIndex/{phone} {
  allow read: if request.auth != null;
  allow write: if false; // Admin SDK only
}
```

A subcolecao `workspaces/{id}/whatsappLinks/{phone}` e escrita via Admin SDK (sem regra necessaria).

## Colecoes no Firestore

| Colecao | Proposito | Escrita por |
|---|---|---|
| `users/{uid}/whatsappLinkCodes/{code}` | Codigo de vinculo temporario (TTL 10min) | `generateWhatsappLinkCode` (onCall) |
| `whatsappPhoneIndex/{phone}` | Indice phone → workspaceId + uid | `processLinkCode` (webhook), apagado por `deleteAccountData`/`adminDeleteUser`/`adminUnlinkWhatsappNumber` |
| `workspaces/{id}/whatsappLinks/{phone}` | Registro de vinculo no workspace | `processLinkCode` (webhook), apagado por `deleteAccountData`/`adminDeleteUser`/`adminUnlinkWhatsappNumber` |
| `whatsappPendingActions/{phone}` | Pergunta pendente do bot — cartao, conta de debito/credito ou lado(s) de uma transferencia (`kind`, TTL 3min). Nunca lida/escrita pelo cliente. | `setPendingAction`/`getPendingAction`/`clearPendingAction` (webhook, `pendingAction.ts`) |
| `workspaces/{id}/accounts/{accountId}.isPrimary` | Conta principal (no maximo uma por workspace) — fallback de conta quando a mensagem nao identifica qual usar. Campo no doc de conta existente, nao uma colecao propria. | `setPrimaryAccount`/`unsetPrimaryAccount` (`src/finance/financeService.ts`), UI em `src/pages/AccountsPage.tsx` |

## Parametros ajustaveis (codigo)

| Parametro | Local | Valor | Nota |
|---|---|---|---|
| API version | `metaClient.ts:9` | `v25.0` | Atualizar conforme depreciacao da Meta |
| Tempo de expiracao do codigo | `linkAccount.ts:7` | 10 min | `CODE_TTL_MINUTES` |
| maxInstances (webhook) | `webhookHandler.ts:25` | 10 | Cloud Run |
| maxInstances (linkAccount) | `linkAccount.ts:14` | 5 | Cloud Run |
| Regiao | ambos | `southamerica-east1` | Proximidade com SP |
| Timeout DeepSeek (extracao) | `deepseekClient.ts:7` | 45s | Compartilhado com Grazi |
| Modelo DeepSeek | `deepseekClient.ts:25` | `deepseek-chat` | JSON mode para extracao |
| Temperatura | `deepseekClient.ts:41` | 0.3 | Baixa = mais deterministica |
| Confianca minima | `extractExpense.ts:69` | `confidence !== 'low' && amountCents > 0` | Recusa extracao incerta |

## Modelo de precificacao Meta

- **Modelo**: per-message pricing (desde julho 2025)
- **Janela de atendimento (CSW)**: 24h apos cada mensagem do usuario
- **Mensagens dentro da CSW**: GRATIS (texto, imagem, etc.)
- **Mensagens template (marketing/utility/auth)**: cobradas por entrega
- **Custo para o Granativa**: essencialmente zero — o bot so responde dentro da CSW, nunca envia templates de marketing
- **Faturamento**: BRL desde julho 2026

## Deploy

**Conta principal + transferencia deployadas em produção em 2026-07-18** (`firestore.rules` e `whatsappWebhook`, autorizado pelo dono) — verificado ao vivo: marcar conta principal em Configuracoes > Contas persiste de verdade (sobrevive a reload) sem `permission-denied`.

```bash
# Regra do Firestore (so regras — nao toca billing/functions/hosting)
npx firebase deploy --only firestore:rules --project zerou-26757

# Deploy das funcoes WhatsApp (inclui unlinkWhatsapp e financialAssistantChat quando o
# rate limit compartilhado ou o aiRateLimit.ts mudar)
npx firebase deploy --only functions:billing:whatsappWebhook,functions:billing:generateWhatsappLinkCode,functions:billing:unlinkWhatsapp,functions:billing:financialAssistantChat --project zerou-26757

# OBRIGATORIO apos todo deploy do whatsappWebhook — Firebase reseta essa flag do Cloud Run
gcloud run services update whatsappwebhook --region=southamerica-east1 --no-cpu-throttling --project=zerou-26757

# Atualizar secrets
printf "VALOR" | npx firebase functions:secrets:set SECRET_NAME --project zerou-26757 --data-file -

# Ver logs
npx firebase functions:log --project zerou-26757
```

## Troubleshooting

### "Este numero ja esta vinculado a uma conta Granativa" numa conta que voce sabe que nao tem vinculo

`processLinkCode` (`linkAccount.ts`) so checa `whatsappPhoneIndex/{phone}.exists()` — nao verifica se o `workspaceId`/`linkedByUid` apontado la dentro ainda existe de verdade. Se a conta dona do vinculo foi excluida ANTES da correcao de 2026-07-17 (quando `deleteAccountData`/`adminDeleteUser` passaram a limpar isso), o indice fica orfao pra sempre e trava qualquer tentativa de vincular esse numero de novo, mesmo numa conta nova com o mesmo email/Google.

**Diagnostico**: confirmar que o `workspaceId` do `whatsappPhoneIndex/{phone}` aponta pra um workspace/usuario que nao existe mais (`GET users/{uid}` retorna 404).

**Correcao**: painel Admin > aba **WhatsApp** > botao "Desvincular" na linha do numero (aparece marcado "Orfao" quando o dono nao e mais encontrado). Usa `adminUnlinkWhatsappNumber` (Admin SDK, apaga `whatsappPhoneIndex` + `workspaces/{id}/whatsappLinks` direto, funciona mesmo com o workspace ja excluido). Depois disso a pessoa consegue gerar um codigo novo e vincular normalmente.

### Conta de desenvolvedor Meta bloqueada ("API access blocked")

Diferente de todos os outros problemas de webhook listados abaixo (config, indice, WABA nao inscrita) — esse e um bloqueio da propria Meta na conta de desenvolvedor, nao um bug no codigo. Sintomas:

- Mensagens param de chegar (sem `whatsapp_message_received` nos logs) **mesmo num numero que ja estava vinculado e funcionando ha dias**.
- `curl` em QUALQUER endpoint da Graph API com o token — ate o mais basico, `GET /me` — retorna `{"error":{"message":"API access blocked.","type":"OAuthException","code":200}}`.
- No painel (`developers.facebook.com`), aparece um banner "Confirmacao da conta necessaria — Detectamos atividade incomum nesta conta de desenvolvedor."

**Diagnostico rapido** (confirma que e isso e nao outra causa):
```bash
curl -s "https://graph.facebook.com/v25.0/me?access_token=$WHATSAPP_ACCESS_TOKEN"
# Se voltar "API access blocked", e isso. Se voltar {"name":"Granativa API","id":"..."}, o acesso esta OK.
```

**Causa**: sistema automatico de deteccao de fraude/abuso da Meta, generico pra qualquer conta de desenvolvedor — nao especifico do WhatsApp. Reage a padroes de uso que destoam do normal. O gatilho de 2026-07-16 provavelmente foi a combinacao de: varios deploys de Cloud Functions em sequencia + testes manuais rapidos e repetidos pelo dono (varias mensagens seguidas, deletar/recriar categorias) + uma conta nova de um amigo testando ao mesmo tempo de outro numero/IP + as proprias chamadas de diagnostico do agente direto na Graph API. Nada disso e "errado" — e simplesmente incomum pra um app com pouquissimo uso organico ainda, que nao tem volume "normal" suficiente pra servir de camuflagem.

**Resolucao**: e inteiramente do lado da Meta — nao ha nada pra corrigir no codigo. O dono precisa:
1. Entrar em `developers.facebook.com`, ver o banner de confirmacao de conta.
2. Completar a verificacao pedida (no incidente de 2026-07-16, foi confirmar email + codigo SMS).
3. Aguardar — a pagina de confirmacao avisa que pode levar alguns minutos ("Please wait... may take longer"). Evitar recarregar/testar agressivamente enquanto isso, pode parecer mais atividade incomum.
4. Confirmar reestabelecimento com o mesmo curl acima antes de considerar resolvido.

**Nao precisa reinscrever a WABA depois** — diferente do incidente de 2026-07-15 (`subscribed_apps` vazio), esse bloqueio nao derruba a inscricao; assim que o acesso volta, tudo funciona de novo sem nenhum passo extra (confirmado: webhook recebeu e respondeu normalmente na sequencia, incluindo um vinculo NOVO de outro numero, sem tocar em `subscribed_apps`).

**Se acontecer nesse projeto de novo**: nao e algo pra "consertar" preventivamente no codigo — e um risco inerente de depender da plataforma da Meta. Ver conversa sobre alternativa (PWA proprio de chat com a Grazi, sem depender da Meta) em `docs/history/2026-07.md` — ainda nao decidido, ideia registrada pra o futuro.

### Mensagens nao chegam (webhook silencioso)

0. **Primeiro de tudo**: `curl -H "Authorization: Bearer $TOKEN" "https://graph.facebook.com/v25.0/{WABA_ID}/subscribed_apps"`. Se vier `{"data":[]}`, a WABA nao esta inscrita no app — `POST` no mesmo endpoint resolve (`{"success":true}`). Isso e separado da config de webhook e nao aparece em lugar nenhum do painel; foi a causa real do incidente de 2026-07-15 mesmo com Callback URL, verify token e `messages` Subscribed todos corretos.
1. Verificar se webhook URL e verify token estao configurados em WhatsApp > Configuration
2. Verificar se `messages` esta **Subscribed**
3. Testar webhook manualmente: `curl "https://southamerica-east1-zerou-26757.cloudfunctions.net/whatsappWebhook?hub.mode=subscribe&hub.verify_token=granativa-whatsapp-verify-2026&hub.challenge=test123"`
4. Verificar logs: `npx firebase functions:log --project zerou-26757`
5. **Causa comum:** validacao de assinatura HMAC com secret errado. O codigo atualmente tem a validacao DESATIVADA. Nao reativar sem configurar `WHATSAPP_APP_SECRET` com o valor correto do painel Meta.
6. **Outra causa:** webhook pode precisar ser reconfigurado apos adicionar novo numero. Ir em WhatsApp > Configuration e re-submeter Callback URL + Verify token.

### Erro #133010 "Account not registered"

O numero de telefone nao esta registrado na Cloud API. Solucao:

1. **Registrar via API:** `POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/register` com body `{"messaging_product":"whatsapp","pin":"123456"}`
2. Se falhar, verificar Business Verification pendente
3. O numero NAO pode estar registrado no WhatsApp Messenger/Business do celular

### Erro #100 "Invalid parameter" ao enviar mensagem

- Verificar se o numero de destino esta no formato E.164 correto (ex: `5511991492708`)
- Pode ser necessario o destinatario mandar a primeira mensagem pro bot para abrir a janela de 24h (CSW)
- Primeira mensagem do bot para um usuario so pode ser template; mensagens de texto livre so funcionam dentro da CSW

### Token expirado

Gerar novo token em Business Settings > System Users > Granativa API > Generate token. Atualizar secret `WHATSAPP_ACCESS_TOKEN`.

### Numero aparece como "unregistered" no painel

Chamar `POST /{PHONE_NUMBER_ID}/register` via API. Se retornar `{"success":true}`, o numero esta registrado.

### Validacao de assinatura HMAC (X-Hub-Signature-256)

Atualmente DESATIVADA (comentada em `webhookHandler.ts`). Para reativar:
1. Obter o App Secret em Meta App Settings > Basic > App Secret
2. Criar secret `WHATSAPP_APP_SECRET` no Firebase
3. Adicionar `defineString('WHATSAPP_APP_SECRET')` em `metaClient.ts`
4. Descomentar o bloco de validacao em `webhookHandler.ts` trocando `whatsappAccessToken.value()` por `whatsappAppSecret.value()`

### DeepSeek falhando na extracao

Verificar logs do webhook. Erros 429/503 tem retry automatico. Outros erros resultam em mensagem "Nao consegui entender o valor" para o usuario.

## Historico

### 2026-07-22 — Mensagens do bot redesenhadas: emoji coerente, negrito, listas mais claras

- **Pedido do dono**: "quero deixar as mensagens mais bonitas e coerentes, formatação emoji tals, de sugestoes" — antes cada confirmacao/prompt tinha um estilo diferente (`✅ Compra registrada`, `✅ Registrado`, `💰 Receita registrada`, `🔄 Transferência registrada` todos com pontuacao/emoji inconsistentes; listas numeradas em texto plano sem hierarquia visual).
- **Novo arquivo `messageFormat.ts`**: centraliza os templates de saida — `confirmExpense`/`confirmIncome`/`confirmTransfer`/`confirmCardPurchase`/`categoryCreatedMessage`/`categoryAlreadyExistsMessage`/`pendingChoicePrompt`. Convencao de emoji fixada num lugar so (ver tabela de arquivos acima) em vez de espalhada por `webhookHandler.ts`/`linkAccount.ts`/`unlinkWhatsapp.ts` como antes.
- **Confirmacoes de despesa/receita agora mostram categoria E conta** numa segunda linha (`🏷️ Alimentação · 🏦 Nubank`) quando disponiveis — antes so a categoria aparecia (entre parenteses), o nome da conta usada nunca era confirmado pro usuario.
- **Confirmacao de transferencia mostra a rota** (`🏦 Nubank → Itaú`) quando os dois nomes de conta estao disponiveis sem leitura extra: sempre no fluxo direto (contas ja carregadas) e no fluxo de pendencia quando os dois lados estavam entre os candidatos apresentados (`missing: 'both'`). Nos dois outros casos (so um lado era ambiguo) a rota fica de fora pra nao gastar uma leitura extra so pra isso — a descricao continua aparecendo.
- **Prompts de escolha (cartao/conta/transferencia)** ganharam formato unico via `pendingChoicePrompt`: emoji + pergunta em `*negrito*`, lista numerada, instrucao em `_itálico_` — os tres fluxos (cartao, debito/credito, transferencia) usavam textos levemente diferentes antes.
- **Mensagem de "não entendi"** virou lista com emoji por capacidade (💸 gasto, 💰 receita, 💳 cartao, 🔄 transferencia, 🏷️ categoria, ❓ pergunta) em vez de bullets `- ` sem hierarquia.
- **Mensagens de erro/limite/redirecionamento** (vinculo ausente/inativo, limite diario de lancamentos/perguntas, valor nao entendido, sem conta/cartao cadastrado, acao avancada, acao nao suportada, decisao grande) ganharam emoji consistente por categoria (🔗 vinculo, ⏳ limite, 🤔 nao entendi, 🏦 conta, 💳 cartao, 🧭 redirecionar, ✋ nao suportado, 🧠 decisao grande) — antes eram so texto plano.
- **`linkAccount.ts`/`unlinkWhatsapp.ts`**: mensagens de vinculo/desvinculo (codigo nao encontrado/expirado, ja vinculado, sucesso) tambem alinhadas ao mesmo padrao.
- **Nenhuma mudanca de logica** — so como as mensagens sao construidas. `formatBRL` foi movido de `webhookHandler.ts` pra `messageFormat.ts` (mesma implementacao).
- **Testes**: `messageFormat.test.ts` novo (10 casos: formatacao de valor, presenca/ausencia de linha de detalhe, rota de transferencia condicional, singular/plural de parcela, lista numerada, prompt de escolha). Suite de functions foi de 87 pra 97 testes. `npm --prefix functions run build`/`test` limpos.
- **Deployado no mesmo dia** (`whatsappWebhook`, `generateWhatsappLinkCode`, `unlinkWhatsapp`, autorizado pelo dono) + `gcloud run services update --no-cpu-throttling` obrigatorio pos-deploy.

### 2026-07-18 — Grazi passa a "pensar junto" em decisao grande no app; WhatsApp redireciona

- **Contexto**: dono conversou com uma amiga que testou o app e elogiou a Grazi — levantou a preocupacao de que pessoas reais vao usar a Grazi pra tomar decisao financeira de verdade, entao a qualidade do aconselhamento importa.
- **Decisao de produto**: quando a pergunta for sobre decisao financeira GRANDE ou de risco (emprestimo, financiamento, investir reserva, renegociar divida — qualquer coisa que compromete o orcamento por meses ou e dificil de desfazer), a Grazi do app **nao da veredito pronto nem so manda procurar profissional** — faz 1-2 perguntas objetivas com os dados reais da pessoa (regra 10 do `SYSTEM_PROMPT`, `financialAssistant.ts`) pra ajudar a pessoa a pensar, e so depois, se fizer sentido, sugere profissional como complemento.
- **Por que isso NAO foi pro WhatsApp** (decisao explicita do dono: "o whatsapp tem que ser realmente lancamentos etc"): esse tipo de conversa exige ida-e-volta (historico) pra funcionar — uma resposta unica nao faz coaching. O app ja manda `history` a cada chamada (`AssistantPage.tsx`); o WhatsApp nunca teve isso (`answerFinancialQuestion.ts` sempre foi mensagem isolada, confirmado nesta sessao). Em vez de construir memoria de conversa pro WhatsApp, o bot la so reconhece a pergunta (novo intent `advisory_decision` em `interpretMessage.ts`) e redireciona pro app.
- **Achado no processo**: ja existe um disclaimer formal forte sobre isso nos Termos de Uso (secao 9, "Limitacao de responsabilidade — Grazi e IA") — mas ele nunca aparece na conversa em si, so no documento legal que ninguem le. A regra 10 e o reforco comportamental que faltava.
- **Arquivos**: `functions/src/ai/financialAssistant.ts` (regra 10, so app), `functions/src/whatsapp/interpretMessage.ts` (intent `advisory_decision`), `functions/src/whatsapp/webhookHandler.ts` (redireciona sem chamar `answerFinancialQuestion`, economiza cota de IA numa pergunta que so vai ser redirecionada mesmo).
- **Refinamento no mesmo dia, pedido explicito do dono**: "mesmo que pergunte, ela não pode falar qual banco ir, qual investimento" + "sobre investimento o ideal é nem falar sobre e falar direito pra buscar um profissional". Regra 6 (produto especifico) endurecida pra absoluta (nunca nomeia, mesmo se pedirem direto). Decisao de cartao novo/anuidade entrou no mesmo tratamento de "ajuda a pensar" do emprestimo (regra 10). **Investimento saiu da regra 10 e ganhou regra 11 propria, mais rigida**: zero analise/pergunta de reflexao, so redirecionamento pra profissional licenciado (atividade regulamentada). WhatsApp espelhou a regra de produto e ampliou `advisory_decision` pra cobrir cartao novo/anuidade e qualquer pergunta de investimento (antes so pegava "investir reserva"); `answerFinancialQuestion.ts` ganhou rede de seguranca equivalente.
- **Validacao**: `npm --prefix functions run build`/`test` (67/67) limpos nas duas rodadas do dia. Mudanca de prompt — sem teste automatizado dedicado (mesma limitacao dos outros prompts da Grazi/interpretMessage, ja documentada). **Deployado** (`financialAssistantChat` + `whatsappWebhook`, autorizado pelo dono, duas vezes no dia) **e verificado ao vivo no app com 3 perguntas reais**:
  - "Devo pegar um emprestimo pra quitar a fatura do cartao?" — perguntou de volta (valor, juros), usou numeros reais (Livre pra Gastar R$382, saldo R$1.987, faturas), so mencionou profissional no fim.
  - "Vale a pena eu tirar um cartao novo? Esse tem anuidade de 500 reais por ano" — mesmo padrao (anuidade vs. uso real dos beneficios, ja tem outro cartao), citou o cartao que a pessoa **ja tem** (Nubank Roxinho, dado real dela — nao e recomendacao) mas nunca sugeriu qual cartao tirar.
  - "Onde eu devo investir minha reserva de emergencia? Acoes ou tesouro direto?" — recusou analisar, explicou que e regulamentado, redirecionou pra profissional, mas seguiu ajudando com o que estava no escopo (tamanho ideal da reserva com base nos gastos reais).
  - Pergunta rotineira ("quanto gastei esse mes?") continuou respondida direto nas duas rodadas — confirma que as regras nao disparam fora do escopo.
  - **Ponta do WhatsApp ainda sem teste com mensagem real** — depende do dono mandar uma mensagem de teste pro numero vinculado.

### 2026-07-18 — Conta principal + resolucao de conta e transferencia via WhatsApp

- **Relato do dono**: com mais de uma conta cadastrada, a Grazi no WhatsApp lancava despesa/receita numa conta arbitraria (`.limit(1)` sem ordenacao — nao era nem "a primeira criada" de forma confiavel) e nao tinha suporte nenhum a transferencia entre contas.
- **Conta principal** (`Account.isPrimary`, `src/types/contracts.ts`): campo opcional, no maximo uma por workspace (exclusividade garantida no client, `setPrimaryAccount` desmarca a anterior no mesmo batch — a regra do Firestore so valida tipo bool, nao exclusividade). UI em `src/pages/AccountsPage.tsx` (botao estrela em cada conta, so aparece com 2+ contas). `firestore.rules`: `validAccountCreate`/`validAccountUpdate` aceitam `isPrimary`, testado em `tests/firestore.rules.test.ts` (`npm run test:rules`, 54/54 passando).
- **Casamento de conta por nome**: `interpretMessage.ts` agora recebe a lista de contas ativas (igual ja fazia com categorias) e o prompt DeepSeek extrai `accountId` (despesa/receita) ou `sourceAccountId`/`destinationAccountId` (transferencia) quando a mensagem cita o banco/conta ("gastei 30 no mercado itau"). Nunca adivinha — sem mencao clara, fica null.
- **Resolucao em 3 niveis** (`functions/src/whatsapp/accountResolution.ts`, testado): nome citado → conta principal → conta unica → bot pergunta (reusa o padrao ja existente do cartao: lista numerada, TTL 3min). Extraido do `webhookHandler.ts` pra ficar testavel isoladamente.
- **Intent `transfer`** (novo): "transfere 100 do nubank pro itau" cria `type: 'transfer'` com `destinationAccountId` (campo/valor ja existiam em `firestore.rules`/`financeSchemas.ts` do lado do app — nao precisou de mudanca de regra alem do `isPrimary`). Cada lado resolvido independentemente, excluindo a conta ja resolvida do outro lado pra nunca sugerir a mesma conta nos dois lados. Se so um lado ficar ambiguo, pergunta so esse; se os dois, pergunta os dois numa mensagem so (`resolveDualSelection`, aceita "1 2"/"1-2"/"1,2"). Exige 2+ contas ativas.
- **`pendingCardAction.ts` generalizado em `pendingAction.ts`**: mesmo doc unico `whatsappPendingActions/{phone}`, agora discriminado por `kind` (`card_purchase`/`debit_credit`/`transfer`) em vez de ficar restrito a cartao. `resolveCardSelection` virou `resolveSingleSelection` (mesma logica, generica) — achado no processo: nao normalizava acento ("itau" nao batia com "Itaú"), corrigido com `normalize('NFD')` + strip de diacriticos, agora com teste cobrindo o caso.
- **Testes novos**: `accountResolution.test.ts` (10), `pendingAction.test.ts` (9) — suite de functions foi de 48 pra 67 testes.
- **Deployado no mesmo dia** — `firestore:rules` e `whatsappWebhook` (+ `gcloud run services update --no-cpu-throttling`, obrigatorio pos-deploy) publicados com autorizacao do dono. Verificado ao vivo no dev server (aponta pro Firebase real): a tentativa inicial reproduziu `permission-denied` (regra ainda nao publicada), e apos o deploy o mesmo fluxo persistiu corretamente (sobreviveu a reload).

### 2026-07-17 — Numero preso num vinculo orfao apos exclusao de conta pre-correcao

- **Relato**: o dono excluiu a propria conta (antes da correcao de exclusao de conta ficar pronta, ver `docs/history/2026-07.md`), recriou uma conta com o mesmo email/Google, e nao conseguia mais vincular o mesmo numero — o bot respondia "Este numero ja esta vinculado a uma conta Granativa."
- **Causa**: `whatsappPhoneIndex/{phone}` continuava apontando pro `workspaceId`/`uid` da conta antiga, ja excluida (confirmado lendo o doc direto via REST — `users/{oldUid}` e `workspaces/personal_{oldUid}` ambos 404). `processLinkCode` so checa `.exists()`, nunca verifica se o vinculo aponta pra algo que ainda existe.
- **Correcao imediata**: nao foi possivel apagar o doc orfao direto via API neste ambiente (bloqueado pela politica de seguranca do agente pra escrita destrutiva em producao fora de fluxo de teste) — resolvido construindo a ferramenta certa em vez de contornar.
- **Correcao definitiva**: nova aba **WhatsApp** no painel Admin (`src/pages/AdminPage.tsx`) lista todo `whatsappPhoneIndex`, marca "Orfao" quando o `linkedByUid` nao bate com nenhum usuario carregado, e tem botao "Desvincular" por linha — chama `adminUnlinkWhatsappNumber` (novo, `functions-admin/src/index.ts`), que apaga `whatsappPhoneIndex` + `workspaces/{id}/whatsappLinks` via Admin SDK, funcionando mesmo com o workspace ja excluido.
- **Ver tambem**: `docs/history/2026-07.md` (entrada da correcao de exclusao de conta, 2026-07-17) — esse achado veio direto de testar a correcao no proprio numero do dono.

### 2026-07-16/17 — Conta de desenvolvedor Meta bloqueada por "atividade incomum" (nao e bug)

- **Relato**: uma amiga do dono criou conta e tentou vincular o WhatsApp — nao funcionou (ela gerou o codigo no app com sucesso, mas nada chegou depois de mandar "vincular XXXXXX"). O dono confirmou que a Grazi dentro do app continuava funcionando normalmente.
- **Investigacao**: `gcloud logging read` (ver `docs/RUNBOOK.md`) mostrou que o ultimo `whatsapp_message_received` bem-sucedido tinha sido as 12:16 UTC do dia 16 — depois disso, **nenhuma requisicao POST da Meta chegou ao webhook**, nem do numero da amiga nem, mais tarde, do proprio numero de teste do dono. Testando o token de acesso direto contra a Graph API (`GET /me`, o endpoint mais basico possivel), toda chamada retornava `"API access blocked."` — confirmando que o bloqueio era na conta de desenvolvedor inteira, nao um problema de webhook/indice/WABA como nos incidentes anteriores.
- **Causa**: sistema automatico de deteccao de fraude da Meta reagindo ao volume de atividade incomum do dia (multiplos deploys + testes manuais concentrados + conta nova testando ao mesmo tempo + as proprias chamadas de diagnostico). Nao e um bug de codigo — ver secao de Troubleshooting acima.
- **Resolucao**: o dono completou a verificacao de identidade pedida pela Meta (email + SMS) no painel `developers.facebook.com`. Confirmado reestabelecido (`GET /me` voltou a responder normalmente) e testado de ponta a ponta: mensagem simples no numero ja vinculado recebeu resposta da Grazi, e um vinculo **novo** com outro numero (simulando a amiga) completou com sucesso (`vincular XXXXXX` → confirmacao → lancamento de receita registrado), tudo sem precisar mexer em `subscribed_apps` ou qualquer config do painel — o bloqueio realmente so afetava o acesso da API, nao a inscricao do webhook.
- **Ideia levantada pelo dono, nao implementada**: no futuro, um PWA proprio (subdominio tipo `grazi.granativa.com.br`) so de chat com a Grazi, sem depender do WhatsApp/Meta — elimina esse tipo de risco de plataforma por completo, ao custo de reintroduzir um pouco da friccao que o WhatsApp resolve (ter que abrir algo em vez de so mandar mensagem num app que ja fica aberto o dia todo). Maior parte do backend ja existe (`financialAssistant.ts`, `aiRateLimit.ts`, `buildFinancialContext.ts`) — seria principalmente trabalho de empacotamento (manifest/PWA proprio), nao um projeto do zero. Sem decisao de fazer, so registrado aqui pra nao perder o contexto.

### 2026-07-15 — Compra no cartao (a vista ou parcelada) via WhatsApp

- **Novos intents** em `interpretMessage.ts`: `card_purchase` (compra no cartao, com campo `installments` extraido de "em Nx"/"N vezes", default 1) e `advanced_card_action` (parcela ja em andamento, antecipar parcela/fatura, renegociar — redirecionado pro app, nunca executado).
- **`createCardPurchaseFromMessage.ts`** (novo) porta `cardService.createCardPurchase()` pro Admin SDK: divide o total em parcelas (`installmentAmounts`), calcula o ciclo de cada parcela via `resolveInstallmentCycle` (portado em `functions/src/cards/cardDates.ts`), cria as faturas que faltarem e grava um `ledger` entry por parcela + um doc de transacao `type:'card_purchase'`.
- **Escolha de cartao quando ha mais de um**: nova coleção `whatsappPendingActions/{phone}` (Admin-SDK only, TTL 3 min) guarda o rascunho da compra enquanto o bot pergunta "1 - Itau / 2 - Nubank". A proxima mensagem e resolvida por numero ou nome (`resolveCardSelection`, `pendingCardAction.ts`) antes mesmo de rodar `interpretMessage` de novo (evita gastar uma chamada DeepSeek numa resposta tipo "2"). Se a resposta nao bater com nenhum cartao, a pendencia e descartada silenciosamente e a mensagem e tratada como nova — o bot nunca fica travado esperando.
- **Refatoracao**: logica de resolver/criar categoria (matching mais especifico + criar se nomeada explicitamente) extraida pra `resolveOrCreateCategory()` dentro de `webhookHandler.ts`, compartilhada entre despesa/receita/compra no cartao.
- **Regra do Firestore**: bloco de negacao explicita pra `whatsappPendingActions/{phone}` (`allow read, write: if false`), mesmo estilo de `whatsappPhoneIndex`. Nenhuma outra mudanca de regra — payload de `createCardPurchaseFromMessage` e identico ao que o app ja produz.
- **Fora do escopo, de proposito**: compra ja em andamento antes do WhatsApp, antecipar parcela/fatura, renegociar — o bot direciona pro app em vez de tentar.

### 2026-07-15 — Categoria nomeada explicitamente dentro do lancamento agora e criada

- **Antes**: "gastei 50 no mercado, coloca na categoria trabalho" — se "Trabalho" nao existisse, o lancamento ficava sem categoria (regra de "so cria com pedido explicito avulso" era estrita demais aqui).
- **Depois**: nomear uma categoria explicitamente DENTRO de um lancamento de despesa/receita ("coloca na categoria X", "categoria: X") agora cria "X" na hora se ela nao existir, e ja usa nesse mesmo lancamento. Continua sem criar nada quando a IA so *escolhe* uma categoria por semelhanca semantica (ex.: "gastei na farmacia" sem categoria "Farmacia" cadastrada continua ficando sem categoria) — a criacao so acontece quando o nome da categoria vem explicito na mensagem.
- Tambem corrigido: pedido explicito de categoria ("coloca na categoria Mercado") agora sempre vence a escolha automatica por assunto, mesmo quando outra categoria pareceria mais obvia.
- Arquivos: `interpretMessage.ts` (prompt), `webhookHandler.ts` (chama `createCategoryFromMessage` antes de `createTransactionFromMessage` quando aplicavel).

### 2026-07-15 — Paridade com a Grazi: categorias, receita, perguntas + vinculo unico/desvinculo

- **Roteamento de intencao**: `interpretMessage.ts` substitui `extractExpense.ts` — uma unica chamada DeepSeek (JSON mode) classifica a mensagem em `expense`/`income`/`create_category`/`question`/`unclear` e ja extrai os dados, ao inves de assumir sempre despesa.
- **Categoria nova so por pedido explicito**: "cria uma categoria chamada X" cria via `createCategoryFromMessage.ts` (dedupe por nome, icone/cor validados contra `categoryPalette.ts`). Lancamento de despesa/receita sem categoria clara continua ficando sem categoria — a IA nunca cria uma sozinha durante um lancamento, so casa com a mais especifica entre as existentes (ex.: "remedio" vai pra "Farmacia" se existir, senao "Saude").
- **Receita**: `createTransactionFromMessage.ts` recebe `type` em vez de fixar `'expense'`. "recebi 200 de freela" agora cria uma transacao `income` de verdade.
- **Perguntas financeiras**: `answerFinancialQuestion.ts` reusa `buildFinancialContext` + a mesma persona/regras da Grazi do app, com o negrito adaptado pro WhatsApp. Rate limit compartilhado com a Grazi (`aiRateLimit.ts`, mesmo orcamento de 60/dia por workspace — extraido de `financialAssistant.ts` sem mudar comportamento).
- **Vinculo unico**: `generateWhatsappLinkCode` agora rejeita gerar codigo novo se o workspace ja tiver um numero vinculado (`already-exists`), e limpa codigos antigos nao usados antes de gravar um novo (evitava acumulo sem fim).
- **Desvincular**: nova function `unlinkWhatsapp` (onCall) + botao "Desvincular" em `WhatsAppLinkPage.tsx` — fecha o gap que os Termos (secao 7.4) e a pagina de exclusao de dados ja prometiam mas nao existia.
- **UI de status**: a tela de vinculacao agora le `workspaces/{id}/whatsappLinks` no mount e mostra "Vinculado: `<numero>`" em vez de sempre oferecer "Vincular" (cliente ja podia ler essa colecao, regra catch-all confirmada — sem mudanca de `firestore.rules`).
- **Testes**: 2 casos novos de emulador cobrindo `type:'income'` (categoria e transacao) — gap pre-existente no `tests/firestore.rules.test.ts`, fechado no mesmo commit.

### 2026-07-15 — Confirmacao demorando ~1min (CPU throttling) + DEEPSEEK_API_KEY nao vinculado

- **Sintoma 1**: apos vincular com sucesso, a confirmacao "✅ WhatsApp vinculado..." demorou cerca de 1 minuto pra chegar, quando deveria ser quase instantaneo (so Firestore + 1 chamada HTTP).
- **Causa raiz**: `whatsappWebhook` responde 200 pro Meta imediatamente (`res.status(200).json(...)`) e so DEPOIS processa (Firestore + `sendWhatsAppMessage`). Isso e necessario — Meta espera resposta rapida — mas por padrao o Cloud Run **corta a CPU da instancia assim que a resposta HTTP e enviada**. Qualquer codigo que continue rodando depois disso (nosso `try {...}` inteiro) fica com CPU throttled, as vezes levando dezenas de segundos pra terminar algo que normalmente leva 1-2s.
- **Correcao**: `memory: '512MiB'` + `cpu: 1` no codigo (`webhookHandler.ts`) — pre-requisito do Cloud Run pra permitir CPU sempre alocada — e depois `gcloud run services update whatsappwebhook --region=southamerica-east1 --no-cpu-throttling --project=zerou-26757` rodado manualmente. **Esse comando gcloud precisa ser reaplicado toda vez que a funcao for redeployada** (o Firebase CLI nao expoe essa flag e reseta o Cloud Run service a cada deploy).
- **Sintoma 2 (achado no mesmo log)**: `No value found for secret parameter "DEEPSEEK_API_KEY"` — a extracao de gastos via mensagem (a feature principal do bot) estava quebrada desde a criacao, porque `whatsappWebhook` nunca declarou `secrets: [deepseekApiKey]` nas suas opcoes (so a Grazi, em `financialAssistant.ts`, fazia isso certo). Corrigido adicionando o secret nas opcoes do `onRequest`.
- **Se acontecer de novo apos um deploy** (mensagens/confirmacoes lentas de novo): rodar de novo o comando `gcloud run services update whatsappwebhook --region=southamerica-east1 --no-cpu-throttling --project=zerou-26757` — o deploy do Firebase reseta essa configuracao.

### 2026-07-15 — Vinculacao quebrada: faltava indice do Firestore

- **Sintoma**: usuario mandava "vincular 123456" pro bot, a mensagem chegava (confirmado no WhatsApp com check azul), mas nenhuma resposta voltava — nem sucesso, nem erro.
- **Causa raiz**: `processLinkCode()` (`linkAccount.ts`) roda `db.collectionGroup('whatsappLinkCodes').where('code', '==', code).get()`. Firestore exige indice explicito pra query em escopo `COLLECTION_GROUP` com filtro de igualdade — nao existia. A query lancava `FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index...`, capturado pelo `catch` generico do `webhookHandler.ts` e logado so como `whatsapp_webhook_error` (sem detalhe, porque o `logger.error(string, objeto)` do Functions v2 nao serializou o `err.message` no stdout/stderr nesse caso). Resultado: falha 100% silenciosa, nenhuma mensagem de erro nem de sucesso ia pro usuario.
- **Como foi confirmado**: reproduzida a query exata via REST API do Firestore (`documents:runQuery` com token de `gcloud auth print-access-token`), retornando o erro completo com link pra criar o indice.
- **Correcao**: adicionado `fieldOverrides` em `firestore.indexes.json` habilitando `COLLECTION_GROUP` pro campo `code` de `whatsappLinkCodes`. Deploy via `npx firebase deploy --only firestore:indexes --project zerou-26757`. Indice levou ~3min pra ficar `READY` (build assincrono do Firestore).
- **Se acontecer de novo** (novo bug de "webhook recebe mas nao responde nada"): suspeitar de indice faltante em qualquer `collectionGroup(...).where(...)` novo. Testar a query direto via REST (`POST .../documents:runQuery`) com token de `gcloud auth print-access-token` reproduz o erro real na hora, sem depender do log (que pode vir truncado).

### 2026-07-15 — Webhook destravado (WABA nao inscrita) + link faltante no menu mobile

- **Causa raiz encontrada**: `GET /{WABA_ID}/subscribed_apps` retornava `{"data":[]}` — a WABA (1431749015518519) nunca foi inscrita no app apos a migracao pro numero real. A config de webhook a nivel de app (Callback URL, verify token, `messages` Subscribed) estava correta desde o inicio; faltava esse passo separado que o embedded signup faz automaticamente e o setup manual pulou.
- **Correcao**: `POST /{WABA_ID}/subscribed_apps` com o token permanente → `{"success":true}`. Confirmado na hora: mensagem real enviada ao bot gerou log `whatsapp_message_received` (antes so havia logs de deploy/scaling, nunca de mensagem).
- **Novo bug encontrado**: o menu mobile (`src/layout/AppShell.tsx`, secao `mobile-menu-footer`) nao tinha o link para `/app/settings/whatsapp` — so existia na sidebar desktop (`getNavClass` list principal). Por isso o dono do produto nao conseguia achar a tela de vinculacao pelo celular, mesmo com tudo funcionando no backend. Corrigido adicionando o `NavLink` faltante (mesmo padrao dos outros itens do footer), commit `2f04984`.
- **Se acontecer de novo** (novo numero, nova WABA, ou webhook silencioso mesmo com tudo "Subscribed" no painel): sempre conferir `GET /{WABA_ID}/subscribed_apps` primeiro — se vier vazio, o problema e esse, nao o webhook em si.

### 2026-07-15 — Migracao para numero real

- **Antes**: numero de teste Meta (+1 555 170 3901, Phone Number ID 1231264580067541). Webhooks nao entregues (test numbers tem limitacoes).
- **Depois**: numero real +55 11 936192757 (Phone Number ID 1262339823619604, WABA 1431749015518519). Token permanente via System User.
- **App Meta publicado**: categoria "Servicos e produtividade". Politicas: /legal/privacy, /legal/terms, /legal/data-deletion.
- **DNS**: Cloudflare (nameservers kareem + mia). Email Routing configurado.
- **Registro do numero**: `POST /register` → `success:true` resolveu erro #133010.
- **Envio de mensagens**: OK via API (curl). Mensagens entregues ao destinatario.
- **Proximo passo**: re-submeter webhook em WhatsApp > Configuration para conectar ao novo numero. Depois testar mensagem do usuario → resposta do webhook.
- **Bug HMAC**: validacao de assinatura X-Hub-Signature-256 usava access token como App Secret (valores diferentes). Validacao desativada temporariamente — precisa configurar `WHATSAPP_APP_SECRET` com o App Secret real do painel Meta.
- **Status atual**: webhook ainda nao recebe mensagens do Meta (sem log de `whatsapp_message_received`). Possivel causa: webhook config precisa ser re-submetida para o novo numero em WhatsApp > Configuration. Envio de mensagens funciona.

### 2026-07-15 — Implementacao inicial (numero de teste)

- Cloud Functions `whatsappWebhook` + `generateWhatsappLinkCode` criadas e deployadas.
- Meta Cloud API v22.0 → v25.0 (atualizado durante a sessao).
- Teste de envio com curl confirmou token funcionando (HTTP 200, message accepted).
- Webhook verificado (GET challenge retorna correto), mas mensagens recebidas nao acionavam webhook (limitacao de test number).
- Pagina de vinculacao (`WhatsAppLinkPage.tsx`) criada e integrada no menu.
