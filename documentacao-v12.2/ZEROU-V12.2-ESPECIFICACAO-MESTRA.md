# Zerou SaaS — Especificação Mestra v12.2

> **Versão 12.1 — execução incremental, marca Zerou consolidada, MVP controlado e Stripe customizado**
>
> Este documento é a fonte de verdade do produto e da arquitetura. Ele **não** é um comando para implementar tudo em uma única execução. A implementação deve seguir exclusivamente os seis prompts operacionais do diretório `prompts/`, um por vez.

---

# 0. Objetivo do produto

Criar um SaaS web/PWA de organização financeira pessoal e compartilhada chamado **Zerou**. A marca deve ser aplicada de forma consistente em qualquer texto visível ao usuário, PWA manifest, metadados, landing page e comunicação transacional.

O produto deve atender múltiplos usuários independentes e múltiplos workspaces isolados. Não é um app privado para um casal específico.

## Proposta de valor

**Organize suas finanças pessoais e do casal sem misturar o que é individual com o que é compartilhado.**

## Identidade canônica da marca

```text
Marca exibida: Zerou
Tagline oficial: Controle individual. Organização a dois.
Descritor curto: Finanças pessoais e a dois.
```

A identidade visual oficial está definida em `BRAND-GUIDELINES.md`. O sistema de temas da interface autenticada está definido em `THEME-SYSTEM.md`. O agente deve consultar também `BRAND-ASSET-INTEGRATION.md` antes de implementar shell, PWA manifest, favicon, onboarding, landing page, SEO ou emails.

Regras:

- não exibir o nome provisório anterior em qualquer superfície visível ao usuário;
- não substituir a identidade Zerou por logo temporário genérico quando os assets oficiais estiverem disponíveis;
- usar índigo como cor principal institucional da marca e verde apenas como acento secundário ou estado semântico positivo;
- não fixar cores institucionais diretamente nos componentes: a interface autenticada deve consumir tokens semânticos definidos por tema;
- preservar a proposta de autonomia individual com organização financeira a dois.

## Diferenciais do MVP

1. Espaço pessoal privado e espaço compartilhado coexistem sem vazamento de dados.
2. Compra no cartão e pagamento da fatura não são contabilizados como duas despesas.
3. A fatura permite múltiplos pagamentos, amortização parcial e crédito excedente.
4. Um gasto compartilhado pago com fonte pessoal revela somente o resumo necessário ao parceiro.
5. A interface é clara, calma, mobile-first e utilizável offline.

---

# 1. Regras absolutas

1. Nunca codificar nomes, emails ou identificadores específicos de usuários.
2. Nunca presumir um único casal.
3. Nunca armazenar todos os usuários em um único documento.
4. Nunca permitir leitura cruzada entre workspaces.
5. Nunca confiar em `workspaceId`, `role`, `planId`, `subscriptionStatus`, preço ou `entitlements` enviados pelo frontend.
6. Nunca liberar recurso pago somente por verificação local.
7. Nunca criar mock permanente, botão decorativo ou integração fictícia.
8. Nunca prometer integração bancária automática sem adapter real e configuração explícita.
9. Nunca contabilizar compra no cartão e pagamento da fatura como duas despesas.
10. Nunca armazenar valores monetários como ponto flutuante. Usar inteiros em centavos (`amountCents`).
11. Nunca publicar textos jurídicos com placeholders pendentes ou sem revisão jurídica humana.
12. Nunca expor dados financeiros detalhados em analytics, logs ou painel administrativo padrão.
13. Nunca usar Dexie como uma segunda fila concorrente para escritas financeiras já cobertas pelo Firestore.
14. Nunca instalar a Stripe Firebase Extension nesta arquitetura. O billing padrão é customizado.
15. Nunca executar duas fases operacionais no mesmo comando.

---

# 2. Escopo do MVP e cortes conscientes

## Incluído no MVP

| Área | Escopo mínimo obrigatório |
|---|---|
| Fundação | React, TypeScript strict, Firebase, PWA, sistema de temas configurável, emuladores |
| Conta | Email/senha, Google, vínculo de provedores, recuperação, onboarding |
| Workspaces | Pessoal privado, casal com até dois membros, isolamento por regras |
| Financeiro | Contas, categorias, transações, transferências, ajustes e busca básica |
| Dashboard | Saldo, disponível livre v1, compromissos próximos e transações recentes |
| Organização essencial | Contas a pagar e recorrências básicas necessárias ao dashboard |
| Offline | Cache persistente Firestore, sync visível, idempotência e recuperação |
| Cartões | Cartões, faturas, ledger, pagamentos parciais, antecipação e estornos |
| Casal | Convite, claims com resumo, aprovações básicas e acertos |
| SaaS | Catálogo, entitlements server-side, Checkout, Portal e webhooks Stripe customizados |
| Lançamento | Landing estática, pricing, FAQ, páginas jurídicas, cookies e Privacy Center básico |

