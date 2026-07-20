# Revisao de Auditoria (Camada 2) — Autenticacao & Sessao

**Data:** 2026-07-19
**Revisor:** Claude Code (Auditoria Camada 2)
**Documento revisado:** `docs/security/auditoria-2026-07-19/02-auth.md`
**Arquivos abertos para validacao:** `src/auth/AuthContext.tsx`, `src/auth/routeGuards.tsx`, `src/auth/authService.ts`, `src/auth/authErrors.ts`, `src/auth/profileCache.ts`, `src/settings/accountDeletionService.ts`, `src/settings/accountDeletion.store.ts`, `src/settings/LoginMethodsPage.tsx`, `src/firebase/config.ts`, `src/firebase/fireWrite.ts`, `src/App.tsx`, `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`, `src/pages/VerifyEmailPage.tsx`, `src/pages/ForgotPasswordPage.tsx`, `src/pages/AdminPage.tsx`, `src/layout/AppShell.tsx`, `src/onboarding/OnboardingPage.tsx`, `functions-admin/src/index.ts`, `firestore.rules`

---

## Metodo de revisao

Cada achado foi classificado como:
- **CONFIRMADO** — a analise do auditor procede e a vulnerabilidade/diagnostico existe
- **FALSO-POSITIVO** — a analise do auditor esta incorreta; nao ha vulnerabilidade
- **SUBESTIMADO** — o risco e maior do que o auditor descreveu
- **SUPERESTIMADO** — o risco e menor do que o auditor descreveu

Alem da classificacao, cada achado teve sua PoC validada contra o codigo-fonte real, buscando lacunas na analise. Ao final, uma secao de **Lacunas** documenta pontos que o auditor nao identificou.

---

## Review dos achados

---

### AUTH-01: Ausencia de verificacao de `email_verified`

**Classificacao: CONFIRMADO**

**Validacao da PoC:**

O auditor descreve corretamente o cenario:

1. `RequireAuth` (routeGuards.tsx:7-20) checa apenas `!user`, nunca `user.emailVerified`. **Confirmado.**
2. `RequireOnboardingComplete` (routeGuards.tsx:22-40) checa apenas `profile?.defaultWorkspaceId`, nunca `emailVerified`. **Confirmado.**
3. `buildCachedUserFromProfile` (AuthContext.tsx:29) define `emailVerified: false` fixo, mas esse valor nunca e consultado em lugar nenhum. **Confirmado.**
4. O fluxo de registro (authService.ts:26-32) chama `sendEmailVerification` mas o resultado nunca e cobrado. **Confirmado.**
5. Nao existe guard, middleware, redirect ou bloqueio para usuarios com email nao verificado em nenhuma rota do app. **Confirmado.**

A exploracao pratica e direta: o usuario se registra com email/senha e e redirecionado para `/app/onboarding` (RegisterPage.tsx:39) sem nunca ter confirmado o email. O `/verify-email` existe como rota mas nunca e mostrada automaticamente apos o registro (ver Lacuna 2).

**Observacao adicional:** Usuarios que entram com Google OAuth tem `emailVerified` como `true` por padrao (Google ja verifica). Portanto, este achado atinge primariamente usuarios de registro por email/senha. O auditor nao fez essa distincao, mas ela nao diminui o impacto.

**Veredito:** Achado real, bem documentado. Impacto adequado (Alta).

---

### AUTH-02: Protecao admin baseada unicamente em email hardcoded

**Classificacao: CONFIRMADO**

**Validacao da PoC:**

1. `ADMIN_EMAIL = 'a.thurcos@gmail.com'` em routeGuards.tsx:5. **Confirmado.**
2. `RequireAdmin` (routeGuards.tsx:42-47) compara `user.email !== ADMIN_EMAIL`. **Confirmado.** (Nota: o guard front-end e contornavel por natureza -- e React Router, nao uma barreira server-side.)
3. `isAdmin()` em firestore.rules:9-11 compara `request.auth.token.email == 'a.thurcos@gmail.com'`. **Confirmado.**
4. `assertAdmin` em functions-admin/src/index.ts:28-31 compara `email !== ADMIN_EMAIL`. **Confirmado.**

