# Revisao Camada 2 — Auditoria WhatsApp (06-whatsapp.md)

**Data:** 2026-07-19
**Revisor:** Camada 2
**Arquivo auditado:** `docs/security/auditoria-2026-07-19/06-whatsapp.md`
**Escopo:** Validar cada achado da Camada 1 + caca a lacunas nao encontradas.

---

## Metodo

Para cada achado da Camada 1, classifiquei como:

- **CONFIRMADO** — o achado procede, a evidencia no codigo e solida e a severidade estimada esta correta.
- **SUBESTIMADO** — o achado procede mas a severidade ou o impacto sao maiores que o descrito.
- **SUPERESTIMADO** — o achado procede mas a severidade ou o impacto sao menores que o descrito.
- **FALSO-POSITIVO** — o achado nao procede apos analise do codigo real.

Alem disso, busquei lacunas (GAPS) que o auditor da Camada 1 nao encontrou.

---

## 1. Revisao dos Achados da Camada 1

### WHATSAPP-01 — Ausencia total de autenticacao no webhook (HMAC desativado)

**Classificacao: CONFIRMADO**

O bloco de validacao HMAC esta integralmente comentado em `webhookHandler.ts` linhas 103-116. O TODO na linha 105 confirma que e uma falha conhecida e nao corrigida.

O auditor acertou ao descrever a cadeia de exploracao. Um atacante que conheca a URL do webhook (documentada em WHATSAPP.md) pode POSTAR qualquer payload com `body.object === 'whatsapp_business_account'` e um `msg.from` forjado.

**PoC conceitual (confirmada pela leitura do codigo):**
```http
POST https://southamerica-east1-zerou-26757.cloudfunctions.net/whatsappWebhook
Content-Type: application/json

{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5511999999999",
          "text": { "body": "gastei 500 no mercado" }
        }]
      }
    }]
  }]
}
```
- `res.status(200).json({ ok: true })` e enviado na linha 119 ANTES do try.
- O codigo segue processando: consulta `whatsappPhoneIndex/{phone}`, obtem workspaceId, chama DeepSeek, cria transacao.
- A unica barreira e que o telefone forjado PRECISA existir no indice. Mas com WHATSAPP-06 (forca bruta de codigo), o atacante pode criar indices novos.

**Nota adicional:** o `req.body` e tipado apenas com `as Record<string, unknown>` — nao ha schema validation (Zod, yup, etc.). A estrutura do payload da Meta e replicada "manualmente" com casts. Isso e resiliente a erros de casting (optional chaining + tipagem defensiva) mas significa que QUALQUER payload com `object === 'whatsapp_business_account'` e `messages[0].from` passa.

Severidade: Critica — **CONFIRMADO**.

---

### WHATSAPP-02 — Admin SDK escreve diretamente sem validacao de payload

**Classificacao: CONFIRMADO, com SUBESTIMATIVA**

As tres funcoes de criacao usam `getFirestore().batch()` (Admin SDK) que ignora `firestore.rules`:
- `createTransactionFromMessage.ts` linhas 76-83
- `createCardPurchaseFromMessage.ts` linhas 51-143
- `createCategoryFromMessage.ts` linhas 50-62

Cada uma tem o comentario de que "Admin SDK ignora firestore.rules — a responsabilidade de gerar o payload correto e 100% desta funcao." O auditor acertou o diagnostico central.

**SUBESTIMATIVA — Nenhuma das tres funcoes verifica se o usuario ainda e membro ATIVO do workspace.**

O `linkedByUid` extraido do indice nunca e verificado contra `workspaces/{id}/members/{uid}` no momento do processamento da mensagem. `verifyWorkspaceMembership()` existe em `verifyWorkspaceMembership.ts` e e usado em `generateWhatsappLinkCode` (linha 27 de `linkAccount.ts`) e em `unlinkWhatsapp` (linha 24 de `unlinkWhatsapp.ts`), mas NUNCA no fluxo de processamento de mensagens.

Cenario concreto (nao mencionado pelo auditor):
1. Alice e Bob compartilham um workspace de casal.
2. Alice vincula o WhatsApp ao workspace.
3. Alice e removida do workspace (ou o vinculo do casal termina).
4. O `whatsappPhoneIndex/{phone}` de Alice ainda aponta para o workspace.
5. Alice continua criando transacoes no workspace via WhatsApp, mesmo sem ser mais membro.
6. A remocao de Alice so teria efeito se alguem explicitamente desvinculasse o numero via Admin UI.

Isso e independente de HMAC — mesmo com HMAC reativado, a remocao de um membro nao desvincula o WhatsApp automaticamente.

**Confirmacao no codigo:**
- `webhookHandler.ts` linha 169: extrai `{ workspaceId, linkedByUid }`
- `webhookHandler.ts` linha 181: `userId: pending.userId` (caso pending action)
- `webhookHandler.ts` linha 337: `userId: linkedByUid`
- Em nenhum momento e chamado `verifyWorkspaceMembership`

