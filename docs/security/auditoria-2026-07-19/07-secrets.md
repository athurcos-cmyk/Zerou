# Auditoria de Segurança — Segredos & Configuração

**Data:** 2026-07-19
**Tipo:** Report-only (diagnóstico, sem correção)
**Escopo:** `.env*`, `functions/.env.zerou-26757`, `src/firebase/config.ts`, `vercel.json`, `firebase.json`, `.claude/`, `.gitignore`, histórico do git

---

## Sumário Executivo

Foram encontrados **3 achados críticos**, **1 achado de alta severidade** e **2 de média severidade**. O problema mais urgente é o vazamento iminente de secrets do WhatsApp via arquivo versionado em git, combinado com o uso incorreto de `defineString()` em vez de `defineSecret()` nas Cloud Functions.

---

## ID: SECRETS-1
**Titulo:** WhatsApp secrets versionaveis em arquivo rastreado pelo git
**Severidade:** Critica
**Local:** `functions/.env.zerou-26757` (modificado localmente, ainda nao commitado)
**Descricao:**
O arquivo `functions/.env.zerou-26757` e **rastreado pelo git** (commitado desde 2026-06-18, commit `262905e`). A versao commitada contem apenas `APP_BASE_URL=https://granativa.com.br` (valor publico, sem risco).

Porem, o **working copy atual** contem 4 secrets reais do WhatsApp adicionados localmente (unstaged, visiveis via `git diff`):

```
GRANATIVA_WHATSAPP_NUMBER=+5511936192757
WHATSAPP_VERIFY_TOKEN=granativa-whatsapp-verify-2026
WHATSAPP_ACCESS_TOKEN=EAAVC4KlNQZCMBR9xmh...  (token completo valido do Meta)
WHATSAPP_PHONE_NUMBER_ID=1262339823619604
```

Se estes valores forem commitados (via `git add functions/.env.zerou-26757`), os secrets ficarao **para sempre no historico do git**, mesmo que removidos depois.

**Cenario / PoC:**
```bash
git add functions/.env.zerou-26757
git commit -m "feat: adiciona secrets do WhatsApp"
git push origin main
# Agora WHATSAPP_ACCESS_TOKEN esta no historico permanente do repositorio
```

**Impacto:**
- O `WHATSAPP_ACCESS_TOKEN` e um token de acesso vitalicio da Meta Cloud API. Qualquer pessoa com acesso ao repositorio (ou ao historico) pode:
  - Enviar mensagens WhatsApp em nome do negocio Granativa
  - Ler mensagens recebidas
  - Acessar a fila de webhooks
- O `WHATSAPP_VERIFY_TOKEN` permite reconfigurar o webhook do WhatsApp em outro servidor
- Nao e possivel remover completamente do historico sem `git filter-branch` ou `BFG Repo-Cleaner`, que reescreve o historico e exige force push

**Solucao sugerida:**
1. Adicionar `functions/.env.zerou-26757` ao `.gitignore` imediatamente
2. Usar `git rm --cached functions/.env.zerou-26757` para parar de rastrear (mas manter o arquivo localmente)
3. Substituir a linha `APP_BASE_URL=...` por um arquivo `.env.example` commitado (que ja existe em `functions/.env.example`)
4. Se ja tiver commitado: rodar `git filter-branch` ou BFG para expurgar do historico, seguido de force push
5. **Alternativamente**, considerar que `APP_BASE_URL` no commit nao e um segredo (URL publica), entao pode-se simplesmente gitignorar o arquivo e criar um `.env.example` com `APP_BASE_URL=` (sem valor) para servir de template

**Confianca:** 10

---

## ID: SECRETS-2
**Titulo:** WhatsApp secrets usam `defineString()` em vez de `defineSecret()` e nao sao injetados via `secrets: []`
**Severidade:** Critica
**Local:**
- `functions/src/whatsapp/metaClient.ts:4-7` (defineString)
- `functions/src/whatsapp/webhookHandler.ts:81` (secrets: [deepseekApiKey], sem os WhatsApp secrets)
**Descricao:**
O projeto tem **duas abordagens diferentes** para secrets de Cloud Functions:

| Secret | Metodo | Injetado via `secrets: []` | Protegido |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | `defineSecret()` | Sim (`webhookHandler.ts:81`, `financialAssistant.ts:68`) | Sim |
| `STRIPE_SECRET_KEY` | `defineSecret()` | Sim (`index.ts:102,128,151,181,198`) | Sim |
| `STRIPE_WEBHOOK_SECRET` | `defineSecret()` | Sim (`index.ts:151`) | Sim |
| `WHATSAPP_ACCESS_TOKEN` | `defineString()` | **Nao** | **Nao** |
| `WHATSAPP_PHONE_NUMBER_ID` | `defineString()` | **Nao** | **Nao** |
| `WHATSAPP_VERIFY_TOKEN` | `defineString()` | **Nao** | **Nao** |
| `GRANATIVA_WHATSAPP_NUMBER` | `defineString()` | **Nao** | **Nao** |

`defineString()` expoe o valor em:
- Logs do Cloud Functions (se logado acidentalmente)
- Console do Firebase (variaveis de ambiente sao visiveis)
- Respostas de erro que vazam env vars

`defineSecret()` com `secrets: []`:
- Armazena em ciphertext no Secret Manager
- Injeta como variavel de ambiente apenas em tempo de execucao
- Valores aparecem mascarados nos logs (`*******`)
- Rota assinada e auditada

**Impacto:**
Se um atacante obtiver acesso ao console do Firebase (ex.: via funcionario malicioso, conta comprometida), os secrets do WhatsApp estarao visiveis em plaintext nas configuracoes de ambiente das Cloud Functions. Os secrets do Stripe/DeepSeek estariam protegidos pelo Secret Manager.

**Solucao sugerida:**
1. Migrar todos os `defineString()` em `metaClient.ts` para `defineSecret()`
2. Adicionar os 4 secrets do WhatsApp ao array `secrets: [...]` em `webhookHandler.ts:81`
3. Opcionalmente, criar uma funcao auxiliar `whatsappSecrets` que retorna o array para ser usado em todas as funcoes que precisam de WhatsApp
4. Rodar `firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN` (e os demais) para armazenar no Secret Manager
5. Fazer deploy das functions com `npx firebase deploy --only functions`

**Confianca:** 10

---

## ID: SECRETS-3
**Titulo:** WhatsApp webhook com validacao de assinatura desabilitada
**Severidade:** Alta
**Local:** `functions/src/whatsapp/webhookHandler.ts:103-116`
**Descricao:**
A validacao `X-Hub-Signature-256` (HMAC-SHA256) do webhook do WhatsApp esta **comentada** com o TODO:

```typescript
// Signature validation disabled until WHATSAPP_APP_SECRET is configured.
// Using the access token (wrong secret) causes HMAC mismatch and Meta stops delivery.
// TODO: add WHATSAPP_APP_SECRET secret, then uncomment validation below.
```

Isso significa que **qualquer requisicao POST** para o endpoint `/whatsappWebhook` e processada como se fosse da Meta, sem verificar se realmente veio da Meta.

**Cenario / PoC:**
1. Um atacante descobre a URL do webhook (ex.: via analise de DNS, GitHub dorking, ou log de erro)
2. Envia requisicoes POST forjadas com `{ object: "whatsapp_business_account", entry: [...] }`
3. O servidor processa e responde como se fosse uma mensagem real do WhatsApp
4. Dependendo do payload, pode causar criacao de transacoes, categorias, ou consumo de tokens de IA (rate limit)

**Mitigacoes existentes (parciais):**
- O numero do remetente precisa estar vinculado (`whatsappPhoneIndex`) para criar transacoes
- Criacao de transacoes requer workspaceId valido
- IA tem rate limit diario
- Porem, ataques de negacao (spam de mensagens) ou consumo de recursos ainda sao possiveis

**Impacto:**
- Consumo indevido de tokens DeepSeek (custo financeiro)
- Spam de mensagens WhatsApp para usuarios reais
- Possivel negacao de servico por esgotamento de rate limit
- Vetor de ataque para descobrir vulnerabilidades no interpretador de mensagens

