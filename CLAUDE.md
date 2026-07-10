# Zerou — instruções para agentes (Claude)

## Leitura inicial obrigatória

1. Leia `SESSAO.md` (brief curto do estado atual).
2. Use `docs/BUSCA_RAPIDA.md` para decidir qual contexto abrir.
3. Não abra arquivos grandes por padrão. Use `rg`/Grep primeiro em `docs/history/` e nos docs de referência.

## ⚠️ Pendências urgentes anotadas em 2026-07-09 (remover esta seção ao resolver)

Achados durante a auditoria de regras do Firestore desta sessão — não são bugs confirmados em produção, mas riscos concretos que valem correção:

1. **Java local quebrado bloqueia `npm run test:rules`** (erro `3221226505`, já listado em `docs/planning/TODOS.md`) — é a ferramenta que pegaria automaticamente o padrão de bug descrito na seção "⚠️ REGRA PRINCIPAL: todo valor novo de enum num payload do Firestore precisa atualizar a regra no MESMO commit" (mais abaixo neste arquivo; 2 incidentes reais já, o segundo achado numa auditoria desta mesma sessão). Resolver antes da próxima mudança em `firestore.rules`, pra não depender de teste manual + verificação em produção de novo.
2. **`fireWrite` (`src/firebase/fireWrite.ts`) silencia erro de escrita até em dev**, de propósito (não expor erro técnico ao usuário). Mas isso também escondeu o bug de categoria do próprio dono/agente durante testes manuais — só apareceu ao recarregar a página e notar que o dado sumiu. Considerar `if (import.meta.env.DEV) console.error(...)` dentro do `.catch()` só em desenvolvimento, sem tocar no comportamento de produção — daria sinal imediato no console em vez de exigir reload manual pra notar.
3. **`accountDeletionService.ts` (`leavePartnerWorkspace`) espalha `...workspaceRefData` inteiro num `batch.update`** antes de sobrescrever `status`/`updatedAt`. Funciona hoje porque os valores lidos são idênticos aos já salvos (Firestore só considera "alterado" o que difere de verdade), mas é frágil: se o tipo `WorkspaceRef` ganhar um campo novo amanhã sem a regra `validCoupleWorkspaceRefUpdate` prever esse campo no `diff().affectedKeys().hasOnly([...])`, a saída do parceiro do espaço compartilhado quebra do mesmo jeito que a criação de categoria quebrou hoje. Mais seguro seria escrever só `{ status: 'removed', updatedAt }` explicitamente, sem spread.

## Mapa de contexto

| Tema | Arquivo |
|---|---|
| Estado atual | `SESSAO.md` |
| Mudanças recentes | `CHANGELOG.md` |
| Busca por assunto | `docs/BUSCA_RAPIDA.md` |
| Histórico mensal | `docs/history/YYYY-MM.md` |
| Design/UI (Sol) | `docs/design/DESIGN.md` |
| Pendências/roadmap | `docs/planning/TODOS.md` |
| Testes/QA | `docs/qa/TESTES.md` |
| Arquitetura | `docs/ARCHITECTURE.md` |
| Segurança/privacidade | `docs/SECURITY.md`, `docs/PRIVACY.md` |
| Operação/deploy | `docs/RUNBOOK.md`, `docs/PRODUCTION_CHECKLIST.md` |
| Billing futuro (inativo) | `docs/BILLING.md`, `docs/BOOTSTRAP_FIREBASE_STRIPE.md` |

## Projeto

SaaS/PWA financeiro mobile-first. Duas frentes: **controle individual** das finanças e **organização a dois** (casal). Tagline: "Controle individual. Organização a dois." Produção: https://granativa.com.br (domínio próprio; `zerou-five.vercel.app` continua funcionando como URL legada do Vercel) · Repo: `athurcos-cmyk/Zerou` · Branch: `main` (direto, sem PR, por pedido do dono).

## Stack

React 19, TypeScript strict, Vite, Firebase Web SDK (Auth + Firestore + Storage), Vercel, Vite PWA Plugin, React Router, React Hook Form, Zod, Zustand, Lucide React. Node >= 22. Testes: Vitest, Playwright, Firebase Rules Unit Testing.

## ⚠️ REGRA PRINCIPAL: o app deve funcionar offline

O Zerou é mobile-first e usuários perdem sinal o tempo todo. **O app precisa funcionar offline**. Toda escrita no Firestore deve usar o padrão fire-and-forget para que a UI responda imediatamente do cache local, sem depender do servidor.