## Pós-MVP

Metas sofisticadas, provisões avançadas, orçamento avançado, importação CSV/OFX/XLSX, OCR, automações, admin completo, landing 3D e relatórios avançados ficam em `BACKLOG-POST-MVP.md`. Os seis temas oficiais pertencem à fundação do MVP.

---

# 3. Stack obrigatória

## Frontend

- React 18+
- TypeScript strict
- Vite
- Tailwind CSS
- CSS Variables
- React Router
- Zustand
- React Hook Form
- Zod
- date-fns com locale pt-BR
- Recharts somente quando necessário
- Framer Motion somente para transições discretas
- Lucide React
- Vite PWA Plugin
- Vitest
- React Testing Library
- Playwright

## Backend e infraestrutura

- Firebase Auth
- Cloud Firestore
- Firebase Storage
- Firebase App Check
- Firebase Hosting
- Cloud Functions for Firebase de 2ª geração em TypeScript
- Node.js 22 como runtime preferencial; Node.js 20 é fallback aceitável quando exigido pelo ambiente
- Firebase Emulator Suite
- Cloud Scheduler somente quando necessário
- Stripe Billing, Checkout e Customer Portal por adapter próprio
- adapter de email transacional configurável

## Região

Usar `southamerica-east1` quando suportado e adequado. Documentar exceções técnicas.

---

# 4. Arquitetura SaaS

## Princípio central

Todos os dados financeiros pertencem a um workspace.

```text
1 usuário autenticado
→ perfil próprio
→ workspace pessoal privado criado no onboarding
→ zero ou um workspace compartilhado ativo no MVP
```

## Workspaces

- `personal`: exatamente um membro ativo com role `owner`;
- `couple`: no máximo dois membros ativos: `owner` e `partner`;
- `viewer`: tipo preparado em contrato, mas desabilitado no MVP.

## Estrutura canônica Firestore

```text
/users/{uid}
/users/{uid}/workspaceRefs/{workspaceId}

/workspaces/{workspaceId}
/workspaces/{workspaceId}/members/{uid}
/workspaces/{workspaceId}/accounts/{accountId}
/workspaces/{workspaceId}/categories/{categoryId}
/workspaces/{workspaceId}/transactions/{transactionId}
/workspaces/{workspaceId}/bills/{billId}
/workspaces/{workspaceId}/recurring/{recurringId}
/workspaces/{workspaceId}/cards/{cardId}
/workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}
/workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}/ledger/{entryId}
/workspaces/{workspaceId}/sharedExpenseClaims/{claimId}
/workspaces/{workspaceId}/settlements/{settlementId}
/workspaces/{workspaceId}/comments/{commentId}
/workspaces/{workspaceId}/auditLogs/{id}

/coupleInvites/{inviteId}
/billingAccounts/{billingAccountId}
/billingAccounts/{billingAccountId}/subscriptions/{subscriptionId}
/billingAccounts/{billingAccountId}/billingEvents/{stripeEventId}
/planCatalog/{planId}
/privacyRequests/{requestId}
```

Os contratos completos estão em `CONTRATOS-CANONICOS.md`.

## Autorização

Toda leitura financeira exige membership ativa no workspace. Toda escrita exige membership ativa, role compatível, schema válido, campos protegidos bloqueados e timestamps do servidor.

Operações críticas devem ocorrer em Cloud Functions quando dependerem de:

- alteração de membership;
- convite;
- ledger de cartão;
- acerto compartilhado;
- entitlement;
- assinatura;
- campo protegido;
- auditoria obrigatória.

---

# 5. Autenticação e conta

## Métodos obrigatórios

- email e senha;
- Google Sign-In;
- recuperação de senha;
- verificação de email;
- vínculo e desvínculo seguro de provedores;
- reautenticação recente para operações sensíveis.

## Princípio

```text
1 pessoa = 1 uid Firebase Auth = 1 perfil Zerou
```

Nunca mesclar automaticamente dados de dois UIDs. Conflitos de credenciais devem interromper o fluxo e orientar recuperação assistida.

## Onboarding

1. nome, moeda BRL, aceite dos termos e ciência da política;
2. criação server-side do workspace pessoal;
3. escolha entre uso individual, criação de espaço compartilhado ou entrada por convite;
4. criação opcional da primeira conta e saldo inicial explícito.