**Solucao sugerida:**
1. Configurar `WHATSAPP_APP_SECRET` no Secret Manager (via `firebase functions:secrets:set`)
2. Adicionar `defineSecret('WHATSAPP_APP_SECRET')` em `metaClient.ts`
3. Descomentar e corrigir a validacao: o `appSecret` e diferente de `WHATSAPP_ACCESS_TOKEN`
4. No webhook: `crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')`

**Confianca:** 10

---

## ID: SECRETS-4
**Titulo:** CSP sem `frame-ancestors` — vulneravel a clickjacking
**Severidade:** Media
**Local:** `vercel.json:34`
**Descricao:**
O header `Content-Security-Policy` nao inclui a diretiva `frame-ancestors`. Isso permite que o site seja embutido em iframes de terceiros.

```json
"Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' ..."
```

Note que `frame-src` controla quais fontes o site **pode carregar em iframes proprios** (ex.: incorporar Google Auth), mas `frame-ancestors` controla quais sites **podem embutir este site em iframes**.

**Cenario / PoC:**
1. Atacante cria um site malicioso com um iframe apontando para `https://granativa.com.br/app`
2. Usuario logado visita o site do atacante
3. Atacante sobrepoe elementos de UI para enganar o usuario a clicar em botoes do app sem perceber
4. Exemplo: "Clique aqui para ganhar um premio" sobrepoe o botao "Excluir conta"

**Impacto:**
- Execucao de acoes nao intencionais pelo usuario logado
- Potencial para roubo de dados via formularios sobrepostos (UI redressing)
- Risco maior para usuarios que mantem sessao ativa (comum em PWA)

**Solucao sugerida:**
Adicionar ao CSP em `vercel.json`:
```
frame-ancestors 'none';
```
Ou, se houver necessidade de embutir em dominios especificos:
```
frame-ancestors 'self';
```

**Confianca:** 9

---

## ID: SECRETS-5
**Titulo:** Headers de seguranca ausentes no `vercel.json`
**Severidade:** Media
**Local:** `vercel.json`
**Descricao:**
Comparacao dos headers de seguranca atualmente configurados vs. recomendados:

| Header | Presente | Valor |
|---|---|---|
| `X-Content-Type-Options` | **Sim** | `nosniff` |
| `Referrer-Policy` | **Sim** | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | **Nao** | — |
| `Strict-Transport-Security` (HSTS) | **Nao** | — |
| `Permissions-Policy` | **Nao** | — |
| `X-XSS-Protection` | **Nao** | — (deprecated) |
| `Content-Security-Policy` | **Sim** | (analisado em SECRETS-4 e SECRETS-6) |

**Headers ausentes:**

1. **`Strict-Transport-Security`** — Forca conexao HTTPS mesmo se usuario digitar HTTP:
   ```
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   ```
   *Nota:* Vercel ja redireciona HTTP para HTTPS automaticamente, mas o HSTS previne ataques de downgrade na primeira requisicao (SSL Strip).

2. **`Permissions-Policy`** — Restringe APIs do navegador (ex.: camera, microfone, geolocation):
   ```
   Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
   ```
   O app financeiro nao precisa de camera, microfone, geolocation ou pagamentos nativos.

3. **`X-Frame-Options`** — Alternativa legacy ao `frame-ancestors` (cobertura extra para browsers antigos):
   ```
   X-Frame-Options: DENY
   ```

**Impacto:**
- Sem HTS: vulneravel a SSL Strip em redes publicas (primeira requisicao HTTP nao e redirecionada)
- Sem Permissions-Policy: navegadores permitem que sites tercerizados peçam acesso a APIs sensiveis
- Sem X-Frame-Options: browsers antigos (IE, Safari antigo) ignoram `frame-ancestors` do CSP

**Solucao sugerida:**
Adicionar ao `vercel.json` no bloco `"source": "/(.*)"`:
```json
{"key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload"},
{"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()"},
{"key": "X-Frame-Options", "value": "DENY"}
```

**Confianca:** 8

---

