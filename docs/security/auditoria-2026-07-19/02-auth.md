# Auditoria de Seguranca — Autenticacao & Sessao

**Data:** 2026-07-19
**Auditor:** Claude Code (Agente de seguranca)
**Dominio:** Autenticacao Firebase, gestao de sessao, controle de acesso, fluxo de exclusao
**Arquivos auditados:** `src/auth/`, `src/App.tsx`, `src/settings/accountDeletionService.ts`, `src/settings/accountDeletion.store.ts`, `src/firebase/config.ts`, `src/pages/AdminPage.tsx`, `src/layout/AppShell.tsx`, `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`, `src/pages/ForgotPasswordPage.tsx`, `src/pages/VerifyEmailPage.tsx`, `src/pages/JoinInvitePage.tsx`, `src/settings/LoginMethodsPage.tsx`, `functions-admin/src/index.ts`, `firestore.rules`

---

## Sumario Executivo

A arquitetura de autenticacao e bem estruturada e demonstra atencao a varios problemas reais ja enfrentados em producao (sessao zumbi, flag de exclusao, reautenticacao antes de deletar). Nove achados foram identificados: 3 de severidade Alta, 3 Media, 1 Baixa e 2 Informativos.

O problema mais critico e a **ausencia total de verificacao de `email_verified`** -- usuarios com email nao verificado podem acessar todas as funcionalidades do app sem restricao. O segundo ponto mais grave e a **protecao admin baseada unicamente em email**, que e um campo mutavel via `updateProfile` no Firebase Auth e cria uma superficie de ataque para privilege escalation.

---

## ACHADOS

---

### AUTH-01: Ausencia de verificacao de `email_verified` -- usuarios com email nao verificado tem acesso irrestrito

**Severidade:** Alta
**Local:** `src/auth/routeGuards.tsx:7-20` (RequireAuth), `src/auth/AuthContext.tsx:29` (`emailVerified: false` hardcoded no cache)
**Descricao:** O app envia email de verificacao no registro (`src/auth/authService.ts:30`), mas em nenhum lugar bloqueia acesso com base em `user.emailVerified`. O `RequireAuth` so checa se `user` nao e null. O `RequireOnboardingComplete` so checa `defaultWorkspaceId`. Nao ha guarda, middleware ou redirecionamento para usuarios que nunca verificaram o email. O cache de perfil (`buildCachedUserFromProfile`) define `emailVerified: false` fixo (linha 29), mas esse valor nunca e consultado em lugar nenhum.

**Cenario de exploracao:**
1. Atacante registra com email arbitrario (ou temporario) sem acesso a caixa postal
2. Nao verifica o email (ignora o link enviado)
3. Acessa todas as funcionalidades: onboarding, criar conta, cartoes, transacoes, metas, compartilhar espaco
4. O Firebase Auth marcara o usuario como `emailVerified: false`, mas o app nao bloqueia

**Impacto:** Permite uso fraudulento do app sem verificacao de identidade. Dificulta rastreamento e responsabilizacao. Para um app financeiro, e uma falha grave de KYC (Know Your Customer) basico.

**Solucao sugerida:** Adicionar verificacao de `user.emailVerified` no `RequireAuth` ou em um guard separado. Redirecionar usuarios nao verificados para `/verify-email` ate que confirmem o email. Bloquear operacoes criticas (compartilhar espaco, criar cartao) se email nao verificado.

**Confianca: 10/10**

---

### AUTH-02: Protecao admin baseada unicamente em email hardcoded -- risco de privilege escalation

