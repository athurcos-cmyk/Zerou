# Pendências e roadmap — Zerou

Itens acionáveis. Fechou? Mova para "Concluído" ou remova. Detalhe histórico vai para `../history/`.

## Abertas

### Produto / UX
- [ ] QA manual real no celular (cadastro, login, onboarding, conta, transação, conta a pagar, cartão, fatura, espaço do casal, cofrinho — incluindo o resgate novo).
- [ ] Dar a mesma voz de copy às páginas legais/ajuda, se fizer sentido.

### Técnico
- [ ] Code splitting — bundle inicial > 500 kB (warning no build).
- [ ] App Check, backups do Firestore, alertas de custo Firebase/Vercel.
- [ ] Corrigir Java local (erro 3221226505) para `npm run test:rules`.
- [ ] Emails oficiais de suporte/privacidade.

### Automação server-side (futuro — exige worker/Functions)
- [ ] Fechar fatura automaticamente, gerar recorrências e lembretes sem depender do app aberto. Decidir entre Cloud Run (perto do Firestore) e Railway. Hoje só roda quando o usuário abre o app.

### Negócio / legal
- [ ] Revisão jurídica antes de escala pública maior.
- [ ] Billing real (Stripe) — só com decisão explícita de produto (hoje 100% gratuito).

## Concluído (recente)
- [x] Domínio `granativa.com.br` no ar de ponta a ponta: HTTPS válido, landing carregando, login com Google testado e confirmado funcionando em produção pelo próprio dono.
- [x] Zona DNS de `granativa.com.br` configurada no registro.br (registro `A` na raiz + `CNAME` em `www`, valores exatos gerados pelo Vercel) — "Zona DNS atualizada com sucesso!" confirmado no painel. Precisou esperar o domínio sair do estado "em transição" (bloqueio temporário do registro.br pra domínio recém-registrado).
- [x] Deploy de `functions` (billing + admin) com o `APP_BASE_URL` novo (`granativa.com.br`) — 9 functions do codebase `billing` atualizadas (`closeInvoicesDue`, `generateRecurrences`, `sendDueReminders`, `sendDailyLogReminder`, Stripe scaffold). `adminForceLogout` já estava deployada (nada a atualizar nela nesta rodada).
- [x] Testado aceitar convite do espaço do casal com uma segunda conta real (ponta a ponta, sem reload) + 3º bug corrigido em `firestore.rules` (trocar o modo do espaço dava "Missing or insufficient permissions" — `validCoupleWorkspaceUpdate` só previa as transições de aceitar/sair, não mudança de modo isolada) + race condition no botão "Cancelar espaço compartilhado" corrigida.
- [x] Reestruturação da UI do espaço do casal (`src/pages/shared/`) — fluxo de convite com um estado por vez, formulário de despesa em BottomSheet, seleção de modo deduplicada — e 2 bugs corrigidos em `firestore.rules` (assimetria de entitlement de billing, `displayName` faltando nas regras de membro).
- [x] Reestruturação da tela de Análise (`SearchPage.tsx`) — consistência visual com o design system, empty states com ilustração, navegação por mês nova, busca em `BottomSheet` sob demanda.
- [x] Resgatar do cofrinho do casal de volta pra conta pessoal (com categoria fixa "Cofrinho"). Cálculo de estatísticas (`byUser`/`thisMonthCents`) extraído para `calculateCoupleGoalStats` (testado, 12 casos).
- [x] UI premium em todas as páginas: cabeçalhos compactos, `CategoryMark` nas listas de transações, cards de conta com gradiente escuro, formulários colapsáveis (Contas, Cartões, Compromissos), nav inferior reorganizada (Extrato no slot 2, Cartões no slot 4, Casal no Mais).
- [x] Antecipação de parcelas estilo Nubank: seleção por compra + invoice com checkbox, `writeBatch` credita faturas futuras e debita a atual. Novo tipo `installment_anticipation_credit` no ledger.
- [x] Fix de status de fatura: fatura aberta permanece `open` até o fechamento, independente de pagamentos antecipados.
- [x] Comprometido: faturas `closed` sempre; `open` só se referenceMonth ≤ mês atual.
- [x] Redesign Sol + app mobile-nativo (bottom-sheets, FAB, header de valor).
- [x] Cofrinho do casal (meta compartilhada + contribuições por pessoa).
- [x] Divisão flexível de despesa do casal (igual/%/valor).
- [x] Tela de Metas ligada ao questionário do onboarding.
- [x] Landing nova (CSS 3D) com copy de dor; promovida para `/`.
- [x] SVGs oficiais de ~24 bancos.
- [x] Sistema de documentação estilo plantão.
