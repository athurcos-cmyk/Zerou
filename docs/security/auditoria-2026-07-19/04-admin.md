# Auditoria: Cloud Functions Admin

**Data:** 2026-07-19
**Escopo:** `functions-admin/src/index.ts`, `src/pages/AdminPage.tsx`, `src/auth/routeGuards.tsx`, `src/admin/adminService.ts`, `firestore.rules` (função `isAdmin`)

---

## ADMIN-1: Colecao `whatsappPhoneIndex` legivel por qualquer usuario autenticado

**ID:** ADMIN-1
**Severidade:** Alta
**Local:** `firestore.rules` linha 1592: `allow read: if request.auth != null;`
**Descricao:** A colecao `whatsappPhoneIndex` mapeia numeros de telefone completos para workspace IDs. A regra atual permite leitura (`list` e `get`) para QUALQUER usuario autenticado (`request.auth != null`). Nao ha restricao de administrador ou de pertencimento ao workspace. Qualquer usuario logado pode listar todos os numeros de WhatsApp vinculados ao sistema.

**Cenario / PoC:**
1. Um usuario malicioso se cadastra normalmente no app.
2. No console do navegador ou via codigo client-side, executa:
   ```js
   const col = collection(getFirebaseDb(), 'whatsappPhoneIndex');
   const snap = await getDocs(col);
   snap.docs.forEach(d => console.log(d.id)); // numeros de telefone
   ```
3. O Firebase Rules permite porque qualquer `request.auth != null` passa.
4. O usuario obtem todos os numeros de telefone vinculados a qualquer workspace do sistema.

**Impacto:** Vazamento de dados pessoais (numeros de telefone reais) de todos os usuarios que vincularam WhatsApp. Um numero de telefone e considerado PII ( Personally Identifiable Information). A exposicao viola privacidade dos usuarios e pode ser usada para phishing, spam ou associacao de identidades.

**Solucao sugerida:** Restringir a leitura de `whatsappPhoneIndex` a admins, similar ao que ja e feito para `whatsappLinkCodes`:
```
match /whatsappPhoneIndex/{phone} {
  allow read: if isAdmin();
  allow write: if false;
}
```
O frontend carrega essa colecao em `getAdminWhatsappLinks()` que ja e chamado apenas na pagina admin (protegida por `RequireAdmin` no client + `assertAdmin` no server), entao mudar a regra para `isAdmin()` nao quebra funcionalidade legitima.

**Confianca:** 10

---

## ADMIN-2: Zero cobertura de testes para as funcoes admin

**ID:** ADMIN-2
**Severidade: Alta**
**Local:** `functions-admin/` (diretorio inteiro)
**Descricao:** As tres funcoes callable (`adminDeleteUser`, `adminForceLogout`, `adminUnlinkWhatsappNumber`) sao as operacoes mais destrutivas do sistema:
- `adminDeleteUser`: deleta usuario do Firebase Auth + apaga workspace pessoal, workspaces de casal, billing, FCM tokens, WhatsApp links dezenas de documentos.
- `adminForceLogout`: revoga refresh tokens de qualquer usuario.
- `adminUnlinkWhatsappNumber`: desvincula numero de WhatsApp inclusive orfao.

Nenhuma delas tem teste automatizado. Nao ha arquivo de teste em `functions-admin/`, nem jest/vitest configurado no `package.json`, nem referencia a essas funcoes nos testes de rules ou em qualquer outro lugar.

A unica cobertura existente e `src/admin/adminFormat.test.ts` que testa formatacao de numeros na UI.

**Impacto:** Qualquer mudanca nas funcoes admin pode introduzir bugs silenciosos: deletar documentos errados, nao limpar colecoes novas (como ja aconteceu com WhatsApp no passado), ou falhar em casos de borda (workspace de casal com partner, billing account, etc.). Sem testes tambem significa que nao ha verificacao da logica de autorizacao (`assertAdmin`) ou dos fluxos de erro (usuario nao encontrado, workspace inexistente).