A auditoria identifica corretamente os tres pontos de validacao. A exploracao pratica e dificil (exige contornar a unicidade de email do Firebase Auth), mas o risco arquitetural e real -- um unico ponto de falha na string de email.

**Lacuna na analise:** O auditor nao notou que `isAdmin()` no `firestore.rules` NAO verifica `request.auth.token.email_verified`. Se, por alguma razao, um token JIT fosse emitido com o email `a.thurcos@gmail.com` mas sem `email_verified` (ex.: mudanca no provedor de identidade, token cunhado por erro de configuracao), o acesso admin seria concedido mesmo sem email verificado. Isso agrava o risco de escalonamento de privilegio.

**Veredito:** Achado real, bem documentado. Severidade adequada (Alta). O risco pratico e menor que o teorico, mas a superficie de ataque multicamada justifica a classificacao.

---

### AUTH-03: Sessao zumbi residual no fluxo de exclusao de conta

**Classificacao: CONFIRMADO** (com ressalva de severidade)

**Validacao da PoC:**

1. `accountDeletionService.ts:196-201`: no `catch` de `deleteAuthenticatedUser`, chama `await deps.logout()`. **Confirmado.**
2. `LoginMethodsPage.tsx:98`: `logout: () => logout()` -- sem `{ clearLocalCache: true }`. **Confirmado.**
3. `authService.ts:50-62`: sem `clearLocalCache`, apenas `signOut(auth)` e chamado; `clearCachedProfiles()`, `terminate(db)`, `clearIndexedDbPersistence(db)` nao executam. **Confirmado.**
4. Apos `signOut`, o `onAuthStateChanged` em AuthContext.tsx dispara com `null`. As linhas 105-114 reconstroem o usuario do cache salvo (`buildCachedUserFromProfile`). O usuario volta a aparecer como logado com `authFromCache = true`. **Confirmado.**

**Cenario de exploracao pratico:**
1. `deleteAccountData()` executa e apaga dados do servidor
2. `deleteAuthenticatedUser()` falha (rede, timeout)
3. `logout()` sem cache clear
4. `onAuthStateChanged(null)` -> fallback recria usuario do cache (AuthContext.tsx:105-114)
5. O usuario ve o app "funcionando" com dados fantasmas do cache local
6. O `isDeleting` store ja foi limpo no catch (LoginMethodsPage.tsx:102)
7. O profile `onSnapshot` encontra o documento `users/{uid}` deletado e zera o profile
8. `RequireOnboardingComplete` redireciona para `/app/onboarding`

O auditor capturou os passos 1-5 mas nao explorou os passos 6-8 (o redirect imediato para onboarding apos o fallback).

**Ressalva de severidade:** A classificacao "Alta" e questionavel. O impacto pratico e:
- Dados financeiros JA FORAM apagados (passo 1 executou)
- O usuario ve um app "fantasma" por alguns segundos ate o redirect
- O usuario pode tentar excluir novamente (mas a conta Firebase Auth ainda existe)
- **Nao ha vazamento de dados** entre contas porque `deleteAccountData()` ja rodou

Isso seria mais precisamente **Media**: confusao para o usuario e sessao residual, mas sem perda ou exposicao de dados financeiros. O titulo "sessao zumbi" e tecnicamente correto, mas a severidade "Alta" parece superestimada.

**Veredito:** CONFIRMADO para o diagnostico. SUPERESTIMADO para a severidade (Media seria mais adequada).

---

### AUTH-04: Cache de sessao (`buildCachedUserFromProfile`) e um User artificial com 0 capacidades reais

**Classificacao: CONFIRMADO**

**Validacao da PoC:**

1. `buildCachedUserFromProfile` (AuthContext.tsx:24-51) cria objeto User com implementacoes vazias. **Confirmado.**
2. `getIdToken: async () => ''` -- retorna string vazia. **Confirmado.**
3. `emailVerified: false` fixo. **Confirmado.**
4. `isAnonymous: false` fixo. **Confirmado.**

