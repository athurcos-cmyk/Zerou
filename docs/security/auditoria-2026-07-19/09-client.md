# Auditoria de Seguranca — Cliente (Web)

Data: 2026-07-19
Escopo: src/ (XSS, CSP, Service Worker, localStorage, auth) + vercel.json + index.html

---

## CLIENT-1: dangerouslySetInnerHTML sem sanitizacao na Grazi (AssistantPage)

**Severidade:** Alta
**Local:** `src/pages/AssistantPage.tsx` (linhas 13-17, 112)
**Confianca:** 9

**Descricao:** A funcao `renderAssistantMessage()` converte marcacao markdown-simples ( `**negrito**` → `<strong>`, `*italico*` → `<em>`, `\n` → `<br/>` ) e o resultado e injetado via `dangerouslySetInnerHTML` na linha 112. O conteudo (`msg.content`) e a resposta textual da Cloud Function `financialAssistantChat`, que por sua vez e gerada pelo modelo DeepSeek. Nao ha nenhuma etapa de sanitizacao (DOMPurify, sanitize-html, ou qualquer outra) entre a resposta da Cloud Function e o `__html`.

**Cenario / PoC:** Um atacante que consiga comprometer a Cloud Function (ex.: via injecao de prompt no DeepSeek, ou vulnerabilidade no codigo da function que ecoa dados do usuario sem escape) pode fazer a Grazi devolver uma resposta contendo `<script>...</script>` ou `<img onerror=...>`. Como o CSP inclui `'unsafe-inline'` em `script-src` (ver CLIENT-2), esse script executaria no contexto do app, dando acesso completo a cookies, localStorage, IndexedDB (Firestore cache), tokens Firebase e dados financeiros.

**Impacto:** XSS completo no contexto do app autenticado. Roubo de sessao, exfiltracao de dados financeiros (saldos, faturas, contas), leitura/escrita no Firestore como o usuario vitima.

**Sugestao de correcao:**
1. Sanitizar o HTML gerado com DOMPurify antes do `dangerouslySetInnerHTML`: `DOMPurify.sanitize(renderAssistantMessage(msg.content))`
2. Como alternativa mais segura, substituir o `dangerouslySetInnerHTML` por renderizacao segura: parsear o markdown em tokens React (`<strong>`, `<em>`, `<br/>`) em vez de injetar HTML cru.
3. Mesmo sanitizando, considerar remover `'unsafe-inline'` do CSP (ver CLIENT-2) como defesa em profundidade.

**Nota:** O `msg.content` da mensagem do *usuario* e renderizado via `<p>{msg.content}</p>` — React faz escape automatico, entao esta seguro.

---

## CLIENT-2: CSP com 'unsafe-inline' e sem strict-dynamic nem nonce

**Severidade:** Alta
**Local:** `vercel.json` (linha 34)
**Confianca:** 10

**Descricao:** A diretiva `script-src` da CSP contem `'unsafe-inline'` sem `strict-dynamic` e sem `nonce`. Isso significa que QUALQUER inline script no HTML executara, mesmo que nao tenha sido gerado pelo desenvolvedor. Combinado com o XSS em potencial da Grazi (CLIENT-1), um atacante pode executar JavaScript arbitrario mesmo que a injecao seja inline.

A CSP atual:
```
script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googletagmanager.com https://apis.google.com
```

**Impacto:** Anula a protecao que o CSP ofereceria contra XSS. Qualquer injecao de `<script>` na pagina executa.

**Sugestao de correcao:**
- Substituir `'unsafe-inline'` por um mecanismo de `nonce` ou `strict-dynamic` para scripts inline. O script inline no `index.html` (que le o localStorage para o tema) precisa ser abrangido por essa mecanismo.
- Adicionar `'strict-dynamic'` e listar apenas hashes/nonces para scripts inline conhecidos.
- `https://www.googletagmanager.com` — verificar se realmente e necessario (Google Tag Manager). Se sim, manter, mas sem `'unsafe-inline'`.

---

## CLIENT-3: Ausencia de frame-ancestors na CSP (clickjacking)

**Severidade:** Media
**Local:** `vercel.json` (linha 34)
**Confianca:** 10