**Solucao sugerida pelo revisor (alem do que o auditor sugeriu):** adicionar `verifyWorkspaceMembership(db, workspaceId, linkedByUid)` apos a extracao do indice (linha 169) e antes de qualquer operacao de escrita.

Severidade: Critica — **CONFIRMADO com SUBESTIMATIVA** (o cenario de membro removido agrava o impacto).

---

### WHATSAPP-03 — Ausencia de rate limit em criacao de transacoes (apenas perguntas tem)

**Classificacao: CONFIRMADO, com SUBESTIMATIVA**

O rate limit de IA (`checkAiUsageNotExceeded` em `aiRateLimit.ts`) so e aplicado ao intent `question` (webhookHandler.ts linhas 353-368). Os intents `expense`, `income`, `transfer`, `card_purchase` nao tem nenhum rate limit.

**SUBESTIMATIVA 1 — Nao ha rate limit GLOBAL no webhook.**

Nenhuma protecao contra:
- IP-based rate limiting (Cloud Armor, ou implementacao manual)
- Request throttling por minuto (independente de workspace)
- Concorrencia maxima de chamadas simultaneas por remetente

`maxInstances: 10` limita concorrencia mas nao volume total. Um atacante que envie 1000 requisicoes por minuto vai:
- Criar 1000 transacoes no workspace da vitima (se o phone for valido)
- OU gerar 1000 chamadas ao DeepSeek, consumindo cota de API paga
- OU (se o phone nao existir no indice) gerar 1000 escritas `read + write` no Firestore sem criar transacao — mas ainda consumindo recursos.

O auditor mencionou "custos de Firestore/DeepSeek" de passagem mas nao detalhou o impacto financeiro. Como o projeto esta no Blaze, o atacante pode gerar custos reais para o dono:
- DeepSeek API: cada `interpretMessage` custa tokens (~$0.14/1M input tokens, ~$0.28/1M output tokens para deepseek-chat). 1000 chamadas falsas por hora = centavos/dia, mas 10 chamadas/segundo sustentadas = ~$36/mes so de DeepSeek.
- Firestore: cada mensagem gera 1-3 leituras (indice + categorias + contas) e 1-5 escritas (batch). 1000 mensagens/dia = 3000 leituras + 5000 escritas. O free tier (50K leituras, 20K escritas/dia) seria quebrado com ~16 mensagens/minuto sustentadas.

**SUBESTIMATIVA 2 — O `checkAiUsageNotExceeded` tem race condition.**

O fluxo:
1. `checkAiUsageNotExceeded` le o doc de uso (linha 19)
2. Cota verificada (linha 22)
3. Pergunta e respondida (linha 365-366)
4. `incrementAiUsage` e chamado (linha 367)

Entre os passos 1 e 4, outras requisicoes concorrentes podem passar da cota. `incrementAiUsage` usa `FieldValue.increment(1)` com `{ merge: true }`, entao nao ha race na escrita. Mas a LEITURA da cota (passo 1) nao e atomica — o limite real pode ser ultrapassado em ate `maxInstances` vezes concorrentes (10). Para 60/dia isso e relevante: o usuario pode fazer ate 70 perguntas em vez de 60 se todas chegarem simultaneamente.

Isso nao e um problema de seguranca grave, mas e um bug de exatidao de rate limit que o auditor nao notou.

Severidade: Alta — **CONFIRMADO** (a severidade continua Alta, mas com agravantes nao mencionados).

---

### WHATSAPP-04 — Prompt injection no interpretMessage

**Classificacao: CONFIRMADO, com SUBESTIMATIVA em um ponto critico**

O texto do usuario e interpolado diretamente no prompt em `interpretMessage.ts` linha 150:
```typescript
const userMessage = `Mensagem: "${text}"\n\nCategorias disponiveis (id: nome (tipo)):\n${categoryList}\n\nContas disponiveis (id: nome):\n${accountList}`;
```

O auditor acertou os cenarios de injecao e o fato de que dados financeiros sao expostos no `answerFinancialQuestion`.

**SUBESTIMATIVA — `amountCents` nao tem TETO MAXIMO, nem mesmo "sanity check" alem de ser numero positivo.**

Em `interpretMessage.ts` linha 183:
```typescript
const amountCents = typeof parsed.amountCents === 'number' ? Math.round(parsed.amountCents) : 0;
```

Nao ha nenhum limite superior. O `webhookHandler.ts` tambem nao valida:
- Linha 373: `interpretation.amountCents <= 0` — so verifica se e zero ou negativo
- Linha 438: mesma validacao para transferencia
- Linha 527: mesma validacao para expense/income

Ou seja, se o atacante convencer o DeepSeek a retornar `amountCents: 9999999999999` (R$ 99.999.999.999,99), a transacao e criada. O saldo da conta e atualizado (via `FieldValue.increment(deltaCents)`), potencialmente causando overflow numerico ou valores absurdos de saldo.