O auditor descreve corretamente os riscos: chamadas a Cloud Functions durante o estado cacheado falhariam com token vazio, e o `emailVerified` fixo em `false` seria problematico se o app comecasse a checar esse campo.

**Lacuna na analise:** O auditor menciona "se o cache for usado por mais tempo que os 500ms previstos" mas NAO identifica que o cache e usado **alem do boot inicial**. Em AuthContext.tsx:105-114, quando o `onAuthStateChanged` dispara `null` (ex.: usuario perde sinal, Firebase Auth nao consegue renovar token), o codigo FALLA BACK para o perfil em cache e recria o User artificial. Isso significa que o User artificial pode persistir por **horas** (todo o periodo offline), nao apenas por 500ms. O impacto potencial (Cloud Functions falhando silenciosamente, `getIdToken` retornando vazio) e maior do que o descrito.

**Veredito:** CONFIRMADO para o diagnostico. SUBESTIMADO para a duracao do estado cacheado (pode persistir por todo o periodo offline, nao apenas 500ms).

---

### AUTH-05: Rota `/verify-email` fora do guard `RequireOnboardingComplete`

**Classificacao: CONFIRMADO**

**Validacao da PoC:**

1. App.tsx:77-113: `/verify-email` esta dentro de `RequireAuth` mas FORA de `RequireOnboardingComplete` e fora de `AppShell`. **Confirmado.**
2. VerifyEmailPage.tsx:47-48: link "Continuar" leva para `/app` sem qualquer verificacao. **Confirmado.**

O cenario de exploracao e uma consequencia direta de AUTH-01. A pagina `/verify-email` e puramente informativa.

**Veredito:** CONFIRMADO. Severidade adequada (Media). Sub-achado de AUTH-01.

---

### AUTH-06: `sendPasswordResetEmail` expoe enumeracao de email (Email Enumeration)

**Classificacao: SUPERESTIMADO**

**Validacao da PoC:**

1. ForgotPasswordPage.tsx:28-41: chama `sendResetEmail` e captura erro com `getAuthErrorMessage`. **Confirmado.**
2. authErrors.ts:15-16: mapeia `auth/user-not-found` para mensagem generica. **Confirmado.**
3. O Firebase `sendPasswordResetEmail` **nao lanca erro para email inexistente** por design -- retorna sucesso independentemente. **Confirmado.**

O auditor reconhece que "hoje nao ha vazamento" mas mantem a severidade "Media" e confianca 5/10. O argumento "se o comportamento do Firebase mudar" e extremamente fraco -- seria uma breaking change no SDK do Firebase Auth que quebraria milhares de aplicacoes.

Adicionalmente, mesmo que `sendPasswordResetEmail` lancasse erro, o `getAuthErrorMessage` mapearia `auth/user-not-found` para a mesma mensagem generica de `auth/wrong-password` e `auth/invalid-credential`. O vetor de enumeracao, na pratica, nao existe.

**Veredito:** SUPERESTIMADO. Este achado deveria ser **Informativo** ou no maximo **Baixa**. O risco concreto e praticamente zero. A confianca de 5/10 tambem e baixa demais para um achado que o proprio auditor reconhece como inexistente na implementacao atual.

---

### AUTH-07: Cache Firestore IndexedDB residual na exclusao

**Classificacao: CONFIRMADO**

**Validacao da PoC:**

1. `logout()` sem `{ clearLocalCache: true }` nao chama `terminate(db)` nem `clearIndexedDbPersistence(db)`. **Confirmado** (authService.ts:50-61).
2. `LoginMethodsPage.tsx:98`: `logout: () => logout()` sem opcoes. **Confirmado.**
3. `accountDeletionService.ts:196-201`: fallback `logout()` no erro sem opcoes. **Confirmado.**

O cenario descrito e valido: apos `deleteAccountData()` apagar os dados do servidor e `deleteAuthenticatedUser()` falhar, o cache IndexedDB local mantem dados residuais. Se o usuario criar uma nova conta no mesmo dispositivo (logout + novo registro), o Firestore `persistentLocalCache` pode servir documentos orfaos do workspace antigo ate que a sincronizacao corrija.