## ID: SECRETS-6
**Titulo:** CSP `script-src` com `unsafe-inline` permite XSS
**Severidade:** Informativa
**Local:** `vercel.json:34`
**Descricao:**
A diretiva `script-src 'unsafe-inline'` permite que qualquer script inline seja executado no contexto do site. Isto e uma fragilidade do CSP, mas e **praticamente obrigatoria** para SPAs sem SSR (como este, React + Vite) que usam:
- Modules inline do Vite
- Inline event handlers
- Web Workers criados via blob:

**Mitigacoes existentes:**
- O app nao tem areas de conteudo gerado por usuario que injetam HTML
- As unicas entradas de usuario sao via React (protegido contra XSS)
- `object-src 'none'` e `base-uri 'self'` bloqueiam vetores classicos de XSS
- `form-action 'self'` previne exfiltracao via formularios

**Risco real:** Baixo. Para um app financeiro React sem SSR, esta configuracao e aceitavel.

**Melhoria futura (longo prazo):**
- Implementar Strict CSP com nonce (requer SSR/rendering dinamico)
- Ou usar hash-based CSP (complexo para bundles com hash variante)

**Confianca:** 7

---

## ID: SECRETS-7
**Titulo:** Configuracao do Claude Code com permissoes excessivas
**Severidade:** Media
**Local:** `.claude/settings.json` (projeto) e `C:\Users\Thurcos\.claude\settings.json` (global)
**Descricao:**

**Configuracao global** (`C:\Users\Thurcos\.claude\settings.json`):
```json
{
  "skipDangerousModePermissionPrompt": true
}
```
Isso desativa o prompt de confirmacao para acoes marcadas como perigosas. Combinado com as permissoes amplas do projeto, qualquer skill maliciosa ou prompt inadvertido pode executar acoes destrutivas sem aviso.

**Configuracao do projeto** (`C:\Users\Thurcos\Desktop\Zerou\.claude\settings.json`):
```json
{
  "permissions": {
    "allow": [
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(git *)",
      "Bash(ls *)",
      "Bash(cd *)",
      "Bash(pwd *)",
      "Bash(node *)",
      "Bash(python *)",
      "PowerShell(npm *)",
      "PowerShell(npx *)",
      "PowerShell(git *)",
      "PowerShell(Get-ChildItem *)",
      "PowerShell(Set-Location *)",
      "PowerShell(Get-Content *)",
      "PowerShell(Measure-Object *)",
      "PowerShell(Test-Path *)",
      "PowerShell(python *)",
      "PowerShell(node *)",
      "WebFetch(*)",
      "WebSearch(*)",
      "Grep(*)",
      "Glob(*)",
      "Read(*)",
      "Edit(*)",
      "Write(*)",
      "Agent(*)",
      "Skill(*)",
      "TaskCreate(*)",
      "TaskUpdate(*)",
      "TaskList(*)",
      "TaskGet(*)",
      "mcp__claude-in-chrome__*"
    ]
  }
}
```

Permissoes mais criticas:
- `Write(*)` e `Edit(*)` — manipulacao irrestrita de arquivos
- `Agent(*)` — o proprio Claude pode criar sub-agentes com as mesmas permissoes
- `mcp__claude-in-chrome__*` — acesso total ao navegador (incluindo abrir URLs arbitrarias, ler cookies, etc.)
- `WebFetch(*)` e `WebSearch(*)` — exfiltracao de dados via web
- `Bash(git *)` — push para remote, manipulacao de historico

**Impacto:**
Se um ataque de prompt injection acontecer (ex.: o Claude le conteudo malicioso de um arquivo ou URL), o atacante tem acesso completo a:
- Leitura e escrita de todo o codigo fonte
- Acesso ao navegador com sessoes ativas do Firebase
- Execucao de comandos git para push de codigo malicioso
- Acesso a web para exfiltracao de dados

**Solucao sugerida:**
1. Remover `"skipDangerousModePermissionPrompt": true` do global
2. Restringir permissoes do projeto:
   - `Agent(*)` → `Agent(read-only)` ou remover se nao for necessario
   - `Write(*)` → `Write(src/**)` ou restringir a diretorios especificos
   - `mcp__claude-in-chrome__*` → listar dominios especificos permitidos se possivel
   - Avaliar se `WebFetch(*)` e `WebSearch(*)` sao realmente necessarios