O auditor mencionou isso como sugestao de correcao mas nao como achado independente. O "sanity check" de valor maximo e uma validacao independente da inducao via prompt — mesmo sem injecao maliciosa, o DeepSeek pode alucinar um numero arbitrariamente grande.

**Outra SUBESTIMATIVA — O prompt inclui IDs reais de categorias e contas, EXPONDO a superficie de ataque.**

```typescript
categoryList = categories.map((c) => `  ${c.id}: ${c.name} (${c.type})`).join('\n');
accountList = accounts.map((a) => `  ${a.id}: ${a.name}`).join('\n');
```

Com injecao de prompt, o atacante nao so manipula a resposta — ele tambem pode EXTRAIR a lista completa de IDs de categorias e contas do workspace (basta pedir pro LLM incluir os dados no JSON de resposta). Com esses IDs em maos, mesmo tendo apenas `confidence: 'high'` e `intent: 'expense'`, o atacante pode especificar `categoryId` e `accountId` exatos para criar transacoes mais especificas.

O auditor mencionou que "nomes de categorias revelam padroes de gasto" mas nao mencionou que os IDs sao o verdadeiro alvo — eles permitem criar transacoes que parecem perfeitamente legitimas (com categoria e conta certas), maximizando o impacto do WHATSAPP-02.

**Verificacao de `categoryId` e `accountId`:**

Em `interpretMessage.ts` linha 193:
```typescript
if (typeof parsed.categoryId === 'string' && categories.some((c) => c.id === parsed.categoryId)) {
  categoryId = parsed.categoryId;
}
```

O `categoryId` so e aceito se existir na lista de categorias carregadas. Isso e seguro — o atacante nao pode injetar um ID arbitrario. Mas ele pode usar QUALQUER categoria existente.

Linha 211:
```typescript
const validAccountId = (id: unknown): string | null =>
  typeof id === 'string' && accounts.some((a) => a.id === id) ? id : null;
```

Mesmo padrao — seguro contra injecao de ID arbitrario, mas permite usar qualquer conta existente.

**Nota sobre `answerFinancialQuestion` — dados financeiros completos enviados ao DeepSeek.**

O `buildFinancialContext` (`buildFinancialContext.ts`) monta um contexto financeiro COMPLETO do usuario:
- Saldos de todas as contas ativas (nome + valor em centavos)
- Transacoes dos ultimos 90 dias (ate 2000)
- Gastos por categoria (top 5)
- Fatura de cartoes de credito
- Metas financeiras (nome + valor guardado + alvo)
- Orcamentos (limite + gasto atual)
- Contas a pagar (avulsas vencidas + recorrentes)
- Dados do perfil (ciclo de recebimento, objetivo/desafio)

Tudo isso e colocado no prompt do DeepSeek (linhas 50-52 de `answerFinancialQuestion.ts`). Uma injecao de prompt bem-sucedida AQUI (na pergunta, nao na extracao) pode extrair o contexto financeiro completo do usuario.

O auditor descreveu isso como agravante de WHATSAPP-04. A Camada 2 concorda com a gravidade mas nota que o auditor poderia ter elevado a severidade para Critica dado o volume de dados expostos.

Severidade: Alta (poderia ser Critica pela exposicao de dados financeiros completos via `answerFinancialQuestion`) — **CONFIRMADO com SUBESTIMATIVA em `amountCents` sem teto.**

---

### WHATSAPP-05 — Ausencia de deduplicacao por message_id da Meta

**Classificacao: CONFIRMADO**

`webhookHandler.ts` linha 135: `const msg = messages[0]` — o objeto `msg` e extraido mas `msg.id` nunca e usado. O `createId('txn')` gera um novo ID a cada processamento, nao reusa ou referencia o `message_id` da Meta.

**PoC (baseada no cenario que o auditor descreveu):**
1. Meta envia webhook com `msg.id = 'wamid.AeG5...'`.
2. `webhookHandler` processa: cria transacao `txn_abc123def456`.
3. Meta reenvia o mesmo webhook (timeout do lado da Meta).
4. O mesmo `msg.id = 'wamid.AeG5...'` chega de novo.
5. `webhookHandler` processa de novo: cria `txn_ghi789jkl012` — transacao duplicada.
6. O workspace da vitima tem duas transacoes de R$ 100,00 no mercado.

**Gravidade:** a duplicata pode ser detectada pelo usuario (que ve valores errados no app), mas como o padrao offline-first do app suprime erros de rede, o usuario confia que o saldo exibido esta correto. A duplicata so aparece quando o usuario investiga transacao a transacao.

O auditor acertou ao notar que `no-cpu-throttling` agrava o problema: o 200 e enviado antes do processamento, entao a Meta nao tem visibilidade de que o processamento falhou ou demorou.

Severidade: Alta — **CONFIRMADO**.

---

### WHATSAPP-06 — Codigo de vinculacao de 6 digitos sem protecao contra forca bruta

**Classificacao: CONFIRMADO, com SUBESTIMATIVA em um cenario**