**Padrão correto (fire-and-forget):**
```ts
// Escrita: dispara e trata erro se aparecer
minhaEscrita(dados).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Mensagem amigável.')));
// Feche o sheet, limpe o form — ANTES de chamar o write
setOpen(false);
```

**Padrão ERRADO (bloqueia na rede):**
```ts
// ❌ NÃO FAÇA — trava com spinner se o transporte oscilar
await minhaEscrita(dados);
setOpen(false);
```

**Como funciona:** Firestore usa `persistentLocalCache` + `experimentalAutoDetectLongPolling` (`src/firebase/config.ts`). O write vai pro cache local imediatamente e o `onSnapshot` reflete a mudança. A sync com o servidor acontece em background. Se offline, a operação fica na fila e sincroniza quando voltar.

**Exceção permitida:** operações que *leem* resultado do servidor (gerar convite, preview de invite, confirm dialog) podem usar `await`/`.then()` — mas o *write* subsequente ainda deve ser fire-and-forget.

```ts
// Correto para fluxo confirm → write:
const ok = await confirm({ ... });    // await OK — é leitura de UI
if (!ok) return;
setEstadoOtimista(...);               // atualiza UI imediatamente
minhaEscrita(dados).catch(...);      // write é fire-and-forget
```

---

## ⚠️ REGRA PRINCIPAL: todo valor novo de enum num payload do Firestore precisa atualizar a regra no MESMO commit

Já aconteceu **duas vezes** neste projeto — cada uma quebrando uma feature inteira, silenciosamente, por semanas:

1. **`createCategory` ganhou o campo `createdBy`** (17/06) mas `validCategoryCreate` (`firestore.rules`) nunca foi atualizada — toda criação de categoria personalizada foi rejeitada pelo servidor silenciosamente por **~3 semanas**. Só apareceu quando o próprio dono recarregou a página e notou que a categoria tinha sumido.
2. **`InvoiceLedgerEntryType` (TypeScript) ganhou `'installment_anticipation_credit'`** desde a criação da feature "antecipar parcelas", mas `validInvoiceLedgerEntryType` (`firestore.rules`) nunca incluiu esse valor na lista `in [...]` — a feature inteira estava **rejeitada pelo servidor desde que foi criada**, e ninguém percebeu porque o padrão fire-and-forget do app suprime o erro de propósito. Só foi descoberta meses depois, testando manualmente ao vivo em produção (2026-07-09).

**Por que isso acontece**: o TypeScript nunca reclama — o tipo/schema do cliente aceita o valor novo numa boa. A regra do Firestore é um arquivo **separado**, escrito numa linguagem diferente, que ninguém lembra de abrir de novo depois. E como o app é offline-first (`fireWrite` engole o erro de propósito, por design — não expor erro técnico ao usuário), a rejeição do servidor é **completamente invisível**: a UI mostra sucesso, o dado entra no cache local, e só some quando a página recarrega e busca o estado real do servidor.

**Regra**: sempre que um campo ou valor de enum novo for adicionado a um payload que o cliente grava no Firestore (`setDoc`/`updateDoc`/`batch.set`/`batch.update` em `financeService.ts`, `cardService.ts`, `sharedService.ts`, `workspaceService.ts`, etc.), **no mesmo commit**:

1. Abrir `firestore.rules` e conferir se a função `valid*Create`/`valid*Update` correspondente já aceita esse campo/valor — em `hasOnly([...])` (chaves) e em `in [...]` (valores de enum).
2. Conferir se o payload de teste em `tests/firestore.rules.test.ts` (`ledgerPayload`, `categoryPayload`, etc.) reflete o payload real do cliente, não uma versão simplificada — senão o teste passa mesmo com a regra desatualizada, igual aconteceu nos dois incidentes acima.
3. Rodar `npm run test:rules` antes de considerar a mudança pronta (hoje bloqueado por Java local quebrado nesta máquina — ver `docs/planning/TODOS.md` — então, até corrigir isso, fazer uma conferência manual linha a linha da regra + deploy + verificação ao vivo em produção, com autorização explícita do dono antes do deploy).

Isso vale tanto pra campo novo (`createdBy`) quanto pra valor novo dentro de um enum já existente (`installment_anticipation_credit`) — os dois incidentes reais foram um de cada tipo.

---

## Regras de código