**Descricao:** A CSP nao possui a diretiva `frame-ancestors`. Isso permite que qualquer site incorpore o Zerou/Granativa em um iframe, abrindo a porta para ataques de clickjacking: um site malicioso sobrepoe botoes/links invisiveis do app sobre uma interface atraente e engana o usuario a clicar em acoes nao intencionais.

**Cenario / PoC:** Um atacante cria um site com um iframe transparente apontando para `https://granativa.com.br/app/...` sobreposto a um jogo ou promocao. Quando o usuario clica em "Ganhe um premio", na verdade esta clicando em "Excluir conta" ou "Transferir dinheiro" dentro do app.

**Impacto:** Acoes nao intencionais do usuario dentro do app autenticado.

**Sugestao de correcao:** Adicionar `frame-ancestors 'none'` a CSP. Isso bloqueia qualquer tentativa de iframe.

---

## CLIENT-4: Ausencia de Strict-Transport-Security (HSTS)

**Severidade:** Media
**Local:** `vercel.json` (todas as rotas)
**Confianca:** 10

**Descricao:** O header `Strict-Transport-Security` nao esta presente em nenhuma rota do `vercel.json`. Sem HSTS, um atacante com acesso a rede (Wi-Fi publico, MITM) pode fazer downgrade da conexao para HTTP e interceptar requisicoes, mesmo que o servidor normalmente redirecione para HTTPS. A primeira requisicao de um usuario nunca visitou o site antes e especialmente vulneravel.

**Impacto:** Potencial para ataque MITM na primeira visita ou se o usuario digitar manualmente `http://`.

**Sugestao de correcao:** Adicionar a todas as rotas:
```json
{
  "key": "Strict-Transport-Security",
  "value": "max-age=63072000; includeSubDomains; preload"
}
```
(2 anos, com subdominios e preload). NOTA: Testar em staging primeiro, pois HSTS preload e irreversivel.

---

## CLIENT-5: Ausencia de Permissions-Policy

**Severidade:** Baixa
**Local:** `vercel.json` (todas as rotas)
**Confianca:** 10

**Descricao:** Nenhum header `Permissions-Policy` (antigo `Feature-Policy`) e definido. Isso significa que recursos sensiveis como camera, microfone, geolocalizacao, sensor de luz, acelerometro, etc. estao disponiveis para o JavaScript do app por padrao (embora o app nao os utilize).

**Impacto:** Baixo — o app nao usa nenhuma API sensivel. Mas nao ha defesa em profundidade contra um eventual XSS que queira abusar dessas APIs.

**Sugestao de correcao:** Adicionar:
```
Permissions-Policy: camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=(), magnetometer=()
```

---

## CLIENT-6: Ausencia de X-Frame-Options (defesa redundante)

**Severidade:** Baixa
**Local:** `vercel.json`
**Confianca:** 10

**Descricao:** O header `X-Frame-Options` nao esta presente. Embora `frame-ancestors` (CLIENT-3) seja o padrao moderno, `X-Frame-Options` ainda e respeitado por navegadores mais antigos que ignoram CSP.

**Impacto:** Navegadores antigos sem protecao contra clickjacking.

**Sugestao de correcao:** Adicionar `X-Frame-Options: DENY` nas rotas gerais (ou `SAMEORIGIN` se houver necessidade legitima de iframe, o que nao parece ser o caso).

---

## CLIENT-7: Cleanup incompleto de localStorage no logout

**Severidade:** Media
**Local:** `src/auth/authService.ts` (linhas 50-61), `src/auth/profileCache.ts`
**Confianca:** 8

**Descricao:** A funcao `logout()` em `authService.ts` limpa o cache de perfil (`clearCachedProfiles`) e o IndexedDB do Firestore apenas quando `options.clearLocalCache` e `true`. Porem, varios outros dados em localStorage nao sao limpos em nenhum cenario de logout:
- `dashboardViewCache` — contem saldos de contas, totais de receitas/despesas, transacoes recentes
- `budgetAlertCache` — alertas de orcamento descartados
- `pushTokenCache` — tokens FCM
- `zerou.welcomeTour.seen` — flag de tour visto
- `zerou.pwaInstallDismissed` — flag de PWA
- `PREPARED_DEFAULT_CATEGORIES_KEY` — workspaces com categorias padrao
- `zerou.cookieConsent` — preferencia de cookies
- `pendingInvite` — codigo de convite pendente

