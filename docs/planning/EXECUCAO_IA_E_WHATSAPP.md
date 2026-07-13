# Execução: Assistente de IA + Lançamento via WhatsApp

> **Este documento é autocontido.** Quem for executar não participou do planejamento — leia tudo antes de escrever a primeira linha de código. Não pule as seções de "Leitura obrigatória antes de codar".

## 0. Antes de tudo: leia isso

1. Leia `CLAUDE.md` (raiz do repo) inteiro. As regras de lá **têm prioridade sobre qualquer instrução deste documento** se houver conflito.
2. Leia `SESSAO.md` e `docs/BUSCA_RAPIDA.md` pra saber o estado atual do projeto.
3. Duas regras do `CLAUDE.md` são cruciais pra este trabalho especificamente e causaram bugs reais e caros no passado:
   - **Offline-first / fire-and-forget**: toda escrita do client no Firestore não pode usar `await` bloqueando a UI. Isso não muda aqui — mas as escritas que ESTE trabalho cria vêm principalmente do **servidor** (Cloud Functions com Admin SDK), então essa regra se aplica à parte client (UI do assistente, tela de vincular WhatsApp), não ao webhook.
   - **Todo campo/valor novo de enum gravado no Firestore precisa bater com o que `firestore.rules` aceita, e servidor precisa gerar o mesmo formato que o client gera.** Isso já causou 2 incidentes reais (ver `CLAUDE.md`). Aqui o risco é o INVERSO do incidente original: é o **servidor** (Admin SDK, que ignora Security Rules) que vai gravar transações. Se o formato que o servidor grava não bater exatamente com o que `financeService.createTransaction` gera no client, a UI vai quebrar de forma sutil quando o usuário abrir o app (campo faltando, `competenceMonth` errado, etc.) — silenciosamente, sem erro visível, porque Admin SDK não é bloqueado por rules.

> ⚠️ **RISCO #1 DESTE TRABALHO — NÃO ECONOMIZE AQUI.** A tentação natural é "só grava o essencial (amount, description, categoria) e deixa o resto default" — isso é exatamente como os dois incidentes anteriores aconteceram (um campo esquecido, uma regra desatualizada, ninguém percebeu por semanas/meses porque o padrão fire-and-forget engole o erro de propósito). Aqui não existe rede de segurança nenhuma: Admin SDK ignora `firestore.rules` completamente, então **nada vai acusar erro** se o payload sair errado — a transação simplesmente vai ficar num formato que o client não espera, e o bug só aparece quando o usuário mexer nela e algo quebrar de forma esquisita, dias ou semanas depois. Antes de escrever `createTransactionFromMessage.ts` (seção 4.4): leia `financeService.createTransaction` e `createTransactionSchema` na íntegra, campo por campo, e reproduza CADA campo derivado que o client grava — não apenas os "óbvios". Depois de implementar, o teste manual E2E (mandar mensagem real, criar transação, recarregar o app e conferir que aparece 100% normal, editável, sem campo estranho) não é opcional — é bloqueante antes de considerar a Fase 2 pronta.
4. Não hardcode cor em hex/rgba fora de `src/styles/themes.css` e `src/theme/palette.ts` (existe teste `noHardcodedColors` que falha se isso acontecer).
5. Edição cirúrgica — não reescreva arquivo inteiro pra mudar poucas linhas.
6. Antes de escrever qualquer código, **releia os arquivos reais que vai tocar** (`financeService.ts`, `financeSchemas.ts`, `financeCalculations.ts`, `firestore.rules`, `functions/src/index.ts`, `functions/src/automation.ts`) — os trechos citados neste documento são um retrato de um momento específico e podem ter mudado.

## 1. O que já foi decidido (não reabrir essas discussões)

- **Backend**: Firebase Cloud Functions, estendendo a pasta `functions/` que já existe e já está deployada (região `southamerica-east1`, usa `firebase-admin`). Não criar rotas `/api` na Vercel — decisão já tomada e justificada (reuso de infra existente).
- **Provedor de IA**: DeepSeek (`deepseek-chat`, API REST compatível com formato OpenAI, JSON mode). Escolhido por ser o mais barato disponível com qualidade suficiente para extração estruturada em português. Não trocar de provedor sem justificativa nova.
- **WhatsApp**: Meta Cloud API oficial (não Twilio).
- Nenhuma chamada de IA acontece no client. A chave de API do DeepSeek e os secrets da Meta ficam só em Cloud Functions.