---

# 6. Motor financeiro

## Regra contábil central

```text
Compra no cartão = despesa reconhecida
Pagamento da fatura = quitação de passivo
Nunca contabilizar ambos como despesa
```

## Valores monetários

Todos os valores persistidos devem usar inteiros em centavos:

```typescript
amountCents: number // inteiro seguro; nunca float monetário
```

A UI formata BRL apenas na borda de apresentação.

## Contas e saldos

- conta corrente;
- poupança;
- carteira;
- carteira digital;
- dinheiro;
- investimento;
- conta compartilhada.

Saldo calculado por ledger/transações. Ajustes são explícitos e auditáveis.

## Dashboard v1

A home deve responder:

1. quanto tenho;
2. quanto está comprometido;
3. quanto posso gastar até a próxima entrada prevista;
4. o que vence em breve;
5. o que aconteceu recentemente.

## Disponível livre v1

```text
saldo disponível
- contas a pagar antes da próxima receita prevista
- recorrências previstas no período
- faturas com vencimento no período
= disponível livre v1
```

Não incluir provisões sofisticadas no MVP.

---

# 7. Cartões e faturas

## Regra

Toda mutação relevante de fatura gera uma entrada imutável de ledger com `idempotencyKey`.

## Casos obrigatórios

- compra;
- fechamento;
- vencimento;
- múltiplos pagamentos;
- pagamento parcial;
- pagamento antecipado;
- pagamento acima do saldo;
- crédito excedente;
- estorno;
- chargeback;
- juros;
- multa;
- IOF;
- tarifa;
- parcelamento;
- antecipação de parcelas;
- conciliação básica.

O cálculo de fatura deve existir como módulo de domínio puro, coberto por testes unitários extensos.

---

# 8. Espaço compartilhado

## Convite

Suportar código digitável, link e QR Code baseados no mesmo token lógico.

Requisitos:

- salvar somente hash;
- validade padrão de 48 horas;
- uso único;
- revogação;
- novo código invalida o anterior;
- rate limit;
- logs sem código puro;
- validação server-side;
- máximo de dois membros ativos;
- confirmação explícita antes do vínculo.

## Privacidade

Um gasto compartilhado pago com fonte pessoal cria somente uma projeção segura no workspace do casal:

```text
SharedExpenseClaim.sourceVisibility = 'summary_only'
```

Nunca revelar conta pessoal, fatura pessoal completa ou histórico pessoal ao parceiro.

---

# 9. Billing Stripe customizado

## Decisão

Não usar `stripe/firestore-stripe-payments`. Implementar somente o adapter próprio.

```typescript
interface BillingProvider {
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string }>;
  createCustomerPortalSession(userId: string): Promise<{ url: string }>;
  ingestWebhook(rawBody: Buffer, signature: string): Promise<void>;
}
```

## Fluxo obrigatório

```text
Stripe
→ webhook HTTP onRequest
→ validar assinatura usando rawBody
→ persistir billingEvents/{stripeEventId} de forma idempotente
→ responder 2xx rapidamente
→ processador assíncrono aplicar estado autoritativo
→ recalcular entitlements server-side
→ marcar evento como processed ou failed
```

Não executar chamadas externas ou emails dentro de callbacks de transação Firestore.

## Fonte de verdade

```text
Stripe para cobrança externa
→ registros sincronizados server-side no Firestore
→ serviço central de entitlements
→ backend revalida operações sensíveis
→ UI exibe estado derivado
```

## Aplicação do plano

- o plano do usuário determina recursos pessoais;
- o plano do owner determina recursos do workspace compartilhado;
- o parceiro usa recursos habilitados dentro do workspace compartilhado;
- o plano do owner não libera Premium no workspace pessoal do parceiro.

---

# 10. Offline-first

## Firestore

Usar cache persistente atual do Firestore Web como mecanismo primário para escritas financeiras offline.

## Dexie

Usar somente para casos locais explícitos não cobertos adequadamente pelo Firestore, por exemplo:

- blobs de comprovantes pendentes;
- índice local de busca;
- diagnósticos;
- uploads pendentes.

## Requisitos

- não duplicar fila de escrita financeira;
- mostrar status de sincronização;
- preservar idempotência;
- expor conflitos relevantes;
- limpar dados locais no logout quando solicitado;
- alertar sobre uso em dispositivo compartilhado.

---

# 11. Segurança, privacidade e LGPD

## Obrigatório

