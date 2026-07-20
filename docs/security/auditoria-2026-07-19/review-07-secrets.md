# Revisao Camada 2 — Auditoria de Seguranca: Segredos & Configuracao

**Data:** 2026-07-19
**Auditor Original:** Camada 1
**Revisor:** Camada 2
**Arquivo auditado:** `07-secrets.md`
**Escopo da revisao:** Classificar cada achado, validar PoCs, caçar lacunas.

---

## Metodologia

Para cada um dos 10 achados do auditor original, coletei evidencias independentes:
1. Leitura dos arquivos-fonte mencionados (`vercel.json`, `firebase.json`, `.claude/settings.json`, `.claude/settings.local.json`, `src/firebase/config.ts`, `index.html`, `metaClient.ts`, `webhookHandler.ts`)
2. Varredura do historico git (`git log --all --oneline -- *.env*`, `git log -p` nos commits com `.env.zerou-26757`, `git log -G` para palavras-chave de secrets)
3. Verificacao do `.gitignore` real vs. arquivos rastreados (`git ls-files`, `git check-ignore`)
4. Leitura do `.env.example` e `functions/.env.example` em todos os commits do historico
5. Verificacao do `storage.rules` (nao escopado pelo auditor)
6. Leitura das configuracoes globais do Claude Code (`$USERPROFILE/.claude/settings.json`)

---

## Classificacao dos Achados do Auditor

### SECRETS-1 — WhatsApp secrets versionaveis em arquivo rastreado pelo git

**Classificacao: CONFIRMADO com SUBESTIMACAO**

**Evidencia:**

- `git ls-files --error-unmatch functions/.env.zerou-26757` confirma: arquivo **rastreado** pelo git.
- `git check-ignore functions/.env.zerou-26757` retorna exit code 1: NENHUM padrao do `.gitignore` cobre este arquivo.
- `git log -p -- functions/.env.zerou-26757` mostra que o historico contem APENAS `APP_BASE_URL` (valor publico — zero risco ate agora).
- O diff atual (`git diff HEAD -- functions/.env.zerou-26757`) mostra os 4 secrets do WhatsApp no working copy.

**O que o auditor subestimou:** A causa raiz nao e apenas que o arquivo esta sendo rastreado — e que o `.gitignore` TEM uma lacuna sistêmica. O padrao atual e:

```
.env
.env.local
.env.*.local
```

Nenhum destes padroes cobre `functions/.env.zerou-26757`. O sufixo `.local` e necessario para o wildcard `*` funcionar. Qualquer arquivo `.env.{qualquer-coisa}` sem `.local` no final **vaza do gitignore**. Isto nao e um problema de um arquivo so — e um problema de configuracao que afeta qualquer `.env.sufixo` novo que alguem criar.

**PoC validada:** Sim. O cenario descrito (`git add` -> `git commit` -> `git push`) funciona e colocaria os secrets no historico permanente.

---

### SECRETS-2 — WhatsApp secrets usam defineString() em vez de defineSecret()

**Classificacao: CONFIRMADO**

**Evidencia:**

