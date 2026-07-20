# Revisao Camada 2 — 09-client.md

**Revisor:** Auditor Camada 2
**Data:** 2026-07-19
**Escopo:** Revisao do relatorio `09-client.md` (seguranca cliente web) + caca a lacunas

---

## Metodologia

Para cada achado do relatorio original, classifiquei como CONFIRMADO, FALSO-POSITIVO, SUBESTIMADO ou SUPERESTIMADO com base em leitura direta dos arquivos-fonte (`src/`, `index.html`, `vercel.json`, `public/firebase-messaging-sw.js`, `vite.config.ts`). Em seguida, realizei busca ativa por lacunas que o auditor nao cobriu.

---

## Classificacao dos achados

### CLIENT-1: dangerouslySetInnerHTML sem sanitizacao na Grazi (AssistantPage)

**Classificacao: CONFIRMADO**

O `AssistantPage.tsx` linha 112 usa `dangerouslySetInnerHTML` com `renderAssistantMessage(msg.content)`. A funcao `renderAssistantMessage` (linhas 13-18) faz apenas substituicoes regex (`**texto**` -> `<strong>`, `*texto*` -> `<em>`, `\n` -> `<br/>`) e nao aplica nenhuma sanitizacao (DOMPurify, sanitize-html, etc.) antes de injetar no DOM via `__html`.

O `msg.content` e a resposta textual da Cloud Function `financialAssistantChat`, que consulta o modelo DeepSeek. Um prompt injection bem-sucedido no DeepSeek poderia fazer a funcao devolver HTML malicioso. Como o CSP contem `'unsafe-inline'` (CLIENT-2), `<script>` tags executariam.

Nao ha mitigacao. A sugestao de correcao (DOMPurify) e adequada.

---

### CLIENT-2: CSP com 'unsafe-inline' e sem strict-dynamic/nonce

**Classificacao: CONFIRMADO**

`vercel.json` linha 34. A diretiva `script-src 'self' 'unsafe-inline' ...` permite execucao de qualquer script inline. Sem `strict-dynamic` ou `nonce`, nao ha protecao CSP contra XSS.

A sugestao de correcao (substituir por nonce/strict-dynamic) e correta, mas o relatorio **omite uma dependencia importante**: o `index.html` linha 11 contem um inline event handler `onload="this.onload=null;this.rel='stylesheet'"` no preload de fontes do Google. Este handler e JS inline e **quebraria** sem `'unsafe-inline'` a menos que receba um nonce ou seja substituido por uma abordagem CSP-friendly (ex.: carregar o CSS via JavaScript com um nonce, ou usar `<link rel="stylesheet">` direto). Ver LACUNA-1 para detalhes.

---

### CLIENT-3: Ausencia de frame-ancestors na CSP (clickjacking)

**Classificacao: CONFIRMADO**

A CSP nao possui `frame-ancestors`. Qualquer site pode incorporar o app em iframe. Nao ha iframes legítimos no app (confirmado por grep: zero `<iframe>`, `<embed>` ou `<object>` em `src/`).

A sugestao (`frame-ancestors 'none'`) e correta. O header `X-Frame-Options: DENY` (CLIENT-6) e redundante mas bem-vindo para navegadores antigos.

---

### CLIENT-4: Ausencia de Strict-Transport-Security (HSTS)

**Classificacao: CONFIRMADO**

Nenhum header `Strict-Transport-Security` em `vercel.json`. A sugestao de correcao e adequada. Nota: como o app e servido pelo Vercel que ja redireciona HTTP para HTTPS, o risco pratico e reduzido, mas HSTS protege contra o primeiro acesso HTTP e MITM em redes comprometidas.

---

### CLIENT-5: Ausencia de Permissions-Policy

**Classificacao: CONFIRMADO**

Nenhum header `Permissions-Policy` definido. O app nao usa camera, microfone, geolocalizacao nem qualquer API sensivel. A sugestao de correcao e adequada como defesa em profundidade.

---

### CLIENT-6: Ausencia de X-Frame-Options (defesa redundante)

**Classificacao: CONFIRMADO**

Header ausente. Embora redundante com `frame-ancestors` (CLIENT-3), ainda e relevante para navegadores mais antigos que ignoram CSP. A sugestao (`X-Frame-Options: DENY`) e correta.

