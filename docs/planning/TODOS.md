# Pendências e roadmap — Zerou

Itens acionáveis. Fechou? Mova para "Concluído" ou remova. Detalhe histórico vai para `../history/`.

## Abertas

### Produto / UX
- [ ] QA manual real no celular (cadastro, login, onboarding, conta, transação, conta a pagar, cartão, fatura, espaço do casal, cofrinho — incluindo o resgate novo).
- [ ] Dar a mesma voz de copy às páginas legais/ajuda, se fizer sentido.

### Técnico
- [ ] Code splitting — bundle inicial > 500 kB (warning no build).
- [ ] App Check, backups do Firestore, alertas de custo Firebase/Vercel.
- [ ] **Procedência dos logos de banco divergente** (achado em 2026-07-11): `scripts/generate-bank-logos.mjs` diz gerar 7 SVGs do `simple-icons`, mas 26 dos 29 arquivos em disco (inclusive nubank/picpay/mercado-pago/neon, que o script lista) vieram de outra fonte e foram commitados sem atualizar o script. Ver aviso em `public/bank-logos/SOURCES.md`. Decidir com o dono: adotar simple-icons como fonte canônica (rodar o script, aceitar novo visual) ou documentar a origem real dos 26. Contraste: `public/service-logos/` é gerado de verdade e confere.
- [ ] Emails oficiais de suporte/privacidade.
- [ ] Contas a pagar (`Bill.status`) nunca viram `'overdue'` automaticamente — ficam "Pendente" pra sempre mesmo com vencimento no passado. Não afeta o cálculo do Comprometido (já conta certo), só falta indicação visual/status pro usuário perceber o atraso.

### Automação server-side (futuro — exige worker/Functions)
- [ ] Fechar fatura automaticamente, gerar recorrências e lembretes sem depender do app aberto. Decidir entre Cloud Run (perto do Firestore) e Railway. Hoje só roda quando o usuário abre o app.

### Negócio / legal
- [ ] Revisão jurídica antes de escala pública maior.
- [ ] Billing real (Stripe) — só com decisão explícita de produto (hoje 100% gratuito).

## Concluído (recente)
- [x] **Logos das marcas fora do simple-icons** (2026-07-12): o dono trouxe os 19. 6 tinham símbolo quadrado usável → viraram SVG oficial (ChatGPT, Microsoft 365, Oi, Google One, Claro, Rappi). Os outros 13 eram só wordmark (ilegível no tile de 36px) → viraram tile "ícone de app" (quadrado na cor da marca + iniciais brancas, `serviceBrandColors` em `theme/palette.ts`; `ServiceMark` ganhou o estado `--brand`). Verificado ao vivo em tema claro e escuro (borda mantida pros tiles escuros não sumirem no dark). Procedência dos 6 SVGs em `public/service-logos/MANUAL_SOURCES.md` (o `SOURCES.md` é gerado por script e não os conhece).
- [x] **Projeção de meses futuros na Análise ("Previsto")** (2026-07-12): dá pra avançar pra frente e ver a previsão do mês — comprometido (parcelas de cartão + contas a pagar) **+ recorrências projetadas** (estimativa, listadas à parte). Rotulado "Previsto no mês", KPI "Recorrências ~R$", legenda distingue firme de estimativa. Horizonte = última parcela/conta ou +12 meses se houver recorrência ativa. `committedByCategoryForMonth`/`lastCommittedMonth`/`projectedRecurringForMonth`/`recurringByCategoryForMonth` em `spendingAnalysis.ts`. Categoria de compra no cartão (parcela→transação→categoria) e de recorrência verificadas ao vivo (fatia Alimentação R$200, fatia Casa R$1.500).
- [x] **Análise por parcela (regime de caixa) + compras parceladas em andamento** (2026-07-11): a Análise contava a compra parcelada inteira no mês da compra (R$3.000/10x aparecia como R$3.000 num mês só); agora conta a parcela que cai na fatura de cada mês (R$300 × 10), reflete antecipação e ganhou uma seção mostrando o valor cheio das compras em andamento e quanto falta. Lógica pura em `src/finance/spendingAnalysis.ts` (11 testes). Verificado ao vivo.
- [x] **Conferência da spec de antecipar fatura × antecipar parcela** (2026-07-11): revisado `spec_antecipacao_fatura_parcela.md` ponto a ponto — o comportamento bate. Nosso ledger (débito atual + crédito futuro) já entrega o `mes_referencia` × `mes_pago` sem os dois campos de data e deixa os relatórios de mês futuro líquidos de graça. Fechadas as duas decisões de UX que faltavam: diálogo explicando o que se move ("sai da fatura de dez/2026 e passa a contar agora") + aviso de irreversibilidade (mantida irreversível como Nubank), e os rótulos "Antecipar fatura" (fatura aberta) vs "Antecipar parcela" distintos na UI. Verificado ao vivo.
- [x] **Antecipação de parcela só da última pra trás** (2026-07-11): o app deixava antecipar uma parcela do meio (parcelei em 5x, na 1ª, dava pra antecipar a 3ª). Reescrito pra agrupar por compra e antecipar as últimas N contíguas, como no cartão de verdade. Mecanismo (débito atual + crédito futura, total/limite inalterados) já estava certo. Verificado ao vivo.
- [x] **Trazer compras existentes ao cadastrar o cartão** (2026-07-11): criar um cartão leva direto pra página dele com um destaque pra adicionar parcelas em andamento e compras futuras (que começam mais pra frente). Verificado ao vivo (12x começando em outubro).
- [x] **Conservador não estoura mais com compra parcelada** (2026-07-11): contava as 10 parcelas de uma vez (Disponível ia a −R$2.000 no cenário do dono: R$5k limite, R$3k em 10x). Agora usa a janela de dias, sem assumir salário. Copy reescrita nos 3 lugares (mini tutorial, Recebimento, Dashboard). Verificado ao vivo.
- [x] **Lançar compra parcelada em andamento** (2026-07-11): `registerOngoingInstallments` + `OngoingInstallmentsSheet` (botão na página do cartão) pra migrar uma compra já em curso (óculos 7/10) sem recriar as parcelas pagas. Toda compra parcelada passou a mostrar "parcela X/N" na fatura (campos novos no ledger + regra deployada). Verificado ao vivo de ponta a ponta numa conta nova.
- [x] **As 3 pendências técnicas abertas na auditoria de 2026-07-10** (2026-07-11): `dashboard` morto removido do `useFinanceData`; o filtro de lançamento órfão deixou de depender da janela de 300 transações (e a trava de exclusão de conta passou a perguntar ao servidor); recorrência não gera mais despesa em dobro (id determinístico por ocorrência, compartilhado entre a Cloud Function e o botão "Registrar", com a rejeição provada no emulador). No caminho apareceu um bug maior: `snapshot.data()` devolve `null` pra `serverTimestamp()` pendente, então **excluir qualquer transação offline não fazia nada** até o servidor responder. Ver `docs/history/2026-07.md`.
- [x] QA completa de cartões/faturas/Comprometido (pedido do dono): 4 bugs reais corrigidos — exclusão de compra no cartão não saía da fatura, "fatura atual" errada com parcelamento, cartão fecha-tarde/vence-mês-seguinte com vencimento errado, e antecipação de parcelas nunca funcionando em produção (regra do Firestore faltando desde a criação da feature). Comprometido/Disponível revisados a fundo e nova pergunta de onboarding "quando você recebe?" (payday + renda variável + janela configurável). Ver `CHANGELOG.md`/`docs/history/2026-07.md`.
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