**Solucao sugerida:** Adicionar cobertura de testes para as tres funcoes no `functions-admin/`:
- Testar `assertAdmin` com email correto, email incorreto, `undefined`.
- Testar `adminDeleteUser` com usuario valido, usuario inexistente, userId vazio.
- Testar `adminUnlinkWhatsappNumber` com numero valido, numero inexistente, orfao.
- Testar `adminForceLogout` com usuario valido e inexistente.
- Usar `firebase-functions-test` para mockar o Firebase Admin SDK.

**Confianca:** 10

---

## ADMIN-3: Funcao `adminDeleteUser` sem idempotencia e sem rollback em falha parcial

**ID:** ADMIN-3
**Severidade:** Media
**Local:** `functions-admin/src/index.ts` linhas 97-173
**Descricao:** A funcao `adminDeleteUser` coleta todos os document references em um array e depois executa `commitDeletes` em lotes de 450 documentos. Se o processo falhar no meio (ex.: timeout de 60s do Firebase Functions, erro de rede interno, lote atingir o limite de 500 writes por batch), parte dos documentos pode ja ter sido deletada e parte nao. Nao ha rollback. Alem disso, `auth.deleteUser(userId)` e chamado APOS `commitDeletes` — se `commitDeletes` suceder mas `auth.deleteUser` falhar, o usuario do Firebase Auth continua existindo mas todos os dados do Firestore ja foram apagados, deixando o sistema em estado inconsistente (usuario Auth existe sem nenhum dado).

Nao ha verificacao de idempotencia: se a mesma funcao for chamada duas vezes com o mesmo userId, a segunda chamada tentara deletar novamente documentos que ja foram apagados (e o `batch.delete` de um doc inexistente e bem-sucedido no Firestore, mas `auth.deleteUser` pode falhar se o usuario ja foi deletado).

**Cenario / PoC:**
1. Admin chama `adminDeleteUser({ userId: "abc123" })`.
2. `collectWorkspaceTree` coleta 1000 documentos.
3. `commitDeletes` deleta os primeiros 450 (batch 1).
4. O segundo batch falha (ex.: `Error: 13 INTERNAL: deadline exceeded` ou `Error: 8 RESOURCE_EXHAUSTED`).
5. A exception propaga para o cliente.
6. `auth.deleteUser` nunca e chamada.
7. Resultado: usuario Auth ainda existe, 450 dados ja foram deletados, dados restantes meio apagados. Estado inconsistente, impossivel de recuperar via app.

**Impacto:** Inconsistencia de dados apos falha parcial. Usuario pode ficar em estado "zumbi" — existe no Auth mas com dados truncados.

**Solucao sugerida:** Idealmente, inverter a ordem: primeiro `auth.deleteUser(userId)`, depois `commitDeletes`. Se o Auth falhar, aborta antes de tocar no Firestore. Se o Firestore falhar depois que o Auth ja deletou, o usuario fica sem acesso (bom) e o cleanup residual pode ser tratado como uma segunda tentativa. Alternativamente, registrar a operacao em um documento de auditoria antes de comecar para permitir retry seguro. Na pratica, a inversao de ordem ja resolveria o cenario mais critico (dados apagados mas usuario Auth existindo).

**Confianca:** 8

---

## ADMIN-4: Ausencia de rate limiting especifico para operacoes admin

**ID:** ADMIN-4
**Severidade:** Media
**Local:** `functions-admin/src/index.ts`
**Descricao:** As tres funcoes admin tem `maxInstances: 5` (limite de instancias simultaneas), mas nao ha rate limiting individual por operacao. Um administrador comprometido ou um bug no client-side poderia chamar `adminDeleteUser` dezenas de vezes em segundos, destruindo contas em massa antes que qualquer alerta seja disparado. O `maxInstances: 5` limita a 5 execucoes simultaneas, mas cada instancia processa uma conta por vez — em alguns segundos, 5 contas podem ser deletadas.

**Impacto:** Potencial de destruicao acelerada de contas. Se a conta admin for comprometida (credenciais vazadas, sessao ativa em dispositivo perdido), o atacante pode deletar varias contas rapidamente sem barreira.