---

### CLIENT-7: Cleanup incompleto de localStorage no logout

**Classificacao: CONFIRMADO, SUBESTIMADO**

O achado e real: o `logout()` so limpa o cache de perfil (`clearCachedProfiles`) e o IndexedDB do Firestore quando `options.clearLocalCache` e `true`. Varias chaves permanecem em localStorage.

**O auditor subestimou o escopo** — faltaram na lista:

- `zerou.themeMode`, `zerou.themeId`, `zerou.density`, `zerou.fontScale`, `zerou.reduceMotion` (`src/theme/theme.storage.ts`) — preferencias de aparencia. Baixa sensibilidade, mas sao chaves `zerou.*` que deveriam constar na documentacao do problema.

A sugestao de correcao ("percorrer todas as chaves com prefixo `zerou.`") e a abordagem correta. Idealmente, criar uma funcao `clearZerouLocalStorage()` centralizada, chamada no logout padrao e nao apenas quando `clearLocalCache` for true.

---

### CLIENT-8: Inline script no index.html com dados do localStorage

**Classificacao: FALSO-POSITIVO (parcialmente)**

O relatorio afirma: "nao ha whitelist para `themeMode`". **Isso esta incorreto.** O codigo real do `index.html` (linhas 33-46) contem:

```javascript
const validModes = ['manual', 'system'];
const mode = validModes.includes(localStorage.getItem('zerou.themeMode'))
  ? localStorage.getItem('zerou.themeMode')
  : 'manual';
```

A whitelist (`validModes`) EXISTE e E USADA na validacao. Tanto `themeMode` quanto `themeId` sao validados antes de serem aplicados como atributos `data-*`. Mesmo sem a whitelist, o valor so iria para um `data-*` attribute, que React nao interpreta como HTML.

A conclusao do relatorio esta correta: "Isso e de baixo risco porque (1) o valor so vai para um atributo `data-*`, nao para HTML direto, (2) nao ha CSS ou JS que interprete `data-theme-mode` de forma perigosa." A sugestao "incluir `themeMode` na whitelist" **ja esta implementada**.

**Classificacao: FALSO-POSITIVO** — a observacao sobre a whitelist faltante e incorreta. O risco e ainda mais baixo do que o "Baixa" atribuido. Sugiro rebaixar para **Informativa** ou remover o achado, mantendo apenas a observacao geral de que scripts inline com `'unsafe-inline'` sao um vetor.

---

### CLIENT-9: Dados financeiros em localStorage sem expiracao

**Classificacao: CONFIRMADO**

O `dashboardViewCache.ts` armazena saldos, totais e transacoes recentes em localStorage sem timestamp de expiracao. O codigo tem validacao de tipos razoavel (`parseMark`, `parseSpendingRow`, etc.), o que mitiga corrupcao de dados, mas nao a persistencia indefinida.

A sugestao de adicionar timestamp de criacao e ignorar caches antigos e razoavel, mas nao critica como o relatorio ja classifica (Informativa).

---

### CLIENT-10: Service Worker sem escopo restrito

**Classificacao: CONFIRMADO**

O SW tem escopo `/` (padrao para SPA). `registerType: 'autoUpdate'` com `skipWaiting: true` e `clientsClaim: true`. Tudo configuracao normal para SPA com PWA.

O relatorio menciona o `firebase-messaging-sw.js` gerado em build time. Esta coberto na LACUNA-2 e LACUNA-3 abaixo, que o auditor nao explorou em profundidade.

---

### CLIENT-11: API key do Firebase exposta no bundle do cliente

**Classificacao: CONFIRMADO**

Comportamento normal para Firebase client-side. A protecao real sao as Security Rules. Nada a acrescentar.

---

### CLIENT-12: Vite expoe configuracao do Firebase no source map

**Classificacao: CONFIRMADO, SUBESTIMADO**

O relatorio acerta ao dizer que e normal para Firebase. Porem, ha um ponto adicional: o arquivo `public/firebase-messaging-sw.js` (gerado pelo `vite.config.ts` plugin `generateFirebaseMessagingSW`) contem a configuracao completa do Firebase em **texto plano**: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId. Este arquivo:

1. Esta em `public/` e e servido como asset estatico
2. NAO passa pelo hash de precaching do Workbox (nao tem hash no nome)
3. NAO tem `X-Content-Type-Options: nosniff` no `vercel.json` (ver LACUNA-4)
4. Importa scripts externos via `importScripts` sem SRI (ver LACUNA-2)

Isso nao muda a classificacao (Informativa), mas o relatorio deveria ter mencionado `public/firebase-messaging-sw.js` explicitamente.

---

## Tabela-resumo

| ID | Titulo | Severidade original | Classificacao C2 |
|---|---|---|---|
| CLIENT-1 | dangerouslySetInnerHTML sem sanitizacao | Alta | CONFIRMADO |
| CLIENT-2 | CSP com 'unsafe-inline' sem strict-dynamic/nonce | Alta | CONFIRMADO |
| CLIENT-3 | Ausencia de frame-ancestors | Media | CONFIRMADO |
| CLIENT-4 | Ausencia de Strict-Transport-Security | Media | CONFIRMADO |
| CLIENT-5 | Ausencia de Permissions-Policy | Baixa | CONFIRMADO |
| CLIENT-6 | Ausencia de X-Frame-Options | Baixa | CONFIRMADO |
| CLIENT-7 | Cleanup incompleto de localStorage no logout | Media | CONFIRMADO, SUBESTIMADO |
| CLIENT-8 | Inline script no index.html com dados do localStorage | Baixa | FALSO-POSITIVO (parcial) |
| CLIENT-9 | Dados financeiros em localStorage sem expiracao | Informativa | CONFIRMADO |
| CLIENT-10 | Service Worker sem escopo restrito | Informativa | CONFIRMADO |
| CLIENT-11 | API key do Firebase exposta no bundle | Informativa | CONFIRMADO |
| CLIENT-12 | Vite expoe configuracao do Firebase no source map | Informativa | CONFIRMADO + SUBESTIMADO |

---

## Lacunas nao cobertas pelo auditor

### LACUNA-1: Inline onload no index.html incompativel com remocao do 'unsafe-inline'

**Severidade:** Media (bloqueia a correcao de CLIENT-2)
**Local:** `index.html` (linha 11)

O preload de fontes usa `onload="this.onload=null;this.rel='stylesheet'"`. Este e um **inline event handler** — JavaScript inline que depende de `'unsafe-inline'` para executar. O auditor recomendou remover `'unsafe-inline'` do CSP mas nao identificou que este handler quebraria.

Para implementar a recomendacao de CLIENT-2, e necessario **tambem**:
1. Adicionar um `nonce` a este handler (difcil com `onload=` inline), OU
2. Substituir o padrao por `<link rel="stylesheet">` direto (bloqueante mas simples), OU
3. Substituir por um `<script nonce="...">` que faz o mesmo trabalho, OU
4. Usar `'strict-dynamic'` + `'unsafe-inline'` (que ainda permite inline handlers em alguns navegadores, mas nao resolve o problema de nonce).

**Sugestao:** Substituir o preload + onload por `<link rel="stylesheet" href="...">` direto (aceitando o bloqueio de render), ou extrair a logica para um `<script>` com nonce posicionado no `<head>`.

---

### LACUNA-2: firebase-messaging-sw.js importa scripts externos sem Subresource Integrity (SRI)

**Severidade:** Baixa
**Local:** `vite.config.ts` (linhas 25-26) → `public/firebase-messaging-sw.js` (linhas 1-2)

O service worker de mensageria carrega:
```javascript
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');
```

Sem SRI (`integrity`), se o CDN do Google (`www.gstatic.com`) for comprometido, um atacante pode injetar codigo arbitrario no SW, que tem acesso a interceptacao de todas as requisicoes do escopo `/`.

**Risco:** Extremamente baixo (gstatic.com e Google, improbavel de ser comprometido), mas e uma omissao de defesa em profundidade.

**Sugestao:** Nao e viavel adicionar SRI a `importScripts()` em SW classico. Opcoes:
1. Alternativa: bundle os scripts do Firebase Messaging no propio SW em vez de importar de CDN.
2. Aceitar o risco e documentar.

---

### LACUNA-3: Notificacao push do firebase-messaging-sw.js abre URL arbitraria sem validacao