**Nota:** Na pratica, o workspace pessoal tem o formato `personal_{uid}`, entao dados de workspaces de UIDs diferentes nao se misturariam. O risco maior e em colecoes globais ou em workspaces compartilhados de casal, onde o path pode coincidir. O auditor poderia ter explorado melhor esse ponto, mas a analise e solida.

**Veredito:** CONFIRMADO. Severidade adequada (Media). Confianca 7/10 razoavel.

---

### AUTH-08: Google OAuth sem validacao de `hd` (hosted domain)

**Classificacao: CONFIRMADO** (como informativo)

**Validacao da PoC:**

1. `authService.ts:23-24`: `googleProvider.setCustomParameters({ prompt: 'select_account' })` -- sem `hd`. **Confirmado.**
2. Para um app financeiro pessoal (nao corporativo), nao definir `hd` e o comportamento correto. **Confirmado.**

O auditor classifica como "Baixa" e descreve como informativo. Correto. Nao ha acao necessaria.

**Veredito:** CONFIRMADO. Severidade adequada (Baixa/Informativa).

---

### AUTH-09: `fireWrite` engole erros em producao

**Classificacao: CONFIRMADO** (como informativo)

**Validacao da PoC:**

1. `fireWrite.ts:19-29`: o `catch` loga no console em DEV e silencia em producao. **Confirmado.**
2. E uma escolha arquitetural deliberada (offline-first). **Confirmado.**
3. O auditor corretamente distingue que o problema nao e o `fireWrite` em si, mas o processo de deploy que nao sincroniza enums entre TypeScript e rules. **Confirmado.**

**Veredito:** CONFIRMADO. Classificacao correta como informativo. A recomendacao (seguir a REGRA PRINCIPAL da CLAUDE.md com tres pontos de sincronia) e pertinente.

---

## Tabela de classificacao

| ID | Titulo | Severidade original | Classificacao Camada 2 |
|---|---|---|---|
| AUTH-01 | Ausencia de verificacao email_verified | Alta | **CONFIRMADO** |
| AUTH-02 | Protecao admin por email hardcoded | Alta | **CONFIRMADO** |
| AUTH-03 | Sessao zumbi residual na exclusao | Alta | **CONFIRMADO** (severidade: **Superestimado** -- seria Media) |
| AUTH-04 | Cache User artificial com 0 capacidades | Media | **CONFIRMADO** (duracao: **Subestimado** -- persiste ale do boot) |
| AUTH-05 | /verify-email sem bloqueio real | Media | **CONFIRMADO** |
| AUTH-06 | Potencial enumeracao de email | Media | **SUPERESTIMADO** (risco: Informativo) |
| AUTH-07 | Cache Firestore IndexedDB residual | Media | **CONFIRMADO** |
| AUTH-08 | Google OAuth sem hd | Baixa | **CONFIRMADO** (informativo) |
| AUTH-09 | fireWrite silencia erros | Informativa | **CONFIRMADO** (informativo) |

---

## Lacunas (achados que o auditor nao identificou)

### LACUNA-01: RegisterPage nunca redireciona para `/verify-email` apos registro

**Local:** `src/pages/RegisterPage.tsx:39`, `src/auth/authService.ts:26-32`
**Severidade:** Media

Apos `registerWithEmail` (que chama `sendEmailVerification`), o `RegisterPage` redireciona diretamente para `/app/onboarding` (linha 39). O usuario NUNCA e levado a pagina `/verify-email` que o proprio app oferece. Para encontrar a pagina de verificacao, o usuario precisa:
1. Saber que a rota `/verify-email` existe (nao ha link visivel no app)
2. Tentar acessa-la manualmente
3. Lembrar de verificar o email e clicar "Continuar"

Isso agrava AUTH-01 e AUTH-05: nao apenas o usuario pode ignorar a verificacao, como o app ativamente o leva para longe da pagina de verificacao sem nunca mostra-la.

**Cenario:**
1. Usuario se registra com email/senha
2. Recebe email de verificacao, mas e automaticamente levado ao onboarding
3. Completa onboarding, comeca a usar o app
4. Nunca ve a pagina `/verify-email`
5. Semanas depois, o email ainda nao esta verificado