**Severidade:** Alta
**Local:** `src/auth/routeGuards.tsx:5` (`ADMIN_EMAIL = 'a.thurcos@gmail.com'`), `src/pages/AdminPage.tsx` (usa o guard `RequireAdmin`), `firestore.rules:9-11` (`isAdmin()` checa `request.auth.token.email`), `functions-admin/src/index.ts:9,28-31` (`assertAdmin` checa `email !== ADMIN_EMAIL`)
**Descricao:** A verificacao de admin e feita comparando o email do usuario autenticado contra uma string fixa `'a.thurcos@gmail.com'`. Isso acontece em TRES camadas: (1) frontend (`routeGuards.tsx`), (2) Firestore rules (`isAdmin()`), (3) Cloud Function (`assertAdmin()`). O problema e que o **email no Firebase Auth pode ser alterado** -- embora nao seja trivial, existem cenarios onde um token cunhado com email alternativo ou um ataque ao provedor de identidade (Google) pode resultar em acesso admin.

**Cenario de exploracao:**
1. Um atacante que consiga registrar ou manipular um token Firebase com o email `a.thurcos@gmail.com` (ex.: falha no provedor OAuth, token adulterado, Session Cookie comprometido, CTF challenge) ganha acesso irrestrito a:
   - Rota `/admin` com painel de controle total
   - Todas as Firestore rules que chamam `isAdmin()` (leitura de `users/{uid}`, workspaces, etc.)
   - Todas as Cloud Functions admin (`adminDeleteUser`, `adminForceLogout`, `adminUnlinkWhatsappNumber`)

**Impacto:** Acesso administrativo total ao sistema por um unico ponto de falha -- a string de email. Exposicao de dados de todos os usuarios, possibilidade de deletar contas arbitrariamente, forcar logout em massa.

**Solucao sugerida:** Usar UID do Firebase Auth em vez de email, ou uma verificacao multicamada (email + UID + custom claim). Custom claims (`auth.token.admin === true`) via Admin SDK seriam o padrao recomendado pelo Firebase. Se for manter email, ao menos verificar `token.email_verified` nas rules e functions, e usar uma lista de emails autorizados em vez de um unico valor.

**Confianca: 9/10** (reducao devido a dificuldade de exploracao pratica, mas o risco arquitetural e real)

---

### AUTH-03: Sessao zumbi residual no fluxo de exclusao de conta

**Severidade:** Alta
**Local:** `src/auth/authService.ts:50-62` (`logout`), `src/settings/accountDeletionService.ts:195-201` (tratamento de erro com `logout()`)
**Descricao:** O fluxo de exclusao (`runAccountDeletion`) trata corretamente o caso em que `deleteAuthenticatedUser` falha -- faz `logout()` para evitar sessao zumbi. Porem, a funcao `logout()` em `authService.ts` chama `signOut(auth)` que limpa a sessao do Firebase Auth, mas mantem o **profile cache no localStorage** (`zerou.auth.profileCache.v1`) se `clearLocalCache` nao for passado como true. No `LoginMethodsPage.tsx` linha 98, o logout forçado da exclusao chama `logout()` sem opcoes:

```ts
logout: () => logout()
```

Isso significa que, se `deleteAuthenticatedUser` falhar e o `logout()` for acionado, o cache de perfil permanece no localStorage. Na proxima vez que o app iniciar, o `AuthContext.tsx` vai ler `readLastCachedProfile()` (linha 58-60), construir um `buildCachedUserFromProfile()` e mostrar o app como se o usuario ainda estivesse logado, ate que o `onAuthStateChanged` dispare e confirme que a sessao morreu. Ha uma janela onde o usuario ve o app "funcionando" com dados fantasmas.

**Cenario de exploracao:**
1. Usuario inicia exclusao de conta
2. `deleteAccountData()` apaga todos os dados do Firestore
3. `deleteAuthenticatedUser()` falha (ex.: perda de rede, timeout)
4. `logout()` e chamado sem `clearLocalCache: true`
5. Cache de perfil persiste no localStorage
6. Usuario abre o app novamente -- por ate 500ms (AUTH_BOOT_TIMEOUT), ve o app com base no cache, mas o `onAuthStateChanged` eventualmente derruba a sessao