- `functions/src/whatsapp/metaClient.ts:4-7`: 4x `defineString()` para `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRANATIVA_WHATSAPP_NUMBER`.
- `functions/src/whatsapp/webhookHandler.ts:81`: `secrets: [deepseekApiKey]` — apenas o DeepSeek no array, nenhum WhatsApp secret.
- `functions/src/index.ts`: usa `defineSecret()` corretamente para `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
- `functions/src/ai/deepseekClient.ts`: usa `defineSecret()` corretamente para `DEEPSEEK_API_KEY`.

**Impacto confirmado:** Os 4 secrets do WhatsApp estao visiveis em plaintext como environment variables no deploy das Cloud Functions. Qualquer pessoa com acesso ao console do Firebase (ou ao deploy log) ve os valores. Os secrets Stripe/DeepSeek estariam protegidos pelo Secret Manager.

**PoC validada:** Conceitualmente correta. `defineString()` expoe os valores no console do Firebase e em logs de deploy.

---

### SECRETS-3 — WhatsApp webhook com validacao de assinatura desabilitada

**Classificacao: CONFIRMADO**

**Evidencia:**

- `webhookHandler.ts:103-116`: validacao `X-Hub-Signature-256` completamente comentada.
- O comentario no codigo confirma que e intencional ("Signature validation disabled until WHATSAPP_APP_SECRET is configured").
- Linha 107: `const appSecret = whatsappAccessToken.value()` — o codigo comentado usa o ACCESS TOKEN como chave HMAC, o que esta ERRADO (o `WHATSAPP_APP_SECRET` e diferente do access token).

**Nota adicional:** O mesmo codigo comentado tambem tem um bug — se a validacao fosse descomentada com o access token, o HMAC nunca bateria e Meta pararia de entregar mensagens. O codigo comentado nao esta apenas inativo: esta **incorreto**.

**PoC validada:** Sim. Qualquer POST com `object: "whatsapp_business_account"` e processado. As mitigacoes listadas pelo auditor (vinculo de numero, workspace valido, rate limit de IA) sa reais, mas nao impedem consumo de recursos ou spam.

---

### SECRETS-4 — CSP sem frame-ancestors (clickjacking)

**Classificacao: CONFIRMADO**

**Evidencia:**

- `vercel.json:34`: CSP atual termina com `form-action 'self'` — nao ha `frame-ancestors` em nenhuma parte.
- `frame-src` esta presente (para Google Auth e Firebase), mas `frame-ancestors` e uma diretiva separada e ausente.
- A distincao esta correta: `frame-src` controla que iframes o site PODE CARREGAR; `frame-ancestors` controla quem PODE EMBUTIR este site.

**PoC validada:** Sim. Qualquer site pode embutir `https://granativa.com.br` em um iframe. Ataque de clickjacking e viavel.

---

### SECRETS-5 — Headers de seguranca ausentes

**Classificacao: CONFIRMADO**

**Evidencia:**

- `vercel.json` foi lido na integra. Os headers presentes sao exatamente: `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Robots-Tag` (para rotas especificas).
- `Strict-Transport-Security`: AUSENTE.
- `Permissions-Policy`: AUSENTE.
- `X-Frame-Options`: AUSENTE.

**Nota:** A Vercel ja faz redirect HTTP->HTTPS automaticamente, entao o risco de SSL Strip na primeira requisicao e parcialmente mitigado. Mas sem HSTS, um ataque MITM ativo na primeira requisicao ainda funciona.

**PoC validada:** Conceitualmente correta. Headers confirmados como ausentes.

---

### SECRETS-6 — CSP unsafe-inline (Informativa)

**Classificacao: CONFIRMADO**

**Evidencia:**