---

### LACUNA-02: AppShell `handleLogout` com fallback que tambem nao limpa cache

**Local:** `src/layout/AppShell.tsx:56-72`
**Severidade:** Baixa

O logout voluntario do sidebar/mobile menu faz:
```typescript
try {
    await logout({ clearLocalCache: true });
} catch {
    await logout();
}
```

Se o `logout({ clearLocalCache: true })` falhar (ex.: `terminate(db)` lancar excecao por pending writes), o fallback chama `logout()` sem opcoes, que apenas faz `signOut(auth)` e nao limpa `clearCachedProfiles()`, `terminate(db)` nem `clearIndexedDbPersistence(db)`.

**Cenario:**
1. Usuario faz logout voluntario
2. `clearLocalCache` falha por pending writes ou erro no `terminate(db)`
3. `signOut` e executado, mas `clearCachedProfiles()` e `clearIndexedDbPersistence(db)` pulam
4. Cache de perfil e IndexedDB permanecem no dispositivo
5. No proximo boot, `readLastCachedProfile()` restaura sessao fantasma ate `onAuthStateChanged` confirmar

**Impacto:** Menor que AUTH-03 (logout voluntario, nao exclusao apagando dados), mas o mesmo mecanismo de sessao zumbi.

---

### LACUNA-03: `authFromCache` fallback persiste alem do boot (offline prolongado)

**Local:** `src/auth/AuthContext.tsx:105-114`
**Severidade:** Media (complemento de AUTH-04)

O auditor descreve AUTH-04 como risco apenas nos "primeiros 500ms de boot". No entanto, o codigo em AuthContext.tsx:105-114 mostra que o fallback para User artificial acontece TAMBEM quando o usuario fica offline e o Firebase Auth nao consegue renovar o token:

```typescript
if (!nextUser) {
    const cachedProfile = readLastCachedProfile();
    if (cachedProfile) {
        setAuthFromCache(true);
        setUser(buildCachedUserFromProfile(cachedProfile));
        ...
    }
}
```

Isso significa que durante todo o periodo offline, o User artificial esta ativo. Qualquer Cloud Function chamada durante esse periodo (`adminDeleteUser`, `adminForceLogout`, `unlinkWhatsapp`, `adminUnlinkWhatsappNumber`, ou funcoes futuras de assistente/IA) recebera `getIdToken()` retornando string vazia e falhara silenciosamente.

**Impacto:** Atualmente limitado (admin functions sao chamadas por admin, nao por usuarios normais; `unlinkWhatsapp` e chamado no fluxo de exclusao antes de `signOut`). Mas se novas Cloud Functions forem adicionadas no fluxo normal (ex.: assistente Grazi via Cloud Function), o User artificial as quebraria sem feedback.

---

### LACUNA-04: `isAdmin()` no `firestore.rules` nao verifica `email_verified`

**Local:** `firestore.rules:9-11`
**Severidade:** Media (complemento de AUTH-02)

O auditor menciona que a protecao admin e baseada em email, mas nao destaca que `isAdmin()` no `firestore.rules` poderia verificar `request.auth.token.email_verified` e nao o faz:

```javascript
function isAdmin() {
    return signedIn() && request.auth.token.email == 'a.thurcos@gmail.com';
    // Nao verifica: request.auth.token.email_verified == true
}
```

Se por algum motivo um token Firebase Auth for emitido com `email == 'a.thurcos@gmail.com'` mas `email_verified == false`, o `isAdmin()` ainda retornaria `true`. A verificacao de `email_verified` adicionaria uma camada extra de protecao sem custo.

**Impacto:** Baixo na pratica (Firebase Auth impede duplicatas de email), mas e uma melhoria defensiva simples que o auditor deveria ter notado.

---

### LACUNA-05: Nao ha validacao de forca de senha no registro

**Local:** `src/pages/RegisterPage.tsx:17`
**Severidade:** Baixa