**Impacto:** Confusao para o usuario que tentou excluir a conta e ve o app funcionando de novo temporariamente. Dados financeiros ja foram apagados (passo 2 executou), entao nao ha risco de perda de dados, mas o usuario pode pensar que a exclusao falhou e tentar novamente, gerando multiplas chamadas.

**Solucao sugerida:** No `LoginMethodsPage.tsx`, passar `{ clearLocalCache: true }` para `logout()` no catch de exclusao, ou fazer `clearCachedProfiles()` explicitamente antes de chamar `logout()`.

**Confianca: 10/10**

---

### AUTH-04: Cache de sessao (`buildCachedUserFromProfile`) e um User artificial com 0 capacidades reais

**Severidade:** Media
**Local:** `src/auth/AuthContext.tsx:24-51`
**Descricao:** A funcao `buildCachedUserFromProfile` constroi um objeto `User` artificial com implementacoes vazias (`getIdToken: async () => ''`, `delete: async () => undefined`, `reload: async () => undefined`) e `emailVerified: false` fixo. Isso e usado como fallback nos primeiros 500ms de boot enquanto o Firebase Auth nao responde. O problema e que:
1. `getIdToken` retorna string vazia -- se qualquer codigo tentar usar o token do usuario cacheado para chamar uma Cloud Function, vai falhar (as functions chamam `assertAuthenticated` que requer um UID real do token, nao um string vazia)
2. `emailVerified` e `false` fixo, mas como o app nunca checa `emailVerified` (AUTH-01), isso nao e um problema hoje, mas se no futuro alguma logica depender desse campo, o cache vai sempre reportar false
3. O objeto e marcado como `isAnonymous: false`, mesmo sendo um pseudo-usuario

**Cenario de exploracao:** Nao ha exploracao direta, mas a natureza artificial desse objeto pode causar bugs. Exemplo: se alguma pagina chamar `user.getIdToken()` para enviar a uma Cloud Function no momento em que `authFromCache` e true, a chamada falha silenciosamente.

**Impacto:** Potencial para bugs dificeis de diagnosticar. Se o cache for usado por mais tempo que os 500ms previstos (ex.: Firebase Auth esta lento ou offline), funcionalidades que dependem de token real (Cloud Functions, algumas operacoes sensiveis) quebram silenciosamente.

**Solucao sugerida:** Nao expor o objeto artificial como `User`. Separar o estado de "cache loading" do estado de "autenticado", talvez com um tipo `AuthState = { status: 'loading' | 'cached' | 'authenticated' | 'unauthenticated' }` para que componentes possam saber se o usuario e real ou artificial.

**Confianca: 8/10**

---

### AUTH-05: Rota `/verify-email` fora do guard `RequireOnboardingComplete`, permitindo acesso durante onboarding sem restricao a funcionalidades

**Severidade:** Media
**Local:** `src/App.tsx:81` (`/verify-email` esta dentro de `RequireAuth` mas fora de `RequireOnboardingComplete` e tambem fora de `AppShell`)
**Descricao:** A rota `/verify-email` e protegida apenas por `RequireAuth` (linha 77-81), mas esta fora do `RequireOnboardingComplete` (na linha 84). A arvore de rotas mostra:

```
<Route element={<RequireAuth />}>
  <Route element={<RequireAdmin />}>...</Route>
  <Route path="/verify-email" element={<VerifyEmailPage />} />    ← aqui
  <Route path="/app" element={<AppShell />}>
    <Route path="onboarding" element={<OnboardingPage />} />
    <Route element={<RequireOnboardingComplete />}>...</Route>
  </Route>
</Route>
```

Isso significa que `/verify-email` e acessivel sem `AppShell` (sidebar), o que e intencional (layout limpo). Porem, a combinacao com AUTH-01 significa que a pagina de "Verificar email" e puramente informativa e nao bloqueia nada -- o usuario pode simplesmente clicar "Continuar" (linha 48 de VerifyEmailPage) e pular para o app sem verificar.