`linkAccount.ts`:
- `generateCode()`: `crypto.randomInt(100000, 999999)` — 900.000 combinacoes (nao 1.000.000; o auditor errou por 100.000, mas a magnitude e a mesma).
- `processLinkCode()`: nao ha rate limit, contagem de tentativas, nem bloqueio apos falhas.
- TTL: 10 minutos.

O auditor descreveu corretamente a cena de ataque: ~1.667 tentativas/segundo em teoria, ~30-50/s na pratica.

**SUBESTIMATIVA — O codigo NAO e vinculado ao numero de telefone destino.**

Quando Alice gera o codigo "482917" no app, QUALQUER pessoa que enviar "vincular 482917" pelo WhatsApp vai vincular o PRÓPRIO numero ao workspace da Alice. O codigo nao e associado ao numero de telefone que Alice quer vincular.

Cenarios:
1. **Vazamento incidental:** Alice mostra a tela do celular para alguem, ou tira um print e o print vaza. O atacante ve o codigo, envia "vincular 482917" do proprio WhatsApp, e agora o telefone DELE esta vinculado ao workspace da Alice.
2. **Engenharia social:** Atacante liga para Alice fingindo ser suporte e pede o codigo.
3. **Shoulder surfing:** Alguem olha a tela de Alice enquanto ela gera o codigo.

Isso e DIFERENTE de forca bruta — e exploracao de um unico codigo valido, nao de tentativas em massa. O codigo deveria ser vinculado ao numero de telefone destino (ex.: o app deveria pedir o numero antes de gerar o codigo, e o `processLinkCode` deveria verificar se o remetente e o numero esperado).

Atualmente, o `generateWhatsappLinkCode` (linhas 17-63) nunca armazena o numero de telefone destino. O codigo e gerado sem saber para qual numero ele vai. O `processLinkCode` so recebe o `phoneNumber` (quem enviou a mensagem) e nunca valida contra nada.

**Outra SUBESTIMATIVA — O codigo fica armazenado em texto claro no Firestore.**

`users/{uid}/whatsappLinkCodes/{code}` contem o codigo como ID do documento e como campo. Qualquer pessoa com acesso de leitura ao Firestore (mesmo que restrito a `isSelf(uid)`) ve o codigo. Um admin do Firebase console ve todos os codigos ativos. Se o acesso ao console for comprometido, todos os codigos ativos sao expostos.

**Correcao sugerida (alem do que o auditor sugeriu):** o `processLinkCode` deveria verificar que o telefone remetente e o mesmo que o usuario cadastrou (ou que o app informou) ao gerar o codigo. Implementacao possivel: adicionar campo `targetPhone` ao codigo gerado e validar no `processLinkCode`.

Severidade: Media — **CONFIRMADO com SUBESTIMATIVA** (o cenario de codigo vazado/usado por terceiros e um vetor independente da forca bruta, nao mencionado pelo auditor).

---

### WHATSAPP-07 — Pending action sequestravel por forjamento de telefone

**Classificacao: CONFIRMADO**

`pendingAction.ts`: as acoes pendentes sao armazenadas em `whatsappPendingActions/{phone}`. Sem HMAC, atacante forja `msg.from` = telefone da vitima e resolve a pendencia.

O auditor notou corretamente que a janela de exploracao e de 3 minutos (TTL da pendencia) e que o dano e limitado ao escopo da acao pendente (valor ja fixado, so a escolha e manipulavel).

**Confirmacao via codigo:**
- `webhookHandler.ts` linhas 173-174: `const pending = await getPendingAction(db, phone); if (pending) ...`
- `getPendingAction` usa `phone` (do `msg.from` forjado) como chave de busca.
- `resolveSingleSelection` ou `resolveDualSelection` sao chamados com `cleanText` do atacante.

**Agravante nao mencionado pelo auditor:** se o usuario legitimo ja respondeu e a pendencia foi limpa (`clearPendingAction`), o atacante NAO CONSEgue sequestrar porque nao ha pendencia. Mas se o usuario legitimo respondeu com texto que NAO resolveu a pendencia (ex.: "ok" em vez de "1"), a pendencia continua ativa e o atacante pode tentar.

**Outro agravante:** `resolveSingleSelection` aceita TEXTO alem de numeros (linhas 100-105). Se o atacante souber o nome de um cartao/conta, pode envia-lo pelo nome em vez do numero. A comparacao e `includes()` case-insensitive e sem acentos. Ex.: se o cartao e "Nubank Roxinho", o atacante pode enviar "roxinho" e resolver.

Severidade: Media — **CONFIRMADO**.

---

### WHATSAPP-08 — Indice de telefone nao valida se workspace/usuario ainda existe

**Classificacao: CONFIRMADO (a severidade Baixa esta correta)**

`webhookHandler.ts` linhas 156-169: `indexDoc.exists` verifica se o doc existe, mas nao verifica se o `workspaceId` ou `linkedByUid` ainda sao validos.