- `vercel.json:34`: `script-src 'self' 'unsafe-inline' https://www.gstatic.com ...`
- O app e uma SPA React + Vite — ambos exigem `unsafe-inline` para funcionar sem SSR.
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` estao presentes como mitigacoes.

**Avaliacao:** Correta como Informativa. O risco e baixo para o contexto. Nao ha conteudo gerado por usuario injetando HTML.

---

### SECRETS-7 — Claude Code com permissoes excessivas

**Classificacao: CONFIRMADO**

**Evidencia:**

- `.claude/settings.json`: permissoes `Write(*)`, `Edit(*)`, `Agent(*)`, `mcp__claude-in-chrome__*` confirmadas na leitura.
- `$env:USERPROFILE\.claude\settings.json`: `"skipDangerousModePermissionPrompt": true` confirmado.
- `.claude/settings.local.json` (projeto): lista de permissoes mais restritiva, mas o `settings.json` do projeto sobrescreve com permissoes amplas.

**Observacao de Camada 2:** O risco de prompt injection e real, mas para um desenvolvedor solo trabalhando em maquina local, esta configuracao e funcional (permite fluxo de trabalho rapido). O skip de confirmacao combinado com `Write(*)` + `Bash(git *)` permite que um prompt injection:
1. Leia todo o codigo e `.env.local`
2. Modifique e commite codigo malicioso
3. Push para remote
4. Exfiltre dados via WebFetch

**Avaliacao de severidade:** Medium e razoavel para contexto de dev solo, mas merece vigilancia.

---

### SECRETS-8 — Emuladores restritos a dev (Informativa)

**Classificacao: CONFIRMADO**

**Evidencia:**

- `firebase.json:33-51`: emuladores configurados nas portas padrao.
- `src/firebase/config.ts:53-55`: `shouldUseEmulators()` retorna true apenas se `import.meta.env.DEV && VITE_USE_FIREBASE_EMULATORS === 'true'`.
- Nao ha como emuladores vazarem para producao.

---

### SECRETS-9 — .env.local e *.local.md gitignorados corretamente (Informativa)

**Classificacao: CONFIRMADO com SUBESTIMACAO**

**Evidencia:**

- `.gitignore` leitura confirmada: `.env`, `.env.local`, `.env.*.local`, `*.local.md` estao presentes.
- `git check-ignore .env.local` confirma: ignorado.
- `TEST_ACCOUNTS.local.md` esta coberto por `*.local.md`.

**O que o auditor subestimou:** Conforme detalhado em SECRETS-1, o padrao `*.env.*.local` NAO cobre `functions/.env.zerou-26757`. O arquivo esta rastreado pelo git e NENHUM padrao do `.gitignore` o protege. Esta informativa deveria ser pelo menos elevada a **Media** e vinculada a SECRETS-1.

---

### SECRETS-10 — Firebase config client-side (Informativa)

**Classificacao: CONFIRMADO**

**Evidencia:**

- `src/firebase/config.ts:30-38`: contem apenas `VITE_FIREBASE_*` — configuracoes publicas do Firebase Web SDK.
- `apiKey` no Firebase Web SDK nao e um segredo (e um identificador publico do projeto).
- `persistentLocalCache` e `experimentalAutoDetectLongPolling` sao configuracoes adequadas para offline-first.
- `measurementId` so e usado com consentimento explicito (`hasAnalyticsConsent()`), linha 134.

---

## Lacunas Encontradas (Nao Identificadas pelo Auditor)

### LAC-SECRETS-11 — Gap sistemico no gitignore para arquivos .env sem sufixo .local

**Severidade:** Alta
**Local:** `.gitignore:14-16`
**Classificacao: LACUNA**

**Descricao:**
O `.gitignore` usa os padroes `.env`, `.env.local`, `.env.*.local`. Nenhum destes padroes cobre um arquivo como `functions/.env.zerou-26757` porque:
- `.env` — cobre apenas o arquivo literal `.env` na raiz (nao em `functions/`)
- `.env.local` — cobre apenas `.env.local` literal
- `.env.*.local` — o wildcard `*` captura qualquer coisa entre `.env.` e `.local`, mas `.zerou-26757` nao termina em `.local`

Isso significa que QUALQUER arquivo `.env.{qualquer-coisa}` criado em qualquer diretorio do projeto (exceto os casos literais acima) NAO e protegido pelo `.gitignore`. Se alguem criar `functions/.env.production` ou `functions/.env.staging`, o mesmo problema ocorre.

**Evidencia:**
```bash
$ git check-ignore functions/.env.zerou-26757
# (exit code 1 — nao ignorado)
$ git ls-files functions/.env.zerou-26757
# functions/.env.zerou-26757
```

**Impacto:**
Qualquer secret adicionado a `functions/.env.zerou-26757` (ou qualquer `.env.{sufixo}`) e commitavel acidentalmente. O risco ja e iminente com os 4 secrets do WhatsApp no working copy.

**Mitigacao recomendada:**
Adicionar ao `.gitignore`:
```
# Environment files — todos os prefixos .env, incluindo .env.{projeto}
.env*
!.env.example
```
Ou, mais conservador:
```
functions/.env.zerou-26757
```
Mas a abordagem de wildcard e preferivel por cobrir casos futuros.

---

### LAC-SECRETS-12 — CSP sem upgrade-insecure-requests

**Severidade:** Baixa
**Local:** `vercel.json:34`
**Classificacao: LACUNA**

**Descricao:**
O header CSP nao inclui a diretiva `upgrade-insecure-requests`. Esta diretiva instrui o navegador a converter automaticamente URLs HTTP para HTTPS ao carregar subrecursos (imagens, scripts, etc.)

Embora a Vercel ja redirija HTTP->HTTPS no nivel de pagina, subrecursos carregados via HTTP em paginas HTTPS podem gerar avisos de mixed content. Em cenarios de MITM, um atacante poderia fazer um recurso carregar como HTTP se a CSP nao explicitamente rejeitar.

**Evidencia:**
```
Content-Security-Policy: default-src 'self'; script-src ... (sem upgrade-insecure-requests)
```

**Impacto:** Baixo. A Vercel ja faz HTTPS em todas as origens. Mas e uma camada extra de defesa que falta.

**Mitigacao recomendada:**
Adicionar `upgrade-insecure-requests` ao inicio da CSP.

---

### LAC-SECRETS-13 — Vazamento de telefone em logs do Cloud Functions

**Severidade:** Media
**Local:** `functions/src/whatsapp/metaClient.ts:53`
**Classificacao: LACUNA**

**Descricao:**
No `metaClient.ts`, linha 53, quando o envio de mensagem WhatsApp falha, o numero de telefone do usuario e logado em plaintext:

```typescript
logger.warn('whatsapp_send_failed', { phoneNumber, status: response.status, body: body.slice(0, 300) });
```

O numero de telefone ja esta armazenado em `whatsappPhoneIndex/{phone}` no Firestore (chave do documento = telefone), entao o dado ja existe no banco. Porem, logs do Cloud Functions sao acessiveis via console GCP, e logs tem retencao mais longa e sao mais faceis de vazar do que dados em banco.

**Impacto:**
- O numero de telefone de usuarios vinculados ao WhatsApp aparece em texto claro nos logs
- LGPD: numero de telefone e dado pessoal
- Qualquer pessoa com `roles/logging.viewer` no projeto GCP ve estes numeros

**Mitigacao recomendada:**
Substituir `phoneNumber` por `phoneNumber: phoneNumber.slice(0, -4) + '****'` (mascarar os ultimos 4 digitos) ou remover o telefone do log de erro e manter apenas o status HTTP e workspaceId.

---

### LAC-SECRETS-14 — Auditor nao verificou storage.rules

**Severidade:** Informativa
**Local:** `storage.rules`
**Classificacao: LACUNA (menor)**

**Descricao:**
O escopo da auditoria inclui `firebase.json` e `src/firebase/config.ts`, mas o `storage.rules` nao foi verificado. Embora nao estivesse explicitamente no escopo de "secrets", a configuracao do Firebase Storage pode expor dados se mal configurada.

**Verificacao realizada (Camada 2):**
O arquivo `storage.rules` contem:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

**Resultado:** Configuracao correta. Zero acesso publico ao Storage. Nao ha risco.

---

## Resumo da Revisao

| ID | Classificacao | Nota |
|---|---|---|
| SECRETS-1 | **CONFIRMADO + SUBESTIMADO** | Causa raiz nao identificada: gitignore nao cobre `.env.*` sem `.local` |
| SECRETS-2 | **CONFIRMADO** | PoC valida: todas as evidencias confirmam |
| SECRETS-3 | **CONFIRMADO** | PoC valida: codigo comentado + bug no codigo comentado |
| SECRETS-4 | **CONFIRMADO** | PoC valida: clickjacking viavel |
| SECRETS-5 | **CONFIRMADO** | HSTS, Permissions-Policy, X-Frame-Options ausentes |
| SECRETS-6 | **CONFIRMADO** | Aceitavel para SPA React |
| SECRETS-7 | **CONFIRMADO** | Permissoes amplas, mas contextual para dev solo |
| SECRETS-8 | **CONFIRMADO** | Emuladores seguros em dev |
| SECRETS-9 | **CONFIRMADO + SUBESTIMADO** | `*.local.md` ok, mas `.env.*.local` nao cobre o caso real |
| SECRETS-10 | **CONFIRMADO** | Configuracao Firebase client-side OK |
| **LAC-11** | **NOVA — Alta** | Gap sistemico no gitignore para `.env.{sufixo}` |
| **LAC-12** | **NOVA — Baixa** | CSP sem `upgrade-insecure-requests` |
| **LAC-13** | **NOVA — Media** | Telefone de usuarios vaza em logs de erro |
| **LAC-14** | **NOVA — Informativa** | Storage rules nao auditadas (mas estao corretas) |

### Resumo dos achados corrigido

O auditor encontrou 3 criticos, 1 alto, 2 medias, 3 informativos (total 9, com 1 ja incluso entre os criticos).

A revisao de Camada 2 adiciona:
- 1 alta (LAC-11 — gitignore gap sistemico)
- 1 media (LAC-13 — vazamento de telefone em logs)
- 1 baixa (LAC-12 — CSP sem upgrade-insecure-requests)
- 1 informativa (LAC-14 — storage rules nao auditadas)

### Nota final

O trabalho do auditor de Camada 1 foi solido: os 3 achados criticos sao reais e bem documentados. O maior ponto cego foi nao conectar SECRETS-1 a causa raiz no `.gitignore` — o auditor tratou como "um arquivo que precisa ser adicionado ao gitignore" quando na verdade e "um padrao do gitignore que nao cobre uma familia de arquivos". SECRETS-9 (informativa) deveria ter mencionado que a cobertura do `.gitignore` e parcial, vinculando a SECRETS-1.