## 2. Gate obrigatório antes de começar a codar

- **Gate A — RESOLVIDO.** Arthur já confirmou explicitamente: pode estender `functions/` (Firebase Cloud Functions) com as novas functions listadas neste documento. Não precisa perguntar de novo.
- **Gate B — provedor de IA RESOLVIDO.** Arthur já confirmou: DeepSeek. Não precisa perguntar de novo.
- **Gate C — ainda pendente**: as contas externas (Meta for Developers / WhatsApp Business, conta DeepSeek em platform.deepseek.com) **têm que ser criadas pelo Arthur, não pela IA executora**. Criar conta e inserir credenciais de pagamento/login em serviço externo é ação vedada a um agente de IA. A IA executora deve:
  1. Pedir pro Arthur criar as contas e gerar as chaves (`DEEPSEEK_API_KEY`, e do lado Meta: `WHATSAPP_VERIFY_TOKEN` — inventado pelo próprio Arthur, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` — esses saem do painel da Meta).
  2. Pedir pro Arthur rodar `firebase functions:secrets:set NOME_DO_SECRET` pra cada uma (ou fazer isso junto com ele, mas quem digita a chave real é ele, nunca deixar a chave em texto no chat/código/commit).
  3. A chave `DEEPSEEK_API_KEY` já é suficiente pra começar a Fase 1. As chaves da Meta só bloqueiam a Fase 2.

Se o Gate C não estiver resolvido no momento de precisar da respectiva chave, **pare e peça a chave** — não presuma que já existe.

## 3. Fase 1 — Assistente de IA financeiro

### 3.1 Objetivo
Chat dentro do app onde o usuário pergunta sobre os próprios gastos e recebe respostas baseadas em dados reais do workspace dele, mais dicas.

### 3.2 Arquivos a criar

**`functions/src/ai/deepseekClient.ts`**
- Export `async function callDeepSeek(messages: {role: 'system'|'user'|'assistant', content: string}[], opts?: {jsonMode?: boolean}): Promise<string>`.
- Faz `fetch('https://api.deepseek.com/chat/completions', ...)` com header `Authorization: Bearer ${DEEPSEEK_API_KEY}`, `model: 'deepseek-chat'`, `response_format: {type: 'json_object'}` quando `jsonMode` for true.
- Ler a API key via Firebase Functions secret (`defineSecret('DEEPSEEK_API_KEY')`, padrão do Firebase Functions v2 — checar como `functions/src/index.ts` já declara secrets, se houver algum precedente pro Stripe, e seguir o mesmo padrão).
- Timeout de ~15s (usar `AbortController`). Em erro, lançar exceção clara — quem chama decide o fallback.

**`functions/src/ai/buildFinancialContext.ts`**
- Export `async function buildFinancialContext(db: FirebaseFirestore.Firestore, workspaceId: string): Promise<string>`.
- Lê (via Admin SDK) as transações dos últimos ~90 dias do workspace, agrupa por categoria e por mês, calcula: total gasto no mês atual vs. mês anterior por categoria, top 5 categorias de gasto, contas a pagar (`bills`) com vencimento nos próximos 7 dias, saldo agregado das contas (`accounts`).
- **Não** serializar a lista crua de transações — só os agregados. Retornar como string de texto formatado (não JSON) pra virar parte do prompt de sistema.
- Reaproveitar `monthKeyFromDate` ou equivalente se já existir alguma versão sem dependência do SDK client — checar `src/finance/financeCalculations.ts` e `src/finance/payday.ts` primeiro.

**`functions/src/ai/verifyWorkspaceMembership.ts`**
- Export `async function verifyWorkspaceMembership(db, workspaceId: string, uid: string): Promise<void>` — lê o doc do workspace (`workspaces/{workspaceId}`) e confere se `uid` está entre os membros/owners. Se não estiver, `throw new HttpsError('permission-denied', ...)`.
- Checar exatamente como o modelo de dados de membership do workspace está estruturado hoje (provavelmente em `src/workspaces/` ou dentro do próprio doc do workspace) antes de escrever essa função — não inventar um campo que não existe.

**`functions/src/ai/financialAssistant.ts`**
- Export Cloud Function `onCall` `financialAssistantChat`.
- Input: `{workspaceId: string, message: string, history: {role: 'user'|'assistant', content: string}[]}`.
- Passos: validar `request.auth` existe → `verifyWorkspaceMembership` → rate limit (ver 3.3) → `buildFinancialContext` → montar prompt de sistema em português orientando o modelo a ser um assistente financeiro objetivo, nunca inventar números que não estão no contexto, e ser conciso → `callDeepSeek([system, ...history, {role:'user', content: message}])` → retornar `{reply: string}`.
- Registrar essa function em `functions/src/index.ts` do mesmo jeito que as outras (`export { financialAssistantChat } from './ai/financialAssistant';` ou padrão equivalente já usado no arquivo).

### 3.3 Rate limiting
- Doc `workspaces/{workspaceId}/aiUsage/{yyyy-mm-dd}` com campo `count`. Antes de chamar DeepSeek, ler/incrementar via transação Firestore. Se `count` passar de um limite (sugestão: 60 mensagens/dia por workspace — ajustável), retornar erro amigável `HttpsError('resource-exhausted', 'Limite diário de mensagens do assistente atingido, volta amanhã!')`.

### 3.4 Client
**`src/pages/AssistantPage.tsx`** (novo) + rota registrada onde as outras páginas autenticadas estão registradas (checar `src/app/` ou o router principal).
- UI de chat simples: lista de mensagens (usuário à direita, assistente à esquerda), input + botão enviar, estado de "digitando..." enquanto aguarda.
- Chama `httpsCallable(getFirebaseFunctions(), 'financialAssistantChat')({workspaceId, message, history})`.
- Erros tratados com `getUserFacingErrorMessage` (nunca mostrar erro técnico cru).
- Seguir os componentes-base de UX do projeto (`docs/design/DESIGN.md`) — ler esse doc antes de estilizar.
- Adicionar entrada de navegação (menu/tab) pra essa página, seguindo o padrão visual existente.

### 3.5 Testes Fase 1
- Unit test de `buildFinancialContext` com dados mockados do Firestore (usar o padrão de teste já existente no projeto — checar `tests/` e `src/test/`).
- Unit test de `verifyWorkspaceMembership` (aceita membro, rejeita não-membro).
- Rodar `npm run typecheck && npm test && npm run build` antes de considerar a fase pronta.

## 4. Fase 2 — Lançamento via WhatsApp

Só começar depois do Gate B (contas Meta + secrets configurados).

### 4.1 Fluxo completo (ordem de execução)

1. Arthur cria o app no Meta for Developers, produto WhatsApp, número de teste.
2. Implementar vínculo de conta (4.2) e testar manualmente com o número de teste (que só manda pra até 5 números cadastrados como destinatário de teste — normal, é do plano gratuito da Meta).
3. Implementar o webhook (4.3).
4. Implementar extração de gasto + criação de transação (4.4).
5. Implementar resposta de confirmação (4.5).
6. Testar E2E manualmente mandando mensagens reais pro número de teste.

### 4.2 Vínculo de conta WhatsApp ↔ workspace

**Novas coleções Firestore:**
```
users/{uid}/whatsappLinkCodes/{code}
  - code: string (6 dígitos)
  - workspaceId: string
  - createdAt: Timestamp
  - expiresAt: Timestamp (createdAt + 10min)

workspaces/{workspaceId}/whatsappLinks/{phoneNumberE164}
  - workspaceId: string
  - linkedByUid: string
  - linkedAt: Timestamp
```

**`functions/src/whatsapp/linkAccount.ts`**
- `onCall` `generateWhatsappLinkCode({workspaceId})`: valida membership (reusar `verifyWorkspaceMembership` de 3.2), gera código de 6 dígitos aleatório, grava em `users/{uid}/whatsappLinkCodes/{code}` com TTL de 10 min, retorna `{code}`.

**`firestore.rules`** — adicionar:
```
match /users/{userId}/whatsappLinkCodes/{code} {
  allow read: if request.auth.uid == userId;
  allow write: if false; // só Admin SDK
}
match /workspaces/{workspaceId}/whatsappLinks/{phone} {
  allow read: if <mesma checagem de membership que as outras subcoleções do workspace usam>;
  allow write: if false; // só Admin SDK
}
```
Copiar a checagem de membership exata de alguma regra existente equivalente (ex. a de `accounts` ou `categories`) em vez de inventar uma nova — manter consistência. **Rodar `npm run test:rules` depois dessa mudança, sempre.**

**`src/settings/WhatsappLinkSection.tsx`** (novo, dentro de `src/settings/`)
- Botão "Vincular WhatsApp" → chama `generateWhatsappLinkCode` → mostra o código em destaque + um link `https://wa.me/<NUMERO_DO_BOT>?text=vincular%20<codigo>` (o número do bot é uma constante configurada depois que a Meta atribuir o número — usar variável de ambiente/config, não hardcode).

### 4.3 Webhook de recebimento

**`functions/src/whatsapp/webhookHandler.ts`**
- Cloud Function `onRequest`, **pública** (sem auth do Firebase — quem autentica é a assinatura da Meta).
- `GET`: responder ao desafio de verificação da Meta (`req.query['hub.challenge']`) se `req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN`, senão 403.
- `POST`:
  1. Validar `X-Hub-Signature-256` do header contra o corpo bruto da requisição usando HMAC-SHA256 com `WHATSAPP_APP_SECRET`. Se não bater, responder 401 e não processar nada.
  2. Responder `200` pra Meta **imediatamente** (antes de terminar todo o processamento pesado) — a Meta exige resposta rápida e reenvia se não receber 200 a tempo. Processar a lógica de forma que não trave a resposta (ex. responder 200 e continuar processando de forma assíncrona dentro da mesma invocação, já que Cloud Functions v2 não corta a execução ao responder — checar/confirmar esse comportamento antes de depender dele; se não for seguro, considerar enfileirar via um doc Firestore + trigger `onDocumentCreated` para processar separado).
  3. Extrair o número do remetente e o texto da mensagem do payload (formato padrão da Meta Cloud API — `entry[0].changes[0].value.messages[0]`).
  4. Buscar `whatsappLinks/{phoneE164}` em todos os workspaces (ou manter um índice separado `whatsappLinks/{phone}` na raiz, fora de `workspaces/`, pra não precisar varrer todos os workspaces — **prefira essa segunda opção**: `whatsappPhoneIndex/{phoneE164} -> {workspaceId}` como coleção de topo, mais simples de consultar por número).
  5. Se o número não estiver vinculado a nenhum workspace: checar se a mensagem começa com "vincular " — se sim, tratar como fluxo de vínculo (validar código em `users/*/whatsappLinkCodes`, se achar, gravar o link e responder confirmando). Se não, responder pedindo pra vincular a conta pelo app primeiro.
  6. Se estiver vinculado: seguir pro fluxo de extração de gasto (4.4).

### 4.4 Extração de gasto + criação de transação

**`functions/src/whatsapp/extractExpense.ts`**
- Export `async function extractExpense(text: string, categories: {id: string, name: string}[]): Promise<{amountCents: number, description: string, categoryId: string | null, confidence: 'high'|'low'} | null>`.
- Prompt de sistema pro DeepSeek (JSON mode) pedindo pra extrair valor em reais (converter pra centavos), descrição curta, e tentar casar com uma das categorias existentes do workspace (passar a lista de categorias no prompt) ou `null` se não bater com nenhuma.
- Se o modelo não conseguir extrair um valor numérico claro, retornar `null` (não inventa).

**`functions/src/whatsapp/createTransactionFromMessage.ts`**
- Antes de escrever este arquivo: **leia `src/finance/financeService.ts` (função `createTransaction`, hoje por volta da linha 147) e `src/finance/financeSchemas.ts` (schema `createTransactionSchema`, hoje por volta da linha 30) na íntegra.** Reproduzir exatamente os mesmos campos derivados que o client grava: `id` (gerado client-side lá, aqui gerar com `db.collection().doc().id` do Admin SDK), `workspaceId`, `createdBy` (usar o uid do dono do vínculo, e considerar adicionar um jeito de identificar que veio do WhatsApp — checar se `Transaction` type em `src/types/contracts.ts` tem algum campo de origem/source; se não tiver e for importante rastrear, propor adicionar um campo opcional `source: 'whatsapp'` — mas só depois de verificar que isso não quebra `hasOnly([...])` da regra do Firestore, seguindo a REGRA PRINCIPAL do `CLAUDE.md`), `updatedBy`, `competenceMonth`/`cashMonth` (mesma função de cálculo usada no client), `isRecurring: false`, `clientMutationId` (gerar um UUID), `syncStatus: 'synced'`, `version: 1`, `createdAt`/`updatedAt` (`FieldValue.serverTimestamp()` do Admin SDK).
- Escrever direto em `workspaces/{workspaceId}/transactions/{id}` via Admin SDK (`db.doc(...).set(...)`) — Admin SDK ignora `firestore.rules`, então a responsabilidade de gerar o payload certo é 100% desta função. Não existe rede de segurança aqui — testar manualmente lançando e conferindo no app depois de recarregar.

### 4.5 Resposta de confirmação

- Depois de criar a transação (ou decidir não criar por baixa confiança), chamar a **Meta Send API** (`POST https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`, header `Authorization: Bearer WHATSAPP_ACCESS_TOKEN`) mandando texto de volta pro número do usuário:
  - Sucesso: `"✅ Registrado: R$ 5,00 — Bala (Alimentação)"` (formatar valor com a mesma função `formatMoney()` usada no client, importar/reaproveitar se possível).
  - Baixa confiança / sem valor identificado: `"Não consegui entender o valor. Pode reformular? Ex: 'gastei 15 reais no mercado'"`.
  - Categoria não encontrada: registrar mesmo assim sem categoria e avisar: `"✅ Registrado: R$ 5,00 — Bala (sem categoria, você pode categorizar no app)"`.

### 4.6 Testes Fase 2
- Unit test de `extractExpense` com mensagens de exemplo variadas (mock do DeepSeek): valor claro, valor por extenso ("gastei uns 10 conto"), mensagem ambígua, mensagem sem valor.
- Unit test de validação de assinatura do webhook (assinatura válida passa, inválida rejeita com 401).
- Teste de regras (`tests/firestore.rules.test.ts`) cobrindo `whatsappLinks`/`whatsappLinkCodes`/`whatsappPhoneIndex` não graváveis pelo client.
- Teste manual E2E: mandar "gastei 5 reais com uma bala" pro número de teste, confirmar que a transação aparece no app com valor, descrição e (se aplicável) categoria corretos, e que a mensagem de confirmação chegou de volta.
- `npm run typecheck && npm test && npm run test:rules && npm run build`.

## 5. Checklist final antes de considerar pronto

- [ ] Nenhuma chave de API aparece no bundle do client — checar `dist/` depois de `npm run build` (grep por `DEEPSEEK`, `WHATSAPP_ACCESS_TOKEN`, etc., não deve achar nada).
- [ ] `npm run typecheck`, `npm test`, `npm run test:rules`, `npm run build` todos passando.
- [ ] Transação criada via WhatsApp aparece corretamente no app depois de recarregar a página (prova de que o formato bate com o que o client espera).
- [ ] Mensagem ambígua não cria transação errada.
- [ ] Deploy de `firestore.rules` só acontece com autorização explícita do Arthur (`npx firebase deploy --only firestore:rules --project zerou-26757`), igual qualquer outra mudança de regra.
- [ ] Deploy das Cloud Functions (`firebase deploy --only functions`) também só com autorização explícita — é uma ação visível/com efeito em produção.

## 6. Atualização de docs ao final (seguir a tabela do `CLAUDE.md`)

- `CHANGELOG.md`: resumo curto da entrega (3-8 bullets), linkando pra `docs/history/YYYY-MM.md` se o detalhe for grande.
- `SESSAO.md`: só se essas features mudarem o "estado atual" descrito lá (muito provavelmente sim — novo fluxo, novas dependências externas).
- `docs/history/YYYY-MM.md`: detalhe técnico completo da decisão de arquitetura, problemas encontrados, etc.
- `docs/planning/TODOS.md`: fechar os itens relacionados a essas duas features se existirem lá, ou abrir pendências se sobrar algo (ex. "Phase 1.5: sugestões proativas" descrita no plano original mas não implementada ainda).
- `docs/ARCHITECTURE.md`: atualizar a seção de Functions — hoje diz que só existe o scaffold de billing desativado; isso deixa de ser verdade.
- Se `docs/BILLING.md` ou equivalente documentar custos de infra, registrar lá o custo estimado de IA (ver seção de custo no plano original em `docs/planning/PLANO_IA_E_WHATSAPP.md`).

## 7. Referência

O racional completo da decisão de arquitetura (por que Firebase Functions em vez de Vercel, comparação de custo entre provedores de IA, etc.) está em `docs/planning/PLANO_IA_E_WHATSAPP.md`, no mesmo diretório deste arquivo. Ler se precisar do "porquê" por trás de alguma decisão listada aqui.