**Validacao do revisor sobre a severidade:**

Se o workspace foi deletado:
- `createTransactionFromMessage` escreve em `workspaces/{id}/transactions/{txnId}` — o Firestore NAO exige que o documento pai exista para criar subcolecoes. Entao a transacao e criada em um caminho orfao.
- Mas ninguem nunca le desse caminho (o workspace nao existe), entao o dado fica la como lixo.
- No entanto, `createCardPurchaseFromMessage` FARIA a leitura do cartao (linha 47) e FALHARIA com "Cartao nao encontrado." — entao o comportamento varia por funcao.
- `createCategoryFromMessage` consulta categorias existentes (linhas 31-34). A query retorna vazia. Entao a categoria e criada em caminho orfao. Mesmo cenario de lixo.

A severidade Baixa esta correta porque:
1. O dado orfao nao afeta usuarios reais.
2. Ninguem le desses caminhos.
3. O indicie orfao so existe se o workspace foi deletado (evento raro).
4. O bug documentado em WHATSAPP.md (troubleshooting) ja tem correcao via Admin UI.

Mas **nota do revisor**: o auditor descreveu o impacto como "Baixo" mas depois disse "se o workspace ainda existir no Firestore mas sem dados". Isso e impreciso — se o workspace foi deletado, o documento workspace nao existe, mas as subcolecoes sao criadas de qualquer jeito (Firestore nao tem restricao de documento pai). O impacto real e lixo de dados, nao "erro silencioso no catch".

Severidade: Baixa — **CONFIRMADO** (a severidade esta correta, mas a descricao tecnica do impacto tem imprecisoes menores).

---

### WHATSAPP-09 — Verify token documentado em texto claro no repositorio

**Classificacao: CONFIRMADO**

`docs/whatsapp/WHATSAPP.md` linha 43:
```
| Verify token | `granativa-whatsapp-verify-2026` |
```

O token tambem aparece no exemplo de curl na linha 273:
```
curl "https://...?hub.mode=subscribe&hub.verify_token=granativa-whatsapp-verify-2026&hub.challenge=test123"
```

**Impacto real:** o verify token so serve para confirmar que o endpoint responde. Nao e um segredo critico — ele e compartilhado com a Meta e precisa estar nos dois lugares (codigo + painel Meta). Mas documenta-lo em texto claro normaliza a pratica de expor secrets em doc, o que e um anti-pattern.

**Nota do revisor:** o auditor disse que "a unica protecao contra um atacante reconfigurar o webhook da Meta" seria o verify token. Na pratica, reconfigurar o webhook requer acesso ao painel Meta (credenciais do System User ou da conta de desenvolvedor), que sao MUITO mais sensiveis que o verify token. O token sozinho nao permite reconfigurar nada — voce precisa estar logado no painel Meta, que tem seus proprios controles de acesso (2FA, aprovacao de dispositivo, etc.).

Severidade: Baixa — **CONFIRMADO** (a severidade esta correta, talvez ate SUPERESTIMADA — o token e de baixissimo valor ofensivo isoladamente).

---

## 2. Tabela Resumo da Revisao

| ID | Titulo | Severidade Original | Classificacao | Nota |
|---|---|---|---|---|
| WHATSAPP-01 | HMAC desativado | Critica | CONFIRMADO | Sem HMAC, todo o resto e cosmetico |
| WHATSAPP-02 | Admin SDK sem validacao | Critica | CONFIRMADO + SUBESTIMADO | Nenhuma funcao verifica se usuario ainda e membro ativo do workspace |
| WHATSAPP-03 | Rate limit so em perguntas | Alta | CONFIRMADO + SUBESTIMADO | Falta rate limit GLOBAL; race condition no contador de uso |
| WHATSAPP-04 | Prompt injection | Alta | CONFIRMADO + SUBESTIMADO | `amountCents` sem teto maximo; IDs de contas/categorias extraiveis |
| WHATSAPP-05 | Sem dedup por message_id | Alta | CONFIRMADO | `msg.id` extraido mas ignorado |
| WHATSAPP-06 | Codigo 6 digitos sem forca bruta | Media | CONFIRMADO + SUBESTIMADO | Codigo nao e vinculado ao numero destino; vazamento permite sequestro |
| WHATSAPP-07 | Pending action sequestravel | Media | CONFIRMADO | Depende de timing (janela de 3 min) |
| WHATSAPP-08 | Indice sem validacao de existencia | Baixa | CONFIRMADO | Impacto e lixo de dados, nao falha de seguranca |
| WHATSAPP-09 | Verify token documentado | Baixa | CONFIRMADO | Baixo valor ofensivo; anti-pattern de documentacao |

---

## 3. Lacunas — O Que o Auditor NAO Encontrou

### GAP-01 — `amountCents` sem teto maximo (Médio-Alto)

**Local:** `interpretMessage.ts` linha 183, `webhookHandler.ts` linhas 373/438/527
**Tipo:** Lacuna total (nao mencionado como achado separado)