- **Dinheiro sempre em centavos inteiros** (`amountCents`); exibir via `formatMoney()`.
- **Firestore** (não Realtime Database). Não mudar sem redesenhar.
- **IDs client-side** + `clientMutationId` para idempotência.
- Onboarding e fluxos financeiros rodam **client-side com Security Rules** restritivas — sem Cloud Functions no fluxo principal, mesmo com o projeto Firebase no Blaze.
- **Offline-first**: ver seção acima. Nunca use `guardAction` ou wrapper async que dê `await` em escrita pra liberar UI.
- Coleções por workspace: `workspaces/{id}/{accounts|categories|transactions|bills|recurring|goals|goalContributions|cards|...}`.
- UI mobile-first. Componentes-base de UX: `BottomSheet`, `SelectField`, `CategoryField`, `ConfirmDialog`, `EmptyState` (ver `docs/design/DESIGN.md`).
- Cores: tokens em `src/styles/themes.css`. **Não** usar hex/rgba literal fora de `themes.css` e `src/theme/palette.ts` (teste `noHardcodedColors` falha). Zona de marketing `src/landing/` é exceção.
- Edição cirúrgica: não reescrever arquivo inteiro para mudar poucas linhas.
- Antes de mexer em UI, leia `docs/design/DESIGN.md`.

## Pontos sensíveis (nunca fazer)

- Não commitar `.env.local` nem service account.
- Não hardcodar `firebaseConfig` (somente variáveis `VITE_`).
- Não ativar Cloud Functions, billing de produto, recursos pagos novos ou serviços Google Cloud extras sem pedido explícito. O projeto Firebase está no Blaze, mas o app segue gratuito e sem checkout ativo.
- Não mudar a landing/páginas públicas para dark por padrão (sempre claras/Paper).
- Não expor erro técnico ao usuário final (usar `getUserFacingErrorMessage`).
- Não usar logo de banco sem fonte confiável.
- Dados financeiros pessoais não vazam para o espaço do casal.

## Validação antes de entregar

`npm run typecheck` · `npm test` · `npm run build`. Deploy de regras: `npx firebase deploy --only firestore:rules --project zerou-26757` (somente regras; não toca billing/functions/hosting).

## Atualização de docs no fim da sessão

Cada arquivo tem uma função. Não duplique histórico no `SESSAO.md`.

| Arquivo | Atualizar quando | Não atualizar quando | Como escrever |
|---|---|---|---|
| `CHANGELOG.md` | Entregou código, docs, config, bugfix, decisão de produto ou reorganização relevante | Conversa, análise sem mudança, ajuste mínimo | Resumo curto no topo, 3-8 bullets, linkando para `docs/history/` se houver detalhe |
| `SESSAO.md` | Mudou estado atual, stack, fluxo, caminhos importantes ou regra essencial | Foi só mais uma sessão/bugfix comum/UI pontual | Brief vivo e curto, sem virar diário |
| `docs/history/YYYY-MM.md` | A sessão precisa de mais de 8 bullets, tem contexto de decisão, auditoria, plano ou detalhe útil depois | Mudança pequena que cabe no changelog | Registro por mês, título datado, detalhes técnicos/produto |
| `docs/BUSCA_RAPIDA.md` | Mudaram caminhos, nomes, pastas, assuntos ou comandos de busca | Feature comum que não muda onde procurar | Mapa de navegação, tabelas e comandos `rg` |
| `docs/planning/TODOS.md` | Abriu, fechou ou repriorizou pendência | A tarefa já entrou no changelog e não gerou pendência | Item acionável ou concluído, critério claro |
| `docs/design/DESIGN.md` | Mudou token, fonte, componente-base ou regra visual | Ajuste de conteúdo sem mudar o sistema | Sistema vivo: tokens, layout, componentes |
| `README.md` | Mudou setup, comandos ou entrada do projeto | Mudança interna sem impacto pra quem entra no repo | Onboarding curto |

Regras sem ambiguidade:

- Se nada mudou em arquivo, não atualize docs.
- Entrega relevante → atualize `CHANGELOG.md`.
- Detalhe que não cabe em 3-8 bullets → vai pro `docs/history/YYYY-MM.md`, e o `CHANGELOG.md` fica só com o resumo + referência.
- `SESSAO.md` descreve o presente. Não vire diário.
- `docs/BUSCA_RAPIDA.md` só muda quando a forma de achar contexto muda.

## Observação de contexto

Arquivos grandes ficam fora da raiz, em `docs/`, de propósito. Não traga histórico gigante de volta pra raiz.