**Cenario de exploracao:** Atacante registra, e enviado para `/verify-email` (ou descobre a rota), simplesmente clica "Continuar" e vai para o app sem email verificado.

**Impacto:** A pagina de verificacao e ineficaz como barreira de seguranca.

**Solucao sugerida:** Implementar a verificacao real (AUTH-01) que redireciona para `/verify-email` e so libera acesso apos `emailVerified === true`.

**Confianca: 10/10**

---

### AUTH-06: `sendPasswordResetEmail` expoe enumeracao de email (Email Enumeration)

**Severidade:** Media
**Local:** `src/pages/ForgotPasswordPage.tsx:28-41`, `src/auth/authService.ts:46-48`
**Descricao:** A funcao `sendPasswordResetEmail` do Firebase Auth, por padrao, retorna sucesso mesmo se o email nao existir (para prevenir enumeracao), mas o tratamento de erro no `ForgotPasswordPage` captura exceptions e pode vazar informacao. O codigo atual chama `getAuthErrorMessage(error)` que pode expor erros como `auth/user-not-found` -- que atualmente e mapeado para uma mensagem generica ("Confira email e senha"), mas se no futuro esse mapeamento mudar ou se houver diferenca na mensagem entre "email existe" e "email nao existe" (ex.: o Firebase retorna erro em alguns casos), a enumeracao se torna possivel.

Olhando o `getAuthErrorMessage` em `src/auth/authErrors.ts`, o codigo atual mapeia `auth/user-not-found` junto com `auth/wrong-password` e `auth/invalid-credential` para a mesma mensagem generica, entao hoje nao ha vazamento. Porem, o `catch` generico no `ForgotPassword` captura `sendPasswordResetEmail` que, na implementacao do Firebase, nao lanca erro para email inexistente (por design anti-enumeracao). Entao o risco e baixo no momento.

**Cenario de exploracao:** Se o comportamento do Firebase mudar ou se um erro inesperado for lancado, o `getAuthErrorMessage` pode vazar informacao sobre a existencia do email.

**Impacto:** Baixo hoje, mas e um ponto de atencao.

**Solucao sugerida:** Manter o mapeamento atual (todas as mensagens genericas). Nao revelar diferenca entre "email nao encontrado" e "senha errada". O `ForgotPasswordPage` ja faz isso corretamente hoje.

**Confianca: 5/10**

---

### AUTH-07: Logout nao limpa o cache do Firestore IndexedDB na exclusao de conta (apenas no logout voluntario)

**Severidade:** Media
**Local:** `src/settings/accountDeletionService.ts:195-201`, `src/auth/authService.ts:50-62`
**Descricao:** O `logout()` em `authService.ts` quando chamado com `clearLocalCache: true` faz:
1. `signOut(auth)` -- limpa sessao Firebase Auth
2. `clearCachedProfiles()` -- limpa localStorage
3. `terminate(db)` -- fecha conexao Firestore
4. `clearIndexedDbPersistence(db)` -- limpa cache offline do Firestore
5. `window.location.reload()` -- recarrega a pagina

No fluxo de exclusao de conta em `LoginMethodsPage.tsx`, se `deleteAuthenticatedUser` falhar, o `logout()` e chamado SEM `clearLocalCache`. Porem, a exclusao bem-sucedida termina com `window.location.assign('/')` (linha 100), que causa reload. A questao e: se o `deleteAccountData()` ja apagou os dados do Firestore (servidor), mas o `deleteAuthenticatedUser` falha, o cache local do Firestore (IndexedDB) pode ter dados residuais. O `logout()` sem `clearLocalCache` nao limpa o IndexedDB.

Alem disso, no `LogoutMethodsPage`, o `deleteAuthenticatedUser` e a ultima chamada -- se falha, o `logout()` sem cache e chamado, mas `terminate(db)` + `clearIndexedDbPersistence(db)` nao sao executados.