O `amountCents` retornado pelo DeepSeek sofre `Math.round()` mas NUNCA tem um limite superior verificado. O LLM pode retornar qualquer valor positivo, inclusive:
- `amountCents: 9999999999999` (R$ 99.999.999.999,99) via prompt injection
- `amountCents: 999999999` via alucinacao (DeepSeek confunde "15 reais" com "15000000 centavos")

Nem `interpretMessage.ts`, nem `webhookHandler.ts`, nem `createTransactionFromMessage.ts` validam um teto maximo. O `FieldValue.increment(deltaCents)` no saldo da conta aceitaria o valor sem reclamar (Firestore numero e 64-bit signed, mas JavaScript Number perde precisao apos 2^53 ~ 9.007.199.254.740.991 centavos).

**Impacto:** transacao de R$ 99.999.999.999,99 criada no workspace, saldo da conta corrompido, dificil de reverter (precisa de transacao corretiva manual no Firestore).

**Correcao sugerida:** adicionar `MAX_SANE_AMOUNT_CENTS = 100_000_000` (R$ 1.000.000,00) em `webhookHandler.ts` e validar antes de criar qualquer transacao.

---

### GAP-02 — Codigo de vinculacao nao vinculado ao numero destino (Médio)

**Local:** `linkAccount.ts` — `generateWhatsappLinkCode` e `processLinkCode`
**Tipo:** Lacuna total (nao mencionado como achado separado)

O `generateWhatsappLinkCode` gera um codigo de 6 digitos sem registrar para qual numero de telefone ele foi gerado. O `processLinkCode` aceita qualquer numero que enviar o codigo.

Isso significa que se Alice gera o codigo "482917" e o codigo vazar (print, shoulder surfing, screenshot compartilhado), QUALQUER pessoa que enviar "vincular 482917" do WhatsApp vai vincular O PROPRIO numero ao workspace da Alice. O atacante nao precisa forcagar — ele so precisa do codigo legitimo.

**Diferenca entre GAP-02 e WHATSAPP-06:** WHATSAPP-06 cobre forca bruta (adivinhar codigos). GAP-02 cobre uso indevido de um codigo legitimo por pessoa nao autorizada. Sao vetores independentes.

**Impacto:** vinculacao fraudulenta de um numero de terceiro ao workspace da vitima. O atacante pode entao criar transacoes.

**Correcao sugerida:** adicionar campo `targetPhone` ao codigo em `generateWhatsappLinkCode` (o app pode pedir o numero antes de gerar o codigo). Em `processLinkCode`, verificar se o `phoneNumber` remetente corresponde ao `targetPhone` armazenado.

---

### GAP-03 — Ausencia de rate limit GLOBAL no webhook (Médio)

**Local:** `webhookHandler.ts` — nenhum rate limit no nivel da funcao
**Tipo:** Mencionado de passagem, nao como achado independente

O auditor mencionou brevemente no WHATSAPP-03 que "nao ha absolutamente nenhum rate limit" para transacoes, mas nao tratou a ausencia de rate limit GLOBAL como achado separado.

- Nao ha rate limit por IP.
- Nao ha rate limit por numero de telefone (independente de workspace).
- Nao ha rate limit por minuto no total de requisicoes.
- `maxInstances: 10` limita concorrencia, nao volume.

Um atacante com acesso a internet pode bombardear o webhook com milhares de POSTs por minuto. Cada POST:
- Acorda uma instancia (cold start ~2-5s, mas tem CPU)
- Le `req.body` e faz parsing (minimo, mas ainda custa)
- Se `body.object === 'whatsapp_business_account'` e `messages[0].from` e um numero valido, le o indice (1 Firestore read)
- Se o numero nao estiver vinculado: 1 Firestore read + `sendWhatsAppMessage` (1 chamada HTTP a Meta)
- Se estiver vinculado: `interpretMessage` (1 chamada DeepSeek) + `categories` query (leitura) + `accounts` query (leitura) + batch write (escritas)

**Impacto financeiro (Blaze):**
- DeepSeek API: ~$0.14/1M input tokens. `interpretMessage` envia ~500-1000 tokens de input. 1000 requisicoes = ~$0.14-0.28 so de input.
- Firestore: 1000 requisicoes/min = 1000-5000 leituras + 0-5000 escritas. O free tier e 50K leituras/dia e 20K escritas/dia. Em 1 hora de ataque sustentado (60.000 requisicoes), o free tier de leituras e estourado e comeca a custar.
- Cloud Run: cada invocacao custa ~$0.0000025 (512MB, 1s de processamento). 1000 requisicoes = $0.0025. O custo e baixo, mas se acumula.

**Nota:** o ataque de custo nao e grave financeiramente (milhares de requisicoes custariam alguns reais), mas e suficiente para poluir dados do workspace (milhares de transacoes falsas).

---

### GAP-04 — `sendWhatsAppMessage` engole erros silenciosamente (Baixo)