Se o usuario faz logout em um dispositivo compartilhado (cenario incomum para um app financeiro pessoal, mas possivel), o proximo usuario que abrir o app (ou um atacante com acesso ao navegador) pode ler esses dados do localStorage.

**Impacto:** Vazamento de dados financeiros (saldos, valores de transacoes) entre sessoes no mesmo navegador/dispositivo. Baixa probabilidade (app pessoal, uso tipico em dispositivo privado), mas impacto medio se ocorrer.

**Sugestao de correcao:** Centralizar a limpeza de localStorage em uma funcao que percorra todas as chaves com prefixo `zerou.` e as remova durante o logout padrao, ou pelo menos quando `clearLocalCache` for `true`. Adicionar documentacao sobre quais chaves sao limpas.

---

## CLIENT-8: Inline script no index.html com dados do localStorage

**Severidade:** Baixa
**Local:** `index.html` (linhas 31-47)
**Confianca:** 7

**Descricao:** O `index.html` contem um inline script que le `themeMode` e `themeId` do localStorage e os aplica como `data-theme` e `data-theme-mode` no `<html>`. Embora haja uma whitelist (`validThemes.includes(...)`) que restringe os valores de `themeId`, nao ha whitelist para `themeMode`. Um valor inesperado em `themeMode` (ex.: gravado por XSS ou extensao maliciosa) seria aplicado diretamente como atributo `data-theme-mode` no elemento HTML. Isso e de baixo risco porque:
1. O valor so vai para um atributo `data-*`, nao para HTML direto
2. Nao ha CSS ou JS que interprete `data-theme-mode` de forma perigosa
3. O script executa antes do React montar, minimizando superficie

**Impacto:** Teorico — possivel manipulacao de atributo HTML. Sem consequencia pratica identificada.

**Sugestao de correcao:** Incluir `themeMode` na whitelist: `const validModes = ['manual', 'system'];` (ja existe na linha 34 mas nao e usada na validacao — apenas validar antes de usar).

---

## CLIENT-9: Dados financeiros em localStorage sem expiracao

**Severidade:** Informativa
**Local:** `src/finance/dashboardViewCache.ts`
**Confianca:** 7

**Descricao:** O `dashboardViewCache` armazena em `localStorage` o snapshot completo do Dashboard: `totalBalanceCents`, `totalIncomeCents`, `totalExpenseCents`, `availableCents`, `committedCents`, e ate 5 transacoes recentes com descricao, valor e tipo. Esse cache nao tem data de expiracao — uma vez escrito, permanece ate ser sobrescrito ou removido manualmente. Se o usuario para de usar o app por meses e depois abre, o cache ainda estara la.

**Impacto:** Dados financeiros persistem indefinidamente no navegador. Riscos: (1) invasor com acesso ao navegador ve dados antigos; (2) dados desatualizados podem ser exibidos se o Firestore estiver offline e o cache muito antigo (o codigo tenta ler do Firestore primeiro, mas em fallback offline usa o cache).

**Sugestao de correcao:** Nao critico — o cache e um acelerador de exibicao, e o Firestore e a fonte da verdade. Opcional: adicionar um timestamp de criacao e ignorar caches com mais de N dias.

---

## CLIENT-10: Service Worker sem escopo restrito

**Severidade:** Informativa
**Local:** `vite.config.ts` (VitePWA config, linhas 63-121)
**Confianca:** 8

**Descricao:** O Service Worker gerado pelo `vite-plugin-pwa` tem escopo `/` (scope: '/'), o que significa que ele controla todas as paginas do dominio. Com `navigateFallback: '/index.html'`, qualquer URL que nao corresponda a um asset estatico cai no `index.html`. Isso e padrao para SPAs e aceitavel, mas significa que o SW tem controle total sobre a navegacao.

O `registerType: 'autoUpdate'` com `skipWaiting: true` e `clientsClaim: true` faz com que novas versoes do SW assumam o controle imediatamente — bom para atualizacoes, mas significa que um SW malicioso (se conseguisse ser implantado via Vercel) assumiria controle instantaneamente.

