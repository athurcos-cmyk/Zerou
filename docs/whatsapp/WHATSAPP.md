# WhatsApp — Bot de lancamentos via Meta Cloud API

> **Regra permanente**: toda mudanca no WhatsApp (webhook, token, numero, fluxo, secrets, UI, permissoes, correcao de bug) **precisa ser registrada neste documento**. O historico mensal (`docs/history/`) e o `CHANGELOG.md` recebem so o resumo + link pra ca.

## Visao geral

Integracao oficial com a Meta Cloud API v25.0 para lancamento de transacoes financeiras por mensagem de WhatsApp. O usuario vincula seu numero, manda mensagem como "gastei 15 reais no mercado" e a IA (DeepSeek) extrai valor, descricao e categoria, criando a transacao automaticamente no Granativa.

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
| `functions/src/whatsapp/webhookHandler.ts` | Cloud Function `onRequest`. GET: verificacao de webhook (hub.mode + hub.verify_token + hub.challenge). POST: valida `X-Hub-Signature-256`, extrai mensagem, chama `processLinkCode` ou `extractExpense` → `createTransactionFromMessage` → `sendWhatsAppMessage`. |
| `functions/src/whatsapp/extractExpense.ts` | Chama DeepSeek com prompt de extracao de gastos (JSON mode). Recebe texto + lista de categorias, retorna `{ amountCents, description, categoryId, confidence }`. |
| `functions/src/whatsapp/createTransactionFromMessage.ts` | Cria transacao no Firestore via Admin SDK (bypassa regras). Mantenha em sincronia com `src/finance/financeService.ts:createTransaction()`. |
| `functions/src/whatsapp/linkAccount.ts` | `generateWhatsappLinkCode` (onCall): gera codigo 6 digitos, salva em `users/{uid}/whatsappLinkCodes/{code}`, retorna link `wa.me`. `processLinkCode`: chamado pelo webhook quando usuario manda "vincular XXXXXX", grava vinculo em `whatsappPhoneIndex/{phone}` e `workspaces/{id}/whatsappLinks/{phone}`. |
| `functions/src/ai/deepseekClient.ts` | Cliente HTTP compartilhado para API DeepSeek. Usado tanto pelo WhatsApp (`extractExpense.ts`) quanto pela Grazi (`financialAssistant.ts`). |
| `src/settings/WhatsAppLinkPage.tsx` | UI de vinculacao. Botao "Vincular WhatsApp" → chama `generateWhatsappLinkCode` → exibe codigo 6 digitos + link wa.me. |
| `src/App.tsx` | Rota `/app/settings/whatsapp`. |
| `src/layout/AppShell.tsx` | Link "WhatsApp" (icone `MessageCircle`) na sidebar e menu mobile. |
| `functions/src/index.ts` | Export `whatsappWebhook` e `generateWhatsappLinkCode`. |
| `firestore.rules` | Regras para `whatsappLinkCodes/{code}` (read: self, write: false) e `whatsappPhoneIndex/{phone}` (read: auth, write: false). |

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

### Lancamento de transacao

```
1. Usuario: envia "gastei 15 reais no mercado" para o bot pelo WhatsApp
2. Meta: POST no webhook com a mensagem
3. webhookHandler: valida X-Hub-Signature-256 (se WHATSAPP_APP_SECRET configurado)
4. webhookHandler: responde 200 imediatamente (Meta espera resposta rapida)
5. webhookHandler: parseia body → object=whatsapp_business_account → entry[0].changes[0].value.messages[0]
6. webhookHandler: extrai phone (msg.from) e text (msg.text.body)
7. webhookHandler: consulta whatsappPhoneIndex/{phone} → workspaceId + linkedByUid
8. webhookHandler: carrega categorias ativas (type expense/both) + primeira conta ativa
9. webhookHandler: extractExpense(texto, categorias) → DeepSeek
10. webhookHandler: createTransactionFromMessage({ workspaceId, userId, amountCents, ... })
11. webhookHandler: sendWhatsAppMessage(phone, confirmacao formatada)
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
# Deploy das funcoes WhatsApp
npx firebase deploy --only functions:billing:whatsappWebhook,functions:billing:generateWhatsappLinkCode --project zerou-26757

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
