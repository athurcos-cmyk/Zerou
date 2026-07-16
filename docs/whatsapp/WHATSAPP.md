# WhatsApp — Bot de lancamentos via Meta Cloud API

> **Regra permanente**: toda mudanca no WhatsApp (webhook, token, numero, fluxo, secrets, UI, permissoes, correcao de bug) **precisa ser registrada neste documento**. O historico mensal (`docs/history/`) e o `CHANGELOG.md` recebem so o resumo + link pra ca.

## Visao geral

Integracao oficial com a Meta Cloud API v25.0 para controle financeiro completo por mensagem de WhatsApp — paridade com a Grazi do app, e mais. O usuario vincula seu numero e pode: lancar despesa ("gastei 15 reais no mercado"), lancar receita ("recebi 200 de freela"), criar categoria sob pedido explicito ("cria uma categoria chamada Pet") e fazer perguntas financeiras ("quanto gastei esse mes?", igual a Grazi do app). Uma unica chamada DeepSeek classifica a intencao da mensagem e ja extrai os dados (`interpretMessage.ts`).

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
| `functions/src/whatsapp/webhookHandler.ts` | Cloud Function `onRequest`. GET: verificacao de webhook. POST: le a mensagem, resolve `vincular XXXXXX` via regex (`processLinkCode`) ou chama `interpretMessage` e roteia por intencao: `create_category` → `createCategoryFromMessage`; `question` → `answerFinancialQuestion`; `expense`/`income` → `createTransactionFromMessage`; `unclear` → mensagem de ajuda. |
| `functions/src/whatsapp/interpretMessage.ts` | Uma chamada DeepSeek (JSON mode) classifica a mensagem em `expense`/`income`/`create_category`/`question`/`unclear` e ja extrai valor, descricao, categoria (a mais especifica entre as existentes) e dados de categoria nova, tudo numa chamada so. Substitui o antigo `extractExpense.ts` (so cobria despesa). |
| `functions/src/whatsapp/createCategoryFromMessage.ts` | Cria categoria via Admin SDK quando o usuario pede explicitamente ("cria uma categoria X"). Dedupe por nome (case-insensitive), icone validado contra `categoryPalette.ts` (fallback `sliders`), cor escolhida por rotacao na paleta Sol — nunca inventada pela IA. Payload identico a `financeService.createCategory()`. |
| `functions/src/whatsapp/categoryPalette.ts` | Espelha `src/components/categoryIcons.tsx` e `src/theme/palette.ts` (Cloud Functions nao importa `src/` do app cliente — pacotes separados). Mantenha em sincronia manualmente. |
| `functions/src/whatsapp/answerFinancialQuestion.ts` | Perguntas financeiras via WhatsApp — reusa `buildFinancialContext` + a mesma persona/regras da Grazi (`financialAssistant.ts`), com o negrito adaptado pro WhatsApp (`*um asterisco*`, nao `**dois**`). Rate limit compartilhado com a Grazi do app (`aiRateLimit.ts`, mesmo contador `workspaces/{id}/aiUsage/{data}`, 60/dia). |
| `functions/src/whatsapp/createTransactionFromMessage.ts` | Cria transacao no Firestore via Admin SDK (bypassa regras) — despesa ou receita (`type` recebido, nao mais fixo em `'expense'`). Mantenha em sincronia com `src/finance/financeService.ts:createTransaction()`. |
| `functions/src/whatsapp/linkAccount.ts` | `generateWhatsappLinkCode` (onCall): bloqueia se o workspace ja tiver um numero vinculado (`already-exists`), limpa codigos antigos nao usados do mesmo usuario, gera codigo 6 digitos em `users/{uid}/whatsappLinkCodes/{code}`, retorna link `wa.me`. `processLinkCode`: chamado pelo webhook quando usuario manda "vincular XXXXXX", grava vinculo em `whatsappPhoneIndex/{phone}` e `workspaces/{id}/whatsappLinks/{phone}`. |
| `functions/src/whatsapp/unlinkWhatsapp.ts` | `unlinkWhatsapp` (onCall): apaga `whatsappPhoneIndex/{phone}` + `workspaces/{id}/whatsappLinks/{phone}`, varre codigos residuais, avisa o numero desvinculado via WhatsApp (best-effort). Fecha o vinculo ja prometido em `src/pages/LegalPages.tsx` (Termos §7.4, Data Deletion). |
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

### Mensagem financeira (despesa, receita, categoria, pergunta)

```
1. Usuario: envia qualquer mensagem financeira pelo WhatsApp (nao "vincular XXXXXX")
2. Meta: POST no webhook com a mensagem
3. webhookHandler: valida X-Hub-Signature-256 (se WHATSAPP_APP_SECRET configurado)
4. webhookHandler: responde 200 imediatamente (Meta espera resposta rapida)
5. webhookHandler: parseia body → object=whatsapp_business_account → entry[0].changes[0].value.messages[0]
6. webhookHandler: extrai phone (msg.from) e text (msg.text.body)
7. webhookHandler: consulta whatsappPhoneIndex/{phone} → workspaceId + linkedByUid
8. webhookHandler: carrega TODAS as categorias ativas (sem filtro de tipo)
9. webhookHandler: interpretMessage(texto, categorias) → DeepSeek, uma chamada, retorna intent + dados
10. Roteamento por intent:
    - create_category: createCategoryFromMessage() → confirma criacao (ou dedupe)
    - question: checkAiUsageNotExceeded() → answerFinancialQuestion() → incrementAiUsage()
    - expense/income: carrega conta padrao → createTransactionFromMessage({ type, ... })
    - unclear: mensagem de ajuda explicando o que o bot faz
11. webhookHandler: sendWhatsAppMessage(phone, confirmacao/resposta formatada)
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
| `whatsappPhoneIndex/{phone}` | Indice phone → workspaceId + uid | `processLinkCode` (webhook) |
| `workspaces/{id}/whatsappLinks/{phone}` | Registro de vinculo no workspace | `processLinkCode` (webhook) |

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

```bash
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