**Cenario de exploracao:**
1. Exclusao inicia, dados do Firestore sao apagados
2. `deleteAuthenticatedUser` falha por erro de rede
3. `logout()` e chamado sem cache clear
4. Dados residuais no IndexedDB persistem
5. Se o usuario criar uma nova conta no mesmo dispositivo, os dados velhos do cache do Firestore podem aparecer temporariamente ate sincronizarem (ou nunca, se `persistentLocalCache` mantiver documentos orfaos)

**Impacto:** Possivel vazamento de dados financeiros entre contas (dados da conta antiga aparecendo na nova), mesmo que temporario.

**Solucao sugerida:** No `LoginMethodsPage.tsx`, ao inves de `logout()`, chamar `logout({ clearLocalCache: true })` no catch. Ou, ainda melhor, adicionar `clearCachedProfiles()` e `clearIndexedDbPersistence()` explicitamente no fluxo de erro de exclusao.

**Confianca: 7/10**

---

### AUTH-08: Google OAuth sem validacao de `hd` (hosted domain) -- aceita qualquer conta Google

**Severidade:** Baixa
**Local:** `src/auth/authService.ts:23-24`, `src/pages/LoginPage.tsx:46-58`
**Descricao:** O login com Google usa `signInWithPopup` sem restricao de dominio. O provedor configurado na linha 24 define apenas `prompt: 'select_account'`, sem filtro de `hd` (hosted domain). Como o app e financeiro pessoal (nao corporativo), isso e aceitavel e intencional -- usuarios devem poder usar qualquer conta Google.

Nao ha problema real de seguranca aqui, apenas uma observacao: se no futuro o app quiser limitar a contas Google corporativas de um dominio especifico (ex.: `@granativa.com.br` para acesso administrativo), seria necessario adicionar `googleProvider.setCustomParameters({ hd: 'granativa.com.br' })`.

**Impacto:** Nenhum. Apenas informativo.

**Solucao sugerida:** Nao requer acao.

**Confianca: 2/10**

---

### AUTH-09: `fireWrite` engole erros em producao -- erros de autenticacao/regras podem passar despercebidos

**Severidade:** Informativa
**Local:** `src/firebase/fireWrite.ts:19-29`
**Descricao:** A funcao `fireWrite` silencia erros de escrita no Firestore em producao (apenas loga no console em dev). Conforme documentado na CLAUDE.md, isso e uma escolha arquitetural deliberada (offline-first: erros nao devem travar a UI). Porem, isso significa que se um usuario mal-intencionado tentar escrever dados proibidos pelas regras, ele nao recebe feedback -- a operacao parece suceder (cache local) e o erro so aparece no reload da pagina.

Do ponto de vista de seguranca, isso e NEUTRO porque o Firestore server-side ja rejeita corretamente (as regras sao aplicadas), e o usuario mal-intencionado nao ganha nada com a operacao silenciada. A unica preocupacao e de UX/debugging, nao de seguranca.

No entanto, a CLAUDE.md menciona explicitamente que essa mesma caracteristica ja escondeu **dois bugs de seguranca reais** por semanas -- onde regras desatualizadas rejeitavam dados que o frontend tentava escrever, mas o erro era silenciado. O problema nao e o `fireWrite` em si, mas o **processo de deploy** que permite que tipos novos no frontend nao sejam sincronizados com rules.

**Impacto:** Nao e uma vulnerabilidade em si, mas mascara bugs de seguranca que seriam detectados mais cedo com erro visivel.

**Solucao sugerida:** Manter o `fireWrite` como esta (e uma escolha de design), mas garantir que a REGRA PRINCIPAL da CLAUDE.md (tres pontos de sincronia para enums) seja seguida em todo commit que introduz novos campos/valores. Considerar adicionar um logging mais visivel no `onSnapshot` quando documentos sao rejeitados ou revertidos (pois isso indicaria que o write local foi aceito mas o servidor rejeitou).