**Local:** `metaClient.ts` linhas 51-57
**Tipo:** Lacuna total

```typescript
if (!response.ok) {
  const body = await response.text().catch(() => '');
  logger.warn('whatsapp_send_failed', { ... });
}
// Nao ha throw — o fluxo continua como se a mensagem tivesse sido enviada
```

Se a Meta API rejeitar o envio (user bloqueou o bot, numero invalido, CSW expirada, token expirado), o erro e logado mas o callers nunca sabe. A transacao foi criada com sucesso, mas o usuario nunca recebe confirmacao.

**Cenario:** usuario legitimo cria transacao. `sendWhatsAppMessage` falha (CSW expirou, o usuario nao mandou mensagem nas ultimas 24h). O usuario nao ve confirmacao e pensa que a transacao nao foi criada. Manda "gastei 50 no mercado" de novo. Agora sao DUAS transacoes de R$ 50.

**Correcao sugerida:** pelo menos logar warning com contexto suficiente para debug, ou retornar booleano de sucesso para que o caller decida se deve notificar o usuario de outra forma.

---

### GAP-05 — `createCardPurchase` nao valida se o cartao permanece ativo no momento da criacao (Baixo-Médio)

**Local:** `createCardPurchaseFromMessage.ts` linhas 47-49
**Tipo:** Lacuna total

```typescript
const cardSnap = await db.doc(`workspaces/${input.workspaceId}/cards/${input.cardId}`).get();
if (!cardSnap.exists) throw new Error('Cartão não encontrado.');
```

A funcao verifica se o cartao existe, mas NAO verifica se `isActive !== false`. No fluxo direto (sem pending action), o `webhookHandler` carrega cartoes ativos (linhas 385-387) e so passa cartoes ativos. Mas no fluxo de pending action:

1. Bot lista cartoes ativos (momentos 0).
2. Usuario demora ate 3 minutos para responder.
3. Nesse intervalo, o dono desativa um cartao no app.
4. Usuario responde, pending action resolve com `cardId` do cartao que agora esta inativo.
5. `createCardPurchaseFromMessage` cria a compra sem verificar `isActive`.

**Impacto:** compra registrada em um cartao que o usuario desativou. O saldo da fatura continua sendo calculado pela Cloud Function independentemente do status do cartao, entao a compra "funciona" — mas o usuario nao espera ver lancamentos em um cartao que desativou.

**Correcao sugerida:** adicionar `card.isActive !== false` a verificacao em `createCardPurchaseFromMessage`. Se o cartao foi desativado, lancar erro e informar o usuario.

---

### GAP-06 — `interpretMessage` nao valida que `installments` e compativel com `amountCents` (Baixo)

**Local:** `interpretMessage.ts` linhas 188-190
**Tipo:** Lacuna total

```typescript
const installments = typeof parsed.installments === 'number' && Number.isInteger(parsed.installments)
  ? Math.min(Math.max(parsed.installments, 1), 24)
  : 1;
```

O DeepSeek pode retornar `installments: 24` com `amountCents: 1` (R$ 0,01 em 24 parcelas). `createCardPurchaseFromMessage` criaria 24 entradas de ledger de 0 ou 1 centavo cada (devido ao `installmentAmounts` com `Math.floor`), potencialmente em 24 faturas diferentes.

Isso e mais um problema de qualidade de dados que de seguranca, mas o auditor poderia ter mencionado a falta de consistencia entre campos extraidos pelo LLM.

---

### GAP-07 — Race condition no uso do codigo de vinculacao (Baixo)

**Local:** `linkAccount.ts` linhas 81-125
**Tipo:** Lacuna total

O `processLinkCode` nao usa transacao. Duas requisicoes simultaneas com o mesmo codigo valido podem passar das verificacoes concorrentemente:

1. Requisicao A: `collectionGroup('whatsappLinkCodes').where('code', '==', '123456').get()` — encontra o codigo.
2. Requisicao B: mesma query — encontra o mesmo codigo (ainda nao deletado).
3. Requisicao A: `whatsappPhoneIndex/{phoneA}.get()` — nao existe. Escreve batch (cria vinculo A + deleta codigo).
4. Requisicao B: `whatsappPhoneIndex/{phoneB}.get()` — nao existe (phoneB diferente). Escreve batch (cria vinculo B + deleta codigo — que ja foi deletado por A, entao o delete e no-op).

Resultado: dois numeros de telefone diferentes vinculados ao mesmo workspace (ou a workspaces diferentes, dependendo de qual codigo foi gerado por qual workspace). O batch de B sobrescreve o vinculo de A silenciosamente.

Na pratica, a probabilidade e baixa (duas pessoas precisam enviar o mesmo codigo ao mesmo tempo), mas a falta de atomicidade e um bug real.

**Correcao sugerida:** usar transacao do Firestore (`runTransaction`) em vez de batch para as operacoes de verificacao de codigo + criacao de vinculo.

---

### GAP-08 — Nao ha validacao de que `msg.text.body` e de fato texto (nao imagem, audio, etc.) (Informativo)