**Severidade:** Baixa
**Local:** `vite.config.ts` (linhas 39-40) → `public/firebase-messaging-sw.js` (linhas 12, 23)

O handler `notificationclick` no SW faz:
```javascript
return clients.openWindow(event.notification.data.link || '/app');
```

O campo `link` vem do payload FCM, que e gerado pela Cloud Function que envia a notificacao. Se a Cloud Function for comprometida (ou se um atacante conseguir manipular os dados que ela le do Firestore), a notificacao pode navegar para qualquer URL (`https://phishing-site.com`).

Importante: operacoes de SW (`clients.openWindow`) **nao sao protegidas pelo CSP** da pagina. O CSP so se aplica a documentos HTML.

**Risco:** Baixo, porque o payload da notificacao e controlado exclusivamente pelo servidor. Mas nenhuma validacao de origem/URL existe no SW.

**Sugestao:** Adicionar uma verificacao no SW de que `event.notification.data.link` comeca com `'/'` ou com `self.location.origin` antes de passar para `clients.openWindow()`.

---

### LACUNA-4: /sw.js e /workbox-(.*).js sem X-Content-Type-Options: nosniff

**Severidade:** Informativa
**Local:** `vercel.json` (linhas 2-14, 16-28)

As rotas `/sw.js` e `/workbox-(.*).js` definem apenas `Cache-Control` e `Surrogate-Control`, mas **nao** incluem `X-Content-Type-Options: nosniff`. A rota generica `/(.*)` (linhas 29-44) inclui `X-Content-Type-Options: nosniff`. Inconsistencia.

Como o Vercel geralmente serve SW com o MIME type correto (`text/javascript` ou `application/javascript`), o risco pratico e proximo de zero, mas a inconsistencia merece documentacao.

**Sugestao:** Adicionar `X-Content-Type-Options: nosniff` as rotas `/sw.js` e `/workbox-(.*).js`.

---

### LACUNA-5: CSP permite www.googletagmanager.com sem uso aparente

**Severidade:** Informativa
**Local:** `vercel.json` (linha 34)

A diretiva `script-src` inclui `https://www.googletagmanager.com`. Nao foi encontrado nenhum codigo de Google Tag Manager (gtag, GTM) no `src/` (grep por `googletagmanager`, `gtag`, `GoogleAnalytics`, `GA_MEASUREMENT` nao retornou resultados). Se GTM nao e usado, esta entrada no CSP e superficie de ataque desnecessaria.

**Sugestao:** Remover `https://www.googletagmanager.com` do CSP se nao houver planos de usar GTM. Se for para uso futuro, documentar com comentario.

---

## Boas praticas adicionais observadas (nao mencionadas no relatorio)

- **`form-action 'self'`** presente no CSP — evita que formularios submetam dados para dominios externos.
- **`base-uri 'self'`** presente — evita injeção de `<base>` tag para sequestro de URLs relativas.
- **`object-src 'none'`** presente — bloqueia plugins (Flash, Java, etc.).
- **Nenhum `eval()` ou `new Function()`** em todo `src/`.
- **Nenhum `postMessage`** no codigo do cliente — sem risco de vazamento cross-origin via eventos.
- **Nenhum `innerHTML`, `outerHTML` ou `document.write`** alem do `dangerouslySetInnerHTML` ja reportado.
- **Nenhum `<iframe>`, `<embed>` ou `<object>`** na aplicacao.
- **CSV export** usa `Blob` + `URL.createObjectURL` + `<a download>` — nao ha manipulacao de DOM com dados do usuario.
- **Seo component** usa `document.createElement` apenas para `<meta>` e `<link>` — dados controlados por props do componente, nao por entrada direta do usuario.

---

## Resumo da revisao

- **12 achados revisados**: 10 CONFIRMADO, 1 FALSO-POSITIVO (CLIENT-8), 2 SUBESTIMADO (CLIENT-7, CLIENT-12)
- **5 lacunas encontradas**: LACUNA-1 (Media, bloqueia correcao de CSP), LACUNA-2/3 (Baixa, SW messaging), LACUNA-4 (Informativa, headers SW), LACUNA-5 (Informativa, GTM nao usado)
- **Risco mais critico permanece**: CLIENT-1 + CLIENT-2 (XSS via Grazi com CSP ineficaz)