- Security Rules testadas no Emulator;
- App Check gradual e depois enforcement em endpoints aplicáveis;
- validação Zod no backend;
- rate limit;
- secrets somente no backend;
- logs redigidos;
- trilha de auditoria;
- Storage privado por workspace;
- headers de segurança;
- CSP;
- backups documentados;
- alertas de custo;
- exportação e exclusão de conta;
- consentimentos separados;
- textos jurídicos com placeholders até revisão humana.

## Analytics proibido

Nunca enviar descrição de transação, valor, estabelecimento, comprovante, código de convite, token, senha, número completo de cartão, comentário ou nota financeira.

---

# 12. Design system e UX

## Direção

```text
sofisticado
claro
calmo
elegante
organizado
confiável
minimalista
premium discreto
```

## Sistema de temas obrigatório no MVP

A identidade institucional da Zerou e a aparência da interface são camadas distintas.

- logo, app icon, favicon e landing pública preservam a identidade oficial;
- componentes da área autenticada consomem tokens semânticos, nunca cores literais;
- a preferência visual pertence ao usuário individual e não ao workspace;
- o tema escolhido por um parceiro não altera a interface do outro;
- aplicar a preferência local antes do primeiro render para evitar flash visual;
- sincronizar a preferência em `/users/{uid}` após autenticação;
- suportar modo `system`, resolvendo claro como Paper e escuro como Obsidian.

Implementar desde a Fase 1:

```text
Paper | Sakura | Obsidian | Midnight | Aurora | Rose Gold
```

A fonte de verdade completa, incluindo tokens, valores iniciais, persistência, rota de configurações e testes, está em `THEME-SYSTEM.md`.

## Mobile navigation

```text
Início | Transações | + | Relatórios | Mais
```

## Proibições visuais

Sem neon, excesso de roxo, glow, vidro excessivo, dashboard cripto, animação constante, sombras fortes ou cards demais.

---

# 13. Landing de lançamento

A landing do MVP é estática, responsiva e leve. Não incluir WebGL, Three.js ou 3D na primeira versão.

## Rotas públicas

```text
/
/pricing
/features
/security
/help
/contact
/legal/terms
/legal/privacy
/legal/cookies
/legal/subprocessors
/login
/register
/forgot-password
/verify-email
/join/:code
```

## Hero

```text
Organize suas finanças.
Compartilhe o que faz sentido.

Controle sua vida financeira pessoal e do casal no mesmo app,
sem misturar o que deve permanecer privado.

[ Começar grátis ] [ Ver como funciona ]
```

## Metas

- mobile-first;
- conteúdo indexável;
- app privado com `noindex`;
- LCP <= 2,5 s em mobile razoável;
- CLS <= 0,1;
- INP <= 200 ms quando possível;
- acessibilidade e navegação por teclado.

---

# 14. Fases obrigatórias

| Fase | Prompt | Gate principal |
|---|---|---|
| 1 | `01-FUNDACAO-SAAS.md` | login e workspace pessoal isolado funcionando |
| 2 | `02-MOTOR-FINANCEIRO-ESSENCIAL.md` | transação offline sincroniza sem duplicar |
| 3 | `03-CARTOES-E-FATURAS.md` | ledger passa nos testes de pagamento parcial e dupla contagem |
| 4 | `04-ESPACO-COMPARTILHADO.md` | dois usuários compartilham casal sem vazar pessoal |
| 5 | `05-BILLING-STRIPE-CUSTOM.md` | checkout test mode, webhook idempotente e entitlements corretos |
| 6 | `06-LANCAMENTO-LANDING-JURIDICO.md` | landing, jurídico, privacidade, QA e documentação de deploy |

---

# 15. Definition of Done por fase

Antes de encerrar qualquer fase:

1. executar lint;
2. executar typecheck;
3. executar testes unitários;
4. executar testes de regras quando aplicáveis;
5. executar testes E2E relevantes;
6. corrigir falhas dentro do escopo;
7. atualizar `IMPLEMENTATION_STATUS.md`;
8. registrar decisões arquiteturais novas;
9. listar pendências externas reais;
10. parar sem antecipar a fase seguinte.

---

# 16. Entregáveis finais acumulados

- aplicação React/PWA;
- Functions TypeScript;
- Firebase config;
- Firestore Rules;
- Storage Rules;
- indexes;
- testes;
- emuladores;
- Stripe adapter;
- billing event processor;
- email adapter;
- landing;
- páginas jurídicas;
- Privacy Center;
- `.env.example`;
- `README.md`;
- `ARCHITECTURE.md`;
- `SECURITY.md`;
- `BILLING.md`;
- `PRIVACY.md`;
- `RUNBOOK.md`;
- `IMPLEMENTATION_STATUS.md`.