**Confianca:** 9

---

## ID: SECRETS-8
**Titulo:** Emuladores do Firebase expostos apenas em dev (configuracao correta)
**Severidade:** Informativa
**Local:** `firebase.json:33-51`, `src/firebase/config.ts:53-55`
**Descricao:**
Os emuladores do Firebase estao configurados em `firebase.json` (auth:9099, firestore:8080, storage:9199, hosting:5000, ui:4000) e so sao ativados no client quando `import.meta.env.DEV && VITE_USE_FIREBASE_EMULATORS === 'true'`.

Nao ha risco de emuladores vazarem para producao. Configuracao correta.

**Confianca:** 10

---

## ID: SECRETS-9
**Titulo:** `.env.local` e `TEST_ACCOUNTS.local.md` gitignorados corretamente
**Severidade:** Informativa
**Local:** `.gitignore:14-15` (`.env`, `.env.local`, `.env.*.local`), `.gitignore:49` (`*.local.md`)
**Descricao:**
Verificacao positiva:

- `.env.local` (raiz): contem Firebase config real, mas esta em `.gitignore` — seguro
- `TEST_ACCOUNTS.local.md`: existe no disco com credenciais de teste, mas o padrao `*.local.md` a cobre — seguro
- Nenhum service account key, `.pem` ou arquivo de credenciais foi encontrado no historico do git

**Confianca:** 10

---

## ID: SECRETS-10
**Titulo:** Configuracao Firebase client-side e padrao para Firebase Web SDK
**Severidade:** Informativa
**Local:** `src/firebase/config.ts:30-38`
**Descricao:**
As variaveis `VITE_FIREBASE_*` expostas ao client sao o padrao do Firebase Web SDK:

- `apiKey` — **nao e um segredo** no Firebase. E um identificador publico do projeto. O Firebase Auth usa `authDomain` + `apiKey` juntos, e as Security Rules sao a barreira real.
- `authDomain`, `projectId`, `storageBucket` — sao identificadores publicos do projeto
- `messagingSenderId`, `appId` — identificadores de aplicacao, publicos

O Firestore esta configurado com `persistentLocalCache` (offline-first) e `experimentalAutoDetectLongPolling` para compatibilidade de rede — ambas configuracoes adequadas.

**Nota:** O `measurementId` so e usado se `VITE_ENABLE_ANALYTICS=true` e com consentimento explicito (`hasAnalyticsConsent()`).

Nao ha configuracao incorreta aqui. Este e o design esperado do Firebase Web SDK.

**Confianca:** 10

---

## Resumo dos achados

| ID | Severidade | Titulo | Local |
|---|---|---|---|
| SECRETS-1 | **Critica** | WhatsApp secrets versionaveis em arquivo rastreado pelo git | `functions/.env.zerou-26757` |
| SECRETS-2 | **Critica** | WhatsApp secrets usam `defineString()` em vez de `defineSecret()` | `metaClient.ts`, `webhookHandler.ts` |
| SECRETS-3 | **Alta** | WhatsApp webhook com validacao de assinatura desabilitada | `webhookHandler.ts:103-116` |
| SECRETS-4 | **Media** | CSP sem `frame-ancestors` — clickjacking | `vercel.json:34` |
| SECRETS-5 | **Media** | Headers de seguranca ausentes (HSTS, Permissions-Policy, X-Frame-Options) | `vercel.json` |
| SECRETS-6 | **Informativa** | CSP `unsafe-inline` — aceitavel para SPA React | `vercel.json:34` |
| SECRETS-7 | **Media** | Claude Code com permissoes excessivas e skip de confirmacao | `.claude/settings.json` |
| SECRETS-8 | **Informativa** | Emuladores restritos a dev (configuracao correta) | `firebase.json`, `config.ts` |
| SECRETS-9 | **Informativa** | `.env.local` e `*.local.md` gitignorados corretamente | `.gitignore` |
| SECRETS-10 | **Informativa** | Firebase config client-side dentro do esperado | `src/firebase/config.ts` |