**Solucao sugerida:** Adicionar rate limit no Firebase Functions com base no caller UID. O Firebase Functions nao tem rate limiting nativo, mas pode-se usar:
- Um contador no Firestore com TTL (ex.: `adminAudit/rateLimit_{uid}`).
- Ou um documento de auditoria que registra cada operacao com timestamp, e uma verificacao previa que conta operacoes nos ultimos N segundos.
- Ou usar o Firebase Security Rules `rateLimit` via Firestore se houver um documento de auditoria.

**Confianca:** 8

---

## ADMIN-5: Verificacao por email em vez de UID no `assertAdmin`

**ID:** ADMIN-5
**Severidade:** Baixa
**Local:** `functions-admin/src/index.ts` linha 28-32, `firestore.rules` linha 9-11, `src/auth/routeGuards.tsx` linha 42-47
**Descricao:** A verificacao de administrador usa o **email** do token (`request.auth.token.email == 'a.thurcos@gmail.com'`) em vez do UID. O email de um usuario do Firebase Auth pode ser alterado (com reautenticacao) se o usuario tiver acesso de edicao de perfil ou se o admin do Firebase Console mudar manualmente. O UID de usuario do Firebase Auth e imutavel. Uma troca de email na conta admin (ex.: alteracao no Firebase Console) permitiria a um novo dono do endereco de email acessar as funcoes admin — caso a conta Firebase original que perdeu o acesso ao email nao seja desabilitada.

Na pratica, isso significa que se:
- O admin perder acesso ao email `a.thurcos@gmail.com`.
- E um atacante obtiver acesso ao Firebase Console (credenciais do Google Cloud).
- O atacante muda o email da conta para o dele.
- Agora ele pode chamar as funcoes admin.

E um ataque complexo (requer acesso ao Firebase Console), mas seria evitado pelo UID.

**Impacto:** Baixo na pratica — o cenario requer acesso ao Firebase Console, que e protegido por IAM do Google Cloud. Mas e uma camada extra de seguranca que seria trivial de adicionar.

**Solucao sugerida:** Adicionar verificacao do UID como complemento ao email (ou substituir):

**`firestore.rules`:**
```
function isAdmin() {
  return signedIn()
    && request.auth.uid == '<ADMIN_UID>'
    && request.auth.token.email == 'a.thurcos@gmail.com';
}
```

**`functions-admin/src/index.ts`:**
```
const ADMIN_UID = '<admin-uid-aqui>';
function assertAdmin(auth: { uid?: string; token?: { email?: string } } | undefined): void {
  if (!auth || auth.uid !== ADMIN_UID || auth.token?.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Acesso negado.');
  }
}
```

**`src/auth/routeGuards.tsx`:**
Se soubermos o UID do admin, poderiamos verificar `user.uid === ADMIN_UID` como redundancia, mas a verificacao por email e suficiente para UI, ja que a seguranca real e server-side.

**Confianca:** 6

---

## ADMIN-6: Funcao `adminForceLogout` nao invalida sessoes ativas instantaneamente

**ID:** ADMIN-6
**Severidade:** Baixa (Informativa)
**Local:** `functions-admin/src/index.ts` linhas 175-201
**Descricao:** A funcao `adminForceLogout` usa `auth.revokeRefreshTokens(userId)` que revoga tokens de atualizacao (refresh tokens). No entanto, o token de acesso JWT do usuario continua valido ate expirar (aproximadamente 1 hora). Durante essa janela, o usuario ainda pode fazer chamadas as Cloud Functions e Firestore com o token JWT existente. Isso e uma limitacao do Firebase Auth, nao um bug no codigo.

O frontend ja documenta essa limitacao no modal de confirmacao (linhas 1394-1401 de AdminPage.tsx), mas vale destacar que operacoes de seguranca sensiveis (ex.: deletar conta) nao sao bloqueadas imediatamente apos o force logout.