**Confianca: 10/10** (como informativo)

---

## Matriz de Severidade

| ID | Titulo | Severidade |
|---|---|---|
| AUTH-01 | Ausencia de verificacao email_verified | **Alta** |
| AUTH-02 | Protecao admin por email hardcoded | **Alta** |
| AUTH-03 | Sessao zumbi residual na exclusao | **Alta** |
| AUTH-04 | Cache User artificial com 0 capacidades | **Media** |
| AUTH-05 | /verify-email sem bloqueio real | **Media** |
| AUTH-06 | Potencial enumeracao de email | **Media** |
| AUTH-07 | Cache Firestore IndexedDB residual | **Media** |
| AUTH-08 | Google OAuth sem hd | **Baixa** |
| AUTH-09 | fireWrite silencia erros (informativo) | **Informativa** |

---

## Resumo por camada

### Guards de rota (`routeGuards.tsx`)
- `RequireAuth`: funcional, mas nao checa `emailVerified`
- `RequireOnboardingComplete`: funcional, com protecao contra race condition da exclusao (flag `isDeleting`)
- `RequireAdmin`: frágil -- baseado em email hardcoded
- `PublicOnlyRoute`: funcional para login/register/forgot-password

### Logout (`authService.ts`, `AppShell.tsx`)
- Logout voluntario: correto (limpa cache com `clearLocalCache: true`)
- Logout forçado na exclusao: NAO limpa cache, criando sessao zumbi residual
- Tratamento de erro na exclusao: correto (força logout), mas sem limpeza de cache

### Exclusao de conta (`accountDeletionService.ts`, `LoginMethodsPage.tsx`)
- Ordem correta: reautentica -> apaga dados -> deleta usuario Auth
- Tratamento de falha de `deleteUser`: correto (força logout)
- Unlink WhatsApp: correto (best-effort, nao bloqueia)
- Cleanup de workspace de casal: correto (marca como `removed`)
- Flag `isDeleting` no Zustand: correta (previne redirect ao onboarding)

### Cache de sessao (`profileCache.ts`, `AuthContext.tsx`)
- Cache de boot rapido com fallback gracioso
- Timeouts de 500ms/1800ms para evitar espera infinita
- Objeto User artificial e frágil (AUTH-04)

### Admin (`AdminPage.tsx`, `functions-admin/src/index.ts`, `firestore.rules`)
- Tres camadas validam o mesmo email hardcoded
- Frontend bloqueia com redirect, mas codigo do frontend e contornavel
- Firestore rules e Cloud Functions sao a defesa real, mas compartilham o mesmo ponto de falha (email)

### Tratamento de erro (`authErrors.ts`, `getUserFacingErrorMessage`)
- Boa cobertura de codigos de erro Firebase
- Mensagens amigaveis sem vazamento tecnico
- Sem vazamento de enumeracao de email hoje (AUTH-06 e baixo risco)

---

## Acoes recomendadas (priorizadas)

1. **Implementar verificacao de `emailVerified`** em rota guard ou middleware. Usuarios nao verificados devem ser redirecionados para `/verify-email` e ter funcionalidades limitadas ate confirmarem o email. [Corrige AUTH-01, AUTH-05]

2. **Substituir verificacao admin por email para custom claims** no Firebase Auth (`auth.token.admin === true` gerenciado via Admin SDK) ou, no minimo, adicionar `emailVerified` a verificacao e usar UID como fallback. [Corrige AUTH-02]

3. **Passar `{ clearLocalCache: true }` para `logout()`** no catch de exclusao de conta em `LoginMethodsPage.tsx`, e limpar IndexedDB explicitamente. [Corrige AUTH-03, AUTH-07]

4. **Separar estado de autenticacao** em tipos distintos (`loading | cached | authenticated | unauthenticated`) para que componentes saibam se o `User` e real ou artificial. [Corrige AUTH-04]