**Local:** `webhookHandler.ts` linhas 135-138
**Tipo:** Nao e falha de seguranca, e falta de robustez

```typescript
const msg = messages[0];
const phone = (msg.from as string)?.trim();
const text = (msg.text as Record<string, unknown>)?.body as string | undefined;
```

O codigo assume que toda mensagem tem `msg.text.body`. Se o usuario enviar uma imagem, `msg.text` sera undefined, e o fluxo retorna sem resposta (o usuario nao recebe nem "nao entendi"). Mensagens de interacao (botao, lista) tem estrutura diferente (`msg.button`, `msg.interactive`).

O auditor poderia ter mencionado que mensagens nao-texto sao silenciosamente ignoradas, o que pode ser confuso para o usuario (ele manda uma imagem e nao recebe resposta nenhuma).

---

## 4. Gravidade dos Gaps Encontrados

| ID | Titulo | Severidade | Nota |
|---|---|---|---|
| GAP-01 | `amountCents` sem teto maximo | Medio-Alto | Mesmo sem injecao de prompt, o LLM pode alucinar valor arbitrario |
| GAP-02 | Codigo de vinculacao nao vinculado ao numero destino | Medio | Vazamento do codigo permite sequestro do vinculo |
| GAP-03 | Ausencia de rate limit GLOBAL no webhook | Medio | DoS financeiro (Blaze) + poluicao de dados |
| GAP-04 | `sendWhatsAppMessage` engole erros silenciosamente | Baixo | Usuario nao sabe que transacao foi criada; pode duplicar |
| GAP-05 | `createCardPurchase` nao valida `isActive` do cartao | Baixo-Medio | Compra criada em cartao que o usuario desativou |
| GAP-06 | `installments` inconsistente com `amountCents` | Baixo | Problema de qualidade de dados, nao seguranca |
| GAP-07 | Race condition no uso do codigo de vinculacao | Baixo | Dois numeros podem vincular com o mesmo codigo simultaneamente |
| GAP-08 | Mensagens nao-texto ignoradas silenciosamente | Info | UX, nao seguranca |

---

## 5. Observacoes Finais

### Qualidade geral da auditoria da Camada 1

A auditoria original e de boa qualidade. Os 9 achados cobrem corretamente a superficie de ataque principal. O diagnostico de que WHATSAPP-01 (HMAC) e a raiz de quase todos os outros problemas e preciso.

**Principais fraquezas da auditoria original:**

1. **Subestimou o `amountCents` sem teto maximo** — tratou como detalhe de correcao, nao como achado independente.
2. **Nao notou que o codigo de vinculacao nao e vinculado ao numero destino** — o cenario de vazamento do codigo (print, shoulder surfing) e diferente de forca bruta e merecia achado separado.
3. **Nao verificou `verifyWorkspaceMembership`** — o fato de que nenhuma funcao de processamento de mensagem valida se o `linkedByUid` ainda e membro ativo do workspace e uma lacuna grave.
4. **Nao testou a race condition no rate limit** — o `checkAiUsageNotExceeded` + `incrementAiUsage` tem uma janela entre leitura e escrita que permite estourar o limite em ate 10x o valor configurado.

### Cadeia de confianca real (apos esta revisao)

A cadeia original do auditor:
```
POST (anonimo) -> msg.from -> phoneIndex -> workspaceId -> Admin SDK -> Firestore
```

Apos esta revisao, adicionando os gaps:
```
POST (anonimo) -> msg.from -> phoneIndex
  |-> NUNCA verifica se linkedByUid ainda e membro ativo do workspace [GAP implícito em WHATSAPP-02]
  |-> NUNCA verifica se workspace existe [WHATSAPP-08]
  |-> NUNCA verifica amountCents maximo [GAP-01]
  |-> NUNCA deduplica por message_id [WHATSAPP-05]
  |-> sendWhatsAppMessage falha silenciosamente [GAP-04]
```

### Recomendacao (Camada 2)

O maior risco continua sendo WHATSAPP-01 (HMAC desativado). Enquanto o HMAC estiver desativado, QUALQUER vulnerabilidade no processamento do webhook e exploravel remotamente sem autenticacao. A prioridade zero e:

1. Reativar HMAC com `WHATSAPP_APP_SECRET` correto.
2. Adicionar `verifyWorkspaceMembership` no processamento de mensagens.
3. Adicionar teto maximo para `amountCents`.
4. Vincular codigo de vinculacao ao numero destino.
5. Adicionar rate limit por workspace para transacoes (nao so perguntas).

Os gaps GAP-01 e GAP-02 sao independentes de HMAC — continuam existindo mesmo com HMAC reativado.

---

*Fim do relatorio de revisao. 9 achados revisados (9 CONFIRMADOS, 4 com SUBESTIMATIVA). 7 gaps novos encontrados (1 Medio-Alto, 2 Medios, 3 Baixos, 1 Informativo).*