O schema de registro (Zod) exige apenas `password: z.string().min(8, ...)`. Nao ha requisitos de:
- Letra maiuscula
- Letra minuscula
- Numero
- Caractere especial
- Tamanho maximo ou complexidade

Para um app financeiro, senhas fracas (ex.: `12345678`) sao permitidas.

**Impacto:** Usuarios podem escolher senhas fracas, aumentando risco de brute-force ou credential stuffing. O Firebase Auth ja aplica rate limiting server-side, o que mitiga parcialmente, mas senhas fracas continuam sendo um risco para contas financeiras.

---

### LACUNA-06: Nao ha bloqueio de multiplas sessoes no reset de senha

**Local:** `src/auth/authService.ts:46-48`
**Severidade:** Baixa

`sendPasswordResetEmail` gera um link de redefinicao que, quando usado, altera a senha. Porem, o Firebase Auth NAO invalida automaticamente sessoes existentes apos a troca de senha. O token antigo continua valido por ate 1 hora (ate expirar ou ser detectado como revogado). Isso significa que se um atacante obtiver acesso a uma sessao ativa e a senha for trocada (pelo usuario legitimo), o atacante pode continuar acessando por ate 1 hora.

**Impacto:** Risco conhecido do Firebase Auth (documentado). Nao e uma vulnerabilidade exclusiva deste app, mas em um app financeiro, sessoes ativas apos troca de senha sao mais problematicas.

---

## Resumo do revisor

### Qualidade geral da auditoria

A auditoria da Camada 1 e de alta qualidade: os 9 achados sao precisos no diagnostico, bem referenciados ao codigo-fonte, e a maioria tem analise de impacto correta. O conhecimento demonstrado do fluxo offline-first e dos bugs reais do projeto (incidente `createdBy`, incidente `installment_anticipation_credit`) mostra que o auditor compreende o dominio.

### Ajustes de classificacao

| Achado | Ajuste | Motivo |
|---|---|---|
| AUTH-03 | Alta -> Media | Nao ha perda/exposicao de dados financeiros; o usuario fica confuso, mas os dados ja foram deletados |
| AUTH-04 | Severidade OK, duracao subestimada | O User artificial persiste alem do boot (todo o periodo offline), nao apenas 500ms |
| AUTH-06 | Media -> Informativo | O Firebase nao lanca erro para email inexistente; mesmo se lancasse, o mapeamento e generico |

### Lacunas encontradas (6)

| ID | Titulo | Severidade | Relacao com achados |
|---|---|---|---|
| LACUNA-01 | RegisterPage nunca redireciona para /verify-email | Media | Agrava AUTH-01 e AUTH-05 |
| LACUNA-02 | AppShell logout fallback pula cache cleanup | Baixa | Similar a AUTH-03 (logout voluntario) |
| LACUNA-03 | authFromCache persiste offline (nao apenas boot) | Media | Complemento de AUTH-04 |
| LACUNA-04 | isAdmin() rules nao checa email_verified | Media | Complemento de AUTH-02 |
| LACUNA-05 | Sem validacao de forca de senha | Baixa | Independente |
| LACUNA-06 | Reset de senha nao invalida sessoes ativas | Baixa | Independente (conhecimento Firebase) |

### Priorizacao final (recomendada)

1. **AUTH-01 + LACUNA-01 + AUTH-05** (Alta): Implementar verificacao de `emailVerified` + redirecionar para `/verify-email` apos registro. Corrige 3 achados.
2. **AUTH-02 + LACUNA-04** (Alta): Migrar admin para custom claims + adicionar `email_verified` nas rules.
3. **AUTH-03 + AUTH-07 + LACUNA-02** (Media): Passar `{ clearLocalCache: true }` no catch de exclusao e no fallback do AppShell logout.
4. **AUTH-04 + LACUNA-03** (Media): Separar estado de autenticacao em tipos distintos (`loading | cached | authenticated | unauthenticated`).
5. **LACUNA-05** (Baixa): Adicionar validacao de complexidade de senha (maiuscula, minuscula, numero, 8+ chars).
6. **LACUNA-06** (Baixa): Considerar `auth.revokeRefreshTokens` no reset de senha (depende de Cloud Function).