O Firebase Messaging SW (`firebase-messaging-sw.js`) e gerado em build time e injeta as chaves Firebase no codigo — como o arquivo esta em `public/`, ele e servido como estatico e nao passa pelo hash de precaching do Workbox.

**Impacto:** Nenhum risco identificado no cenario atual. O SW e controlado pelo mesmo pipeline de deploy do app.

**Sugestao de correcao:** Nenhuma acao imediata. Apenas documentar que o SW merece atencao em futuras auditorias.

---

## CLIENT-11: API key do Firebase exposta no bundle do cliente

**Severidade:** Informativa
**Local:** `src/firebase/config.ts`
**Confianca:** 10

**Descricao:** A `apiKey` do Firebase e injetada via variavel de ambiente (`VITE_FIREBASE_API_KEY`) e exposta no bundle JavaScript do cliente. Isso e inevitavel e esperado para apps Firebase que usam autenticacao client-side — a API key nao e um segredo, e sim um identificador publico do projeto. A protecao real vem das Firestore Security Rules e dos provedores de autenticacao configurados.

**Impacto:** Nenhum — comportamento normal de Firebase. Registrado apenas para conscientizacao.

**Sugestao de correcao:** Nenhuma. Manter as Security Rules restritivas e revisa-las sempre que novos campos/enums forem adicionados.

---

## CLIENT-12: Vite expoe configuracao do Firebase no source map

**Severidade:** Informativa
**Local:** `src/firebase/config.ts` (linhas 30-38)
**Confianca:** 10

**Descricao:** Todas as variaveis `VITE_FIREBASE_*` (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId) estao no codigo fonte do bundle. Isso e normal para Firebase client-side. A configuracao do Firebase Messaging SW tambem e gerada com esses mesmos valores (`vite.config.ts` linha 14-21). Verificar se os source maps nao estao sendo servidos em producao (Vercel geralmente nao serve `.map`).

**Impacto:** Nenhum — documentacao. Apenas confirmar que source maps estao desabilitados em producao.

**Sugestao de correcao:** Verificar `vite.config.ts` para garantir que `sourcemap: false` em producao.

---

## Resumo

| ID | Titulo | Severidade | Confianca |
|---|---|---|---|
| CLIENT-1 | dangerouslySetInnerHTML sem sanitizacao na Grazi | Alta | 9 |
| CLIENT-2 | CSP com 'unsafe-inline' e sem strict-dynamic/nonce | Alta | 10 |
| CLIENT-3 | Ausencia de frame-ancestors na CSP (clickjacking) | Media | 10 |
| CLIENT-4 | Ausencia de Strict-Transport-Security (HSTS) | Media | 10 |
| CLIENT-7 | Cleanup incompleto de localStorage no logout | Media | 8 |
| CLIENT-5 | Ausencia de Permissions-Policy | Baixa | 10 |
| CLIENT-6 | Ausencia de X-Frame-Options | Baixa | 10 |
| CLIENT-8 | Inline script no index.html com dados do localStorage | Baixa | 7 |
| CLIENT-9 | Dados financeiros em localStorage sem expiracao | Informativa | 7 |
| CLIENT-10 | Service Worker sem escopo restrito | Informativa | 8 |
| CLIENT-11 | API key do Firebase exposta no bundle | Informativa | 10 |
| CLIENT-12 | Vite expoe configuracao do Firebase no source map | Informativa | 10 |

**Nao encontrados:** `eval()`, `new Function()`, `document.write()`, `innerHTML`/`outerHTML` (alem do `dangerouslySetInnerHTML` ja reportado), `postMessage`, `sessionStorage`.

**Boas praticas observadas:**
- Sem `eval` ou `new Function` em todo `src/`
- Sem manipulacao de DOM com strings (`innerHTML`, `outerHTML`)
- Event handlers React usam camelCase (onClick, etc.) — sem atributos HTML perigosos
- `object-src: 'none'` na CSP — bloqueia plugins
- Service Worker com `Cache-Control: no-cache, no-store, must-revalidate`
- Auth tokens gerenciados internamente pelo SDK Firebase (IndexedDB), nunca em localStorage explicito
- Landing page sem XSS
- `useParams` usado apenas para lookup de dados, nao para renderizacao direta de strings de URL