**Impacto:** Se o admin faz force logout de um dispositivo roubado, o ladrao ainda tem 1 hora de acesso ao Firestore e Cloud Functions. Pode fazer operacoes destrutivas nessa janela.

**Solucao sugerida:** Combinar `revokeRefreshTokens` com a atualizacao de `syncStatus` ou `version` nas Security Rules (versionamento de dados que invalida writes apos revogacao). Ou implementar uma Allowlist de tokens no Firestore que seja consultada pelas Security Rules em writes sensiveis. Nenhuma solucao e trivial, mas a limitacao deve ser documentada, o que ja foi feito no frontend.

**Confianca:** 10 (documentado, aceito)

---

## ADMIN-7: Dados de auditoria admin nao sao persistidos no Firestore

**ID:** ADMIN-7
**Severidade:** Baixa (Informativa)
**Local:** `functions-admin/src/index.ts` (logs via `logger.info`)
**Descricao:** As operacoes admin geram logs no Cloud Logging (`logger.info` com `admin_deleted_user`, `admin_forced_logout`, `admin_unlinked_whatsapp`). No entanto, nao ha persistencia dessas operacoes em uma colecao `adminAuditLog` no Firestore. Os logs do Cloud Logging tem retencao configuravel e podem ser excluidos.

Se um atacante comprometer a conta admin e executar operacoes destrutivas, ele tambem poderia (dependendo do nivel de acesso ao GCP) apagar os logs para encobrir o rastro. Com auditoria no Firestore, a imutabilidade seria maior (embora Firestore permita delete).

**Impacto:** Dificulta investigacao pos-incidente. Sem trilha de auditoria no Firestore, a unica fonte de verdade sao logs do Cloud Logging que podem ser alterados/excluidos.

**Solucao sugerida:** Registrar cada operacao admin em uma colecao `adminAuditLog` no Firestore com:
- Timestamp da operacao.
- Tipo da operacao (`delete_user`, `force_logout`, `unlink_whatsapp`).
- Actor UID e email.
- Target (userId, phone).
- Resultado (sucesso/erro).

A colecao deve ter regra `allow write: if false; allow read: if isAdmin();` para garantir que nem o proprio admin possa manipular o log apos a escrita (a escrita seria via Admin SDK, que ignora rules).

**Confianca:** 7

---

## ADMIN-8: Vazamento de informacao em `assertAdmin` com erro `permission-denied`

**ID:** ADMIN-8
**Severidade:** Informativa
**Local:** `functions-admin/src/index.ts` linha 30: `throw new HttpsError('permission-denied', 'Acesso negado.');`
**Descricao:** Quando um usuario nao-admin tenta chamar uma funcao admin, a mensagem de erro generica "Acesso negado." e apropriada. Nao revela se o usuario existe ou nao, ou qual email seria aceito. Isso e uma boa pratica.

**Solucao sugerida:** Manter como esta. Apenas registrar que a implementacao atual ja segue a melhor pratica de nao vazar informacao em erros de autorizacao.

**Confianca:** 10

---

## Resumo

| ID | Severidade | Titulo | Confianca |
|---|---|---|---|
| ADMIN-1 | Alta | Colecao `whatsappPhoneIndex` legivel por qualquer usuario autenticado | 10 |
| ADMIN-2 | Alta | Zero cobertura de testes para as funcoes admin | 10 |
| ADMIN-3 | Media | `adminDeleteUser` sem idempotencia e sem rollback em falha parcial | 8 |
| ADMIN-4 | Media | Ausencia de rate limiting especifico para operacoes admin | 8 |
| ADMIN-5 | Baixa | Verificacao por email em vez de UID no `assertAdmin` | 6 |
| ADMIN-6 | Baixa | `adminForceLogout` nao invalida sessoes ativas instantaneamente | 10 |
| ADMIN-7 | Baixa | Dados de auditoria admin nao sao persistidos no Firestore | 7 |
| ADMIN-8 | Informativa | Mensagem de erro generica em `assertAdmin` (bem implementado) | 10 |

**Total:** 8 achados (2 altos, 2 medios, 3 baixos, 1 informativo)
