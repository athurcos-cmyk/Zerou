# Changelog

Resumo das mudanças recentes. O histórico detalhado por mês fica em `docs/history/`.

## 2026-07-11 — fix: antecipação só da última parcela pra trás + trazer compras existentes ao criar o cartão

- **Antecipação de parcela reescrita pra funcionar como no cartão de verdade.** Antes o app deixava marcar qualquer parcela futura solta — inclusive uma do meio, deixando as de trás (parcelei em 5x, tô na 1ª, e dava pra antecipar a 3ª). Isso não existe: antecipação é sempre **da última parcela pra trás, contígua**. Agora o painel agrupa por compra e oferece um seletor "antecipar as últimas [N] parcelas" — pega da última pra trás, nunca uma do meio. Verificado ao vivo: antecipar as 3 últimas de um 10x moveu R$900 das faturas fev/mar/abr pra fatura atual, **limite usado inalterado** (antecipar move dívida entre faturas, não muda o total). O mecanismo em si (débito na fatura atual + crédito na futura) já estava certo; o bug era só a seleção.
- **Trazer compras existentes ao cadastrar o cartão.** A maioria já chega com parcelas rolando. Agora, ao criar um cartão, o app vai direto pra página dele com um destaque: "Esse cartão já tinha compras? Traga o que já existe" — parcelas em andamento (ex.: 12x, já na 7ª) **e compras futuras que começam mais pra frente** (ex.: parcelas que só começam na fatura de outubro). Reaproveita o fluxo `registerOngoingInstallments`, com cópia mais clara pros dois casos. Verificado ao vivo (compra futura de 12x começando em outubro → 12 faturas de out/2026 a set/2027).
- 218 testes de unidade, typecheck, build e lint (linha de base) limpos. Regra do Firestore não mudou (os campos de parcela já foram deployados).

## 2026-07-11 — fix: conservador não estoura mais com parcela + lançar compra parcelada em andamento

- **Conservador com Disponível muito negativo — corrigido.** A causa era o modo contar **todas** as parcelas futuras de uma compra no cartão como se vencessem hoje. Reproduzido no caso do dono (R$5.000 de limite, R$3.000 em 10x, saldo baixo): antes dava Comprometido R$3.000 / Disponível −R$2.000. Agora o conservador olha a **janela de dias** (sem nunca assumir salário), então só a parcela que vence logo pesa — Comprometido R$300, Disponível R$700. Verificado ao vivo. Mini tutorial, tela de Recebimento e legenda do Dashboard reescritos pra refletir a diferença real entre os modos (conservador = janela fixa; "até o recebimento" = corte no salário).
- **Lançar compra parcelada que já começou** (`registerOngoingInstallments` + `OngoingInstallmentsSheet`, botão na página do cartão). Pro caso de migrar pro app uma compra que já vinha pagando: informa o valor da parcela, "está na parcela 7 de 10" e o mês da próxima; o app cria só as que faltam (7 a 10), nas faturas certas, sem recriar as pagas. Preview ao vivo antes de confirmar.
- **Toda compra parcelada agora mostra "parcela X/N"** na fatura (novos campos `installmentNumber`/`installmentTotal` no ledger). Resolve a confusão das "10 faturas abertas que parecem 10 contas". Exige regra do Firestore nova (deployada).
- QA ao vivo completo numa conta criada do zero (cadastro → onboarding → conta → cartão → compra 10x → conservador → compra em andamento), tudo persistindo após reload, console limpo. 221 testes de unidade + 45 de regras, typecheck, lint (linha de base) e build limpos.

## 2026-07-11 — feat: logos e autocomplete de assinaturas nas Recorrências e Compromissos

- **Catálogo de ~60 serviços** (`src/finance/subscriptionServices.ts`): assinaturas (Netflix, Spotify, Prime Video, Disney+, Max, Wellhub, Xbox…) e contas fixas (energia, água, aluguel, internet…). Digitar no campo Descrição sugere a marca, preenche o nome canônico e sugere a categoria (sem sobrescrever uma escolhida à mão). A lista de recorrências e de compromissos passou a mostrar a marca ao lado do nome.
- **26 logos SVG** gerados do `simple-icons` (mesma fonte CC0 dos bancos), via `npm run generate:service-logos`, com `SOURCES.md` automático. Chip de fundo sempre claro (`--brand-chip-bg`) pra logos pretos (Apple TV, Notion, Uber) não sumirem nos 4 temas escuros.
- **Marcas fora do simple-icons mostram tile de iniciais**, igual aos bancos sem logo. Prime Video, Disney+, Wellhub, Xbox, Microsoft 365, Adobe, Canva, ChatGPT e Globoplay **não existem** no pacote (que remove logo a pedido do dono) e não têm versão quadrada de fonte confiável — busquei no Wikimedia Commons e só há wordmarks marcados como `trademarked`, ilegíveis num tile de 36px. Decisão do dono: tentar o oficial, cair no simple-icons quando não der.
- **Reconhecimento por palavra inteira**, não substring: "Time do coração" não vira TIM, "Oitava parcela" não vira Oi — logo errado ao lado de dinheiro é pior que logo nenhum. Coberto por teste.
- Achado no caminho e anotado como pendência: o `SOURCES.md` dos **bancos** estava errado (dizia gerar 26 SVGs do simple-icons que na verdade vieram de outra fonte). Corrigido o texto; a origem real fica pra decidir com o dono.
- 213 testes de unidade, typecheck, lint (1 problema a menos que a linha de base), build e `noHardcodedColors` limpos.

## 2026-07-11 — fix: as 3 pendências técnicas + um bug de offline achado no caminho

- **Excluir uma transação offline não fazia nada.** `snapshot.data()` devolve `null` para um `serverTimestamp()` ainda pendente, então `deletedAt` chegava nulo no cache local: a transação continuava no Extrato e a compra continuava somando na fatura até o servidor responder. Num app offline-first, a UI desfazia a ação do usuário. Toda leitura de snapshot passa agora por `readSnapshotDoc` (`serverTimestamps: 'estimate'`).
- **Compra de cartão excluída voltava a contar na fatura.** O filtro de lançamento órfão usava a janela das 300 transações mais recentes; uma compra antiga que saísse dela sumia do conjunto de "excluídas" e o valor **voltava** — a fatura podia até deixar de estar paga. Agora o `useCardsData` consulta o servidor pelos ids que a janela não cobre (normalmente nenhum) e, na dúvida, mantém o lançamento: sumir com ele apagaria dívida real.
- **Trava de exclusão de conta era furada** pelo mesmo motivo: uma conta antiga parecia vazia e podia ser apagada, deixando as transações órfãs. Passou a perguntar ao servidor.
- **Recorrência gerava despesa em dobro**: a Cloud Function das 6h e o botão "Registrar" criavam transações independentes para a mesma ocorrência. Agora as duas usam um id derivado de `(regra, data da ocorrência)` — a segunda escrita cai no mesmo documento e é rejeitada pela regra do Firestore, o que está provado por teste no emulador. O botão "Registrar" também sumiu das recorrências que ainda não venceram (mostram "Em dia"); clicar ali lançava despesa inexistente e ainda pulava um período.
- **Código morto removido**: `useFinanceData` recalculava um `dashboard` sem faturas, payday nem `availableMode` que nenhuma tela consumia.
- `generateRecurrences` deployada com autorização do dono, então a idempotência vale dos dois lados.
- 193 testes de unidade + 44 de regras, typecheck, lint e builds (app e functions) limpos. Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-10 — fix: `npm run test:rules` desbloqueado (e 5 testes que ele revelou quebrados) + clareza na tela de Recebimento

- **`npm run test:rules` voltou a rodar**, depois de meses bloqueado. O Java desta máquina tinha dois JDK 25 **sem a pasta `bin/`** e um stub órfão da Oracle primeiro no PATH do sistema, morrendo com `0xC0000409`. Como `firebase-tools` chama `spawn("java")` cru e ignora `JAVA_HOME`, e corrigir o PATH do sistema exige admin, o script passou a usar `scripts/with-java.mjs`: acha um JDK que de fato executa e o coloca na frente do PATH só daquele comando.
- **Ao rodar, a suíte acusou 5 falhas — todas nos testes, não nas regras.** O seed criava `users/charlie` antes do teste que deveria *criar* a fundação (virava update); os testes de casal usavam id `coupleA`, mas a regra exige `^couple_`; o payload de teste não tinha `coupleMode` nem `displayName` (ler campo ausente numa rule é *evaluation error*, não `false`); e o convite tinha `expiresAt` fixo em `2026-06-16`, uma data que já passou. 43/43 passando agora, e um teste de mutação confirmou que a suíte realmente pega uma regra sabotada.
- **Excluir cartão com fatura em aberto** agora avisa, com o valor na frente, que a dívida vai parar de contar no "Comprometido" e as faturas somem do app (as compras continuam no Extrato). O texto anterior prometia que "as faturas continuam no histórico" — não continuam.
- **Tela de Recebimento reescrita**: clicar num modo não dava retorno nenhum (o "Salvo." ficava no rodapé, fora da tela) — agora há um selo "Salvo" que aparece e some. A tela também mostra **a data-limite real em vigor** ("Hoje o corte é 5 ago — seu próximo recebimento"), usando a mesma função do Dashboard, e explica em português o que a data de recebimento faz e o que é o período de dias.
- No modo Conservador, a seção de recebimento fica recuada com um aviso: nada ali muda o resumo.
- **Rótulo errado no cartão**: "Fatura em aberto" mostrava a soma de *todas* as faturas (o limite usado), não a fatura atual. Virou "Limite usado".
- Campo de valor da recorrência vinha preenchido com `"R$ 39,90"` em vez de `"39,90"`, fora do padrão dos outros campos de dinheiro.
- 178 testes de unidade + 43 de regras passando, typecheck e build limpos, lint com 2 problemas a menos que a linha de base.

## 2026-07-09 — fix: 7 bugs de cartão/parcela/Comprometido + a pessoa escolhe como o "Disponível" é calculado

- **Cartão excluído continuava listado em Cartões e ainda comprometia saldo e limite** — `deleteCard` é soft-delete e nada filtrava `isActive`. Corrigido na raiz (`useCardsData`), verificado ao vivo: o Comprometido volta sozinho ao excluir o cartão.
- **Parcelamento colidia num mês e pulava outro**: compra 4x em 31/jan num cartão que fecha dia 28 gerava duas parcelas em fevereiro e nenhuma em março (`addMonths` clampando fevereiro). Novo `resolveInstallmentCycle` garante faturas consecutivas.
- **Antecipação de parcelas**: oferecia faturas *passadas* como se fossem futuras (antecipá-las jogaria a dívida pra frente), e antecipar uma parcela escondia as irmãs da mesma compra. Lógica extraída pra `src/cards/anticipation.ts` com 10 testes. Antecipação de parcela de meses depois testada ao vivo — limite consumido não muda.
- **Comprometido**: conta que vence no próprio dia do salário sumia do cálculo, e o número mudava conforme a hora do dia em que o app abria. O corte agora é sempre fim do dia.
- **Push "Fatura fechada: R$ 0,00"**: `outstandingBalanceCents` nunca é gravado no Firestore (o total vem do ledger, no cliente) e a Cloud Function lia o campo cru. Agora calcula do ledger — **exige `firebase deploy --only functions`**.
- **Novo: escolha do modo de "Disponível"** (`conservative` × `until_payday`), com mini tutorial que abre no primeiro Dashboard, trocável e revisitável em Configurações. Nasce do ponto levantado pelo dono: o app não pode simplesmente *deduzir* que um salário futuro vai cair. O default mantém o comportamento atual.
- **"Sem categoria" aparecia duas vezes** no Resumo de gastos e no donut da Análise: o agrupamento usava `?? 'uncategorized'`, e compra no cartão sem categoria grava `categoryId: ''` — string vazia passa pelo `??`. Trocado por `||`.
- **`fireWrite` agora loga `permission-denied` no console em desenvolvimento** — o silêncio de propósito já escondeu dois bugs graves por semanas, e escondeu um terceiro nesta sessão (pego olhando a resposta HTTP do Firestore).
- Regras do Firestore e Cloud Functions **deployadas e verificadas ao vivo** com autorização do dono. 178 testes passando, typecheck e build limpos. Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — fix: cartão/fatura não excluía direito, Comprometido contava fatura cedo demais, antecipação de parcelas nunca funcionou + feature de payday

- **4 bugs reais de cartão/fatura corrigidos**: excluir compra no cartão não saía da fatura; "fatura atual" mostrava a fatura errada quando havia parcelamento; cartão que fecha tarde/vence mês seguinte calculava vencimento antes até da própria compra; e o mais sério — **antecipação de parcelas nunca funcionou em produção** (regra do Firestore nunca aceitou o tipo de lançamento de crédito, silenciosamente rejeitada desde que a feature existe).
- **Comprometido/Disponível revisados a fundo**: o critério de quando uma fatura conta como "comprometida" mudou de "mês do ciclo da compra" pra "data de vencimento real" (mesmo cutoff de contas a pagar/recorrências), por decisão do dono, depois de investigar um caso concreto onde uma fatura que só vencia mês seguinte já derrubava o "Disponível" hoje.
- **Nova pergunta de onboarding "quando você recebe?"** (dia fixo / Xº dia útil / fim do mês / renda variável — plantão, freela, autônomo) alimenta esse cutoff automaticamente, com janela de dias configurável em Configurações → Recebimento. Dashboard agora explica de onde vem o número do Comprometido.
- Nomenclatura desktop/mobile unificada (Extrato→Transações, Casal→Compartilhado) e confirmação adicionada antes de excluir qualquer transação.
- Todas as mudanças de `firestore.rules` desta sessão foram revisadas só manualmente (Java local quebrado bloqueia `npm run test:rules`, ver `CLAUDE.md`), deployadas com autorização explícita do dono e verificadas ao vivo em produção.
- 147 testes passando (vários novos), typecheck limpo. Detalhes completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — fix: datas cruas ("2026-07-08") em Extrato, Contas a pagar, Faturas, Cartões, Recorrências e Busca

- Extensão do fix de data amigável aplicado antes só na Dashboard: `toDateInputValue` (formato de `<input type="date">`) trocado por `formatFriendlyDate` ("Hoje", "Ontem", "8 jul") em `TransactionsPage`, `BillsPage`, `InvoicePage`, `CardDetailPage`, `CardsPage`, `RecurringPage` e `SearchPage`. Sessão spawnada separadamente (chip de sugestão) e revisada/mesclada aqui.
- 3 riscos anotados em `CLAUDE.md` (seção temporária, remover ao resolver): Java local quebrado bloqueando `npm run test:rules`, `fireWrite` sem log nem em dev, e um `spread` frágil em `accountDeletionService.ts` que pode repetir a mesma classe de bug da regra de categoria se o tipo `WorkspaceRef` ganhar um campo novo.

## 2026-07-09 — fix: criar categoria nova falhava silenciosamente + auditoria de regras

- Ao lançar uma despesa/receita e criar categoria nova no picker, o app também salvava a transação incompleta (form da categoria, dentro de um `BottomSheet`/portal, ainda é "filho" do form da transação na árvore React — sem `event.stopPropagation()`, o submit se propagava pros dois). Corrigido em `CategoryField.tsx`.
- Causa mais séria: `validCategoryCreate` (`firestore.rules`) nunca foi atualizada quando o campo `createdBy` foi adicionado no cliente — toda categoria personalizada era rejeitada pelo servidor **silenciosamente há ~3 semanas**. Corrigida e deployada.
- Ao corrigir a regra, quebrei sem querer o seeding das categorias padrão (que nunca envia `createdBy`) — pego e corrigido na mesma sessão antes de virar um problema novo. Regra final trata os dois casos (categoria padrão sem `createdBy` vs. personalizada com `createdBy` obrigatório).
- **Auditoria completa**: todo write do app (`financeService`, `cardService`, `sharedService`, `workspaceService`, sync de tema, tokens de push) comparado campo a campo contra as regras do Firestore — nenhum outro desalinhamento encontrado. Teste novo em `tests/firestore.rules.test.ts` cobrindo os dois ramos da regra de categoria.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-09 — feat: revisão de design da Dashboard

- **Ícone de categoria descentralizado** (`.category-mark`): conflito de especificidade CSS com `.list-row span` (regra genérica que empilha texto nas linhas de lista) derrubava o `display: grid` que centraliza o ícone — o SVG ficava encostado no canto superior-esquerdo do quadrado colorido. Fix: seletor `span.category-mark` (mesma especificidade, vence por ordem no arquivo).
- **Datas amigáveis em português**: `toDateInputValue` (formato `yyyy-MM-dd`, pensado só pra `<input type="date">`) estava sendo exibido cru como texto pro usuário ("2026-07-08"). Novo helper `formatFriendlyDate` (`financeDates.ts`) — "Hoje", "Ontem", "8 jul" ou "8 jul 2025" (locale pt-BR do date-fns) — aplicado em "Últimos movimentos" e "Próximos compromissos" da Dashboard. O mesmo problema existe em outras telas (Extrato, Contas a pagar, Faturas, Cartões, Recorrências, Busca) — ainda não corrigido lá.
- **"Próximos compromissos" vazio** ganhou ilustração própria (calendário + check), consistente com o resto do app — antes era só texto seco enquanto o card ao lado (transações) já usava `EmptyState` ilustrado.
- **"Resumo de gastos"** agora mostra o tile colorido da categoria (`CategoryMark`) ao lado do nome, criando o mesmo fio visual da lista de transações — agrupamento trocado de nome pra ID de categoria pra viabilizar.

## 2026-07-09 — fix: campo "Saldo inicial" pré-preenchido com "0,00" ao criar conta

- Em Contas → Criar conta, o campo "Saldo inicial" vinha com o valor real `"0,00"`, exigindo apagar antes de digitar. Os demais campos de dinheiro do app (Metas, Contas a pagar, Recorrências, Faturas, Cofrinho e despesas do casal, Nova transação) já usavam `"0,00"` só como placeholder, some ao focar. `AccountsPage.tsx` era o único fora do padrão — alinhado.

## 2026-07-09 — fix: exclusão de conta no admin retornava "internal"

- Digitar `EXCLUIR` e confirmar na tela de admin sempre falhava com erro genérico "internal", mesmo com a frase certa.
- Causa: a Cloud Function `adminDeleteUser` (`functions-admin/`) estava sem a permissão pública de invocação (`roles/run.invoker` para `allUsers`) no Cloud Run — a requisição era bloqueada pela infraestrutura antes de chegar no código, então o SDK do Firebase nunca via o erro de verdade. Provavelmente perdida no redeploy que resolveu o conflito de codebases em 2026-07-07.
- Fix aplicado direto via API do Cloud Run (`setIamPolicy`), igualando à policy do `adminForceLogout`. Um redeploy comum (`firebase deploy`) **não** reaplica essa permissão em functions já existentes — só na criação.
- Bônus: `DeleteConfirmModal` (`AdminPage.tsx`) passou a usar `.trim()` na comparação com `EXCLUIR`, igual à autoexclusão em `LoginMethodsPage.tsx` — protege contra espaço acidental deixando o botão travado sem aviso.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: domínio próprio granativa.com.br

- Domínio comprado no registro.br e adicionado no Vercel (apex `A` + `www` CNAME).
- Código atualizado pra `https://granativa.com.br`: canonical e `og:image` em `index.html`, todas as URLs de `public/sitemap.xml` e `public/robots.txt`, links de notificação push nas Cloud Functions (`functions/src/automation.ts`, `push.ts`, `index.ts`, `.env`).
- `src/components/Seo.tsx` já era dinâmico (`window.location.origin`) — não precisou mudar.
- `functions` já deployado com o `APP_BASE_URL` novo — links de push (fatura fechada, conta a vencer, lembrete diário) já usam o domínio novo em produção.
- Zona DNS configurada no registro.br (registro `A` na raiz + `CNAME` em `www`).
- **Migração completa e confirmada**: HTTPS válido, landing carregando, login com Google testado em produção no domínio novo pelo dono.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — fix: "Gasto no mês" cortava o valor com "..." na Análise

- O card destaque "Gasto no mês" ficava estreito (dois cards lado a lado no mobile) e a fonte grande do valor não cabia, cortando "R$ 430,..." com reticências.
- Faixa de KPI virou grid: o card destaque ocupa a linha inteira (número herói, valor nunca trunca — testado até 7 dígitos), e "Maior categoria" + "vs. mês anterior" ficam lado a lado embaixo. Mesma hierarquia do Dashboard.

## 2026-07-08 — fix: clareza visual dos modos do casal (pareciam se acumular)

- Os 3 modos são níveis progressivos (cada um mostra as seções do anterior + a sua), o que dava a impressão de "ativar os 3 juntos" ao trocar. É sempre um modo só.
- Badge do modo atual visível no topo do espaço parceirado (antes só aparecia escondido em "Gerenciar espaço"), clicável pra trocar, com texto deixando claro que o cofrinho funciona em qualquer modo.
- Botões "Ativar transparência/equilíbrio" renomeados pra "Mudar pra..." (deixa claro que troca, não soma).
- Tag "Atual" no seletor de modo marcando o modo vigente, distinto do que está sendo selecionado — evita trocar sem querer.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — fix: 3 bugs no espaço do casal achados testando com dispositivos reais

- Corrigida race condition no botão "Cancelar espaço compartilhado" — ficava clicável (mas inerte) por 1-2s antes do workspace terminar de carregar.
- Corrigido bug real em `firestore.rules`: trocar o modo do espaço (`updateCoupleMode`) sempre dava "Missing or insufficient permissions" pros dois lados — a regra só previa as transições de aceitar/sair, não uma mudança isolada de modo.
- Testado ponta a ponta com uma segunda conta real aceitando o convite (sem reload na aba de quem convidou) — página atualizou sozinha; terceiro problema relatado não reproduziu, provável consequência dos outros dois.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: admin com paginação/detalhe de usuário + fix de vazamento na exclusão de conta

- Bug real corrigido: `users/{uid}/fcmTokens` (token de push) nunca era apagado nem na autoexclusão (`accountDeletionService.ts`) nem na exclusão pelo admin (`functions-admin/src/index.ts`) — ficava órfão no Firestore pra sempre. Corrigido nos dois fluxos; alinhei também a lista de subcoleções (`comments`) entre os dois arquivos.
- Admin (`/admin`): teto fixo de 500/200 usuários/casais/convites virou paginação de verdade por cursor (`startAfter`, 100 por página, botão "Carregar mais").
- Novo painel de detalhes por usuário (clicar na linha): perfil + lista de espaços (pessoal/casal, papel, status) — só metadados que o admin já podia ler, sem tocar em regra de dado financeiro.
- Nova ação "Forçar logout" (`adminForceLogout`, nova Cloud Function em `functions-admin/`, `auth.revokeRefreshTokens`) — precisa de deploy de functions antes de funcionar em produção.
- Filtros por status (Casais: ativo/arquivado/deletando; Convites: ativo/expirado/aceito) via StatCards clicáveis, mais ordenação por coluna nas 3 tabelas.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: reestruturação da tela de Análise (mês, empty states, busca)

- Cards de KPI e cabeçalhos passaram a reaproveitar `.metric-card`/`.metric-icon`/`.section-heading` do design system (classes que já existiam em `global.css`, nunca usadas) em vez de ~40 blocos de estilo inline.
- Empty states com `EmptyState` (ilustração) no gráfico de categoria e no histórico mensal, no lugar de texto seco.
- Navegação por mês nova (seletor `‹ Mês ›`) — KPI, categoria e "vs. mês anterior" acompanham o mês escolhido; histórico de 6 meses continua fixo como tendência.
- Busca por texto saiu do meio da rolagem e virou `BottomSheet` sob demanda (ícone no cabeçalho); link "Buscar" do Dashboard agora abre a busca direto.
- Corrigido ao testar com dado real: legenda do donut cortando nomes curtos ("Casa" → "C...") e nome de categoria longo cortando no card "Maior categoria" ("Alimenta...").

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: reestruturação da UI do espaço do casal + 2 bugs corrigidos nas regras do Firestore

- `SharedSpacePage.tsx` (880 linhas) dividida em `src/pages/shared/` (`CoupleInviteSection`, `CoupleModeSheet`, `CoupleSavingsSection`, `CoupleExpensesSection`) — página principal virou orquestrador.
- Fluxo de convite reescrito: uma ação primária por estado (gerar/compartilhar/regenerar/cancelar) em vez de até 6 botões simultâneos; "Compartilhar" usa `navigator.share` com fallback pra copiar.
- Bug real corrigido: recarregar a página depois de gerar um convite fazia o app "esquecer" que já existia um ativo — clicar em gerar de novo invalidava silenciosamente o código já enviado. Agora mostra "Convite ativo, expira em..." e avisa antes de invalidar.
- 2 bugs achados e corrigidos em `firestore.rules` (impediam criar o espaço/aceitar convite de verdade): checagem de entitlement de billing não seguia o mesmo default do cliente; regras de criação do membro (dono/parceiro) não incluíam `displayName` na lista de campos permitidos.
- Formulário de nova despesa virou `BottomSheet` (padrão do app); seleção de modo do casal deixou de estar duplicada (uma lista só, reusada em criar/trocar).

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-08 — feat: prompt de instalação do PWA no Dashboard

- Verificação do manifest (`vite.config.ts`, plugin VitePWA): conteúdo correto, mas achei 2 bugs pequenos — `lang` não estava setado (caía no default `en` num app em português) e os caminhos dos ícones referenciavam `Granativa-app-icon-*.png` (G maiúsculo) enquanto os arquivos reais em `public/brand/` são todos minúsculos. Confirmei ao vivo contra a produção que o Vercel serve como case-insensitive (não estava 404, mas ficava frágil) — corrigido de qualquer forma.
- Novo `InstallPromptSheet` (montado só na tela inicial `/app`, via `DashboardPage`): mostra um bottom sheet central com botão "Instalar agora" quando o navegador suporta o evento nativo `beforeinstallprompt` (Android/Chrome/Edge/desktop); no iPhone/iPad (sem esse evento no Safari) mostra um tutorial visual de 3 passos (Compartilhar → Adicionar à Tela de Início → Adicionar).
- Nunca aparece pra quem já instalou (`display-mode: standalone` / `navigator.standalone`) nem pra quem já dispensou uma vez (`localStorage`, permanente).
- Captura do `beforeinstallprompt` acontece desde o boot (`src/pwa/installPrompt.ts`, importado em `main.tsx`), não só quando a tela do Dashboard monta — o evento pode disparar antes.

## 2026-07-08 — fix: texto preto ilegível nos 4 temas escuros

- Causa raiz: `global.css` usa as diretivas legadas `@tailwind base/components/utilities` (estilo v3), mas o Tailwind instalado é v4 — o plugin `@tailwindcss/postcss` v4 não processa essa sintaxe, então o preflight nunca rodava. Sem o reset `button/input/select/textarea { color: inherit }` do preflight, qualquer elemento nativo sem classe (ex.: `<h2>` dentro de `<button>` sem estilo) caía no preto padrão do navegador — invisível nos 4 temas escuros (Obsidian, Midnight, Aurora, Rose Gold). Reproduzido em 5 páginas com o mesmo padrão de botão colapsável (Contas, Cartões, Compromissos, Metas, Compartilhado).
- Fix: reset explícito em `global.css` (`button, input, select, textarea { font: inherit; color: inherit; }`), independente do Tailwind. Não migrei a diretiva pra `@import "tailwindcss"` (mudança maior no pipeline de build) — só resolvi o sintoma real com uma regra CSS padrão.

## 2026-07-08 — fix: UX de aparência, segurança da conta e navegação

- **Saldo do Dashboard**: mostrava "—" por 1-2s a cada reload enquanto o Firestore sincronizava. Cache local (`dashboardSummaryCache.ts`, mesmo padrão do `profileCache.ts`) mostra o último valor conhecido até o dado real chegar.
- **Bug de troca de tema**: clicar num tema às vezes revertia pro anterior. Causa: `hydrateFromProfile` aplicava qualquer snapshot do perfil vindo do Firestore, inclusive um em trânsito com o tema antigo. Fix: `hasLocalOverride` no `appearance.store.ts` — depois da primeira escolha manual na sessão, o Firestore só hidrata, nunca mais sobrescreve.
- **Tela de Segurança reescrita** (`LoginMethodsPage.tsx`): bloco de Perfil (nome/email) no topo, UID e "workspace" removidos da tela, métodos de login como lista com badge "Ativo", explicação clara pra quem loga só com Google. Exclusão de conta agora só exige digitar EXCLUIR — sem campo de senha.
- **Aparência simplificada**: seção "Conforto de leitura" (densidade/fonte/reduzir animações) removida. Grid de temas compactado — ficava 1 coluna gigante no mobile por um `@media` que colapsava `.theme-grid`; agora sempre 3 colunas, cards menores.
- **Navegação**: nenhuma tela resetava o scroll ao trocar de rota (abria no meio da página anterior). `ScrollToTop.tsx` novo, montado uma vez em `App.tsx`.
- **Menu**: Aparência e Segurança agora ficam agrupadas sob o rótulo "Conta" na sidebar e no menu "Mais" do mobile, em vez de soltas entre os outros itens.

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: `adminDeleteUser` duplicada em 2 codebases de Cloud Functions

- Deploy de functions revelou uma duplicata real: `adminDeleteUser` existia tanto em `functions/src/admin.ts` (codebase `billing`) quanto em `functions-admin/src/index.ts` (codebase `admin`, isolado de propósito desde 17/06 pra deployar sem depender de secrets do Stripe). O Firebase rejeitou o deploy ("More than one codebase claims...").
- `firebase functions:list` confirmou: a função ao vivo já pertencia ao codebase `admin`. Removido o duplicado de `functions/src/admin.ts` (arquivo deletado, export tirado de `functions/src/index.ts`) — `functions-admin/` continua sendo a única fonte de verdade.
- As 10 functions dos 2 codebases foram redeployadas com sucesso (`npx firebase deploy --only functions`), incluindo a limpeza da referência a `comments` (feature já removida) que só tinha sido sincronizada no codebase errado antes.

## 2026-07-07 — feat: painel admin funcional (QA + UX)

- **2 bugs de segurança corrigidos**: admin podia deletar a própria conta sem aviso especial (sem proteção contra auto-exclusão); confirmação de exclusão comparava com o primeiro nome do usuário — se o nome estivesse vazio, o botão de deletar ficava liberado sem digitar nada. Trocado por frase fixa "EXCLUIR" (mesmo padrão da autoexclusão do usuário) + linha "Você" bloqueada na própria conta.
- **Convites agora são gerenciáveis**: aba Convites ganhou busca, tira-teimas de status (Ativos/Expirados aguardando TTL/Aceitos) e botão "Revogar" — antes só dava pra visualizar. Regra do Firestore liberada pra admin revogar (`isAdmin()` em `validInvite`... delete).
- **Busca adicionada** nas abas Casais e Convites — só existia em Usuários antes.
- **Contagens truncadas sinalizadas**: "500+"/"200+" em vez de um número que parece exato quando a query bate no teto (`ADMIN_USERS_LIMIT`/`ADMIN_COUPLES_LIMIT`/`ADMIN_INVITES_LIMIT`).
- Limpeza: `WORKSPACE_COLLECTIONS` na Cloud Function `adminDeleteUser` não referencia mais `comments` (feature removida na sessão anterior).

Detalhes em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria de uso do Firestore (leituras/escritas desnecessárias)

- **`coupleInvites`**: política de TTL nativa configurada no Firestore (campo `expiresAt`) — convites expirados são apagados sozinhos, sem Cloud Function. Configuração manual, feita direto no Console.
- **Faturas de cartão**: `subscribeInvoices` limitado às 24 mais recentes por cartão (~2 anos). Sem isso, cada fatura carregada abria seu próprio listener de ledger em `useCardsData` e o total de listeners simultâneos crescia sem parar conforme a conta envelhecia.
- **Feature morta removida**: sistema de comentários do espaço do casal (`SharedComment`, `addSharedComment`, `subscribeSharedComments`, coleção `comments`) — existia o listener e a escrita, mas nenhuma tela nunca chamou nem exibiu isso. Puro custo, zero uso. Removido de ponta a ponta: tipo, schema, serviço, hook, regra do Firestore.
- **Token FCM**: parava de gravar o mesmo token no Firestore toda vez que o app abria. Agora compara com um cache local (`src/pwa/pushTokenCache.ts`) antes de escrever.
- **Guia de quando escalonar**: documentado em `SESSAO.md` o critério prático pra decidir quando vale adicionar `.limit()` numa coleção (regra de bolso: ~500-1000 docs por workspace) e o que monitorar no painel do Firestore.

Detalhes e raciocínio completo em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — feat: resgatar do cofrinho do casal

- Nova ação "Resgatar" no cofrinho compartilhado: retira do total do casal e, opcionalmente, credita como entrada numa conta pessoal — espelha "Guardar" em sentido inverso.
- `GoalContribution` ganhou campo `type: 'deposit' | 'withdrawal'`; estatísticas por pessoa/mês extraídas para a função pura `calculateCoupleGoalStats` (12 testes novos).
- Nova categoria padrão "Cofrinho" (`both_cofrinho`) para as transações de guardar/resgatar não caírem em "Sem categoria".
- Regras do Firestore atualizadas (`goalContributions` aceita `type`) e deployadas em produção.
- Revisão de design da `SharedSpacePage`: já seguia os padrões do app; toggle Guardar/Resgatar e botões em linha reaproveitam os mesmos componentes usados no resto do app (sem CSS novo).

Detalhes e decisões de design em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria pré-lançamento, testes de lógica financeira e recorrência com anchorDay

- Design/consistência: cores literais da `SearchPage` viraram tokens (`noHardcodedColors` volta a passar), `window.confirm` trocado por `useConfirm`, empty states ilustrados em Bills/Recurring/Accounts.
- Fire-and-forget consertado em Bills/Cards/Recurring (formulário não trava mais esperando o servidor) e bug de boot offline corrigido (saldo podia piscar R$ 0,00 antes do cache carregar por completo).
- Suíte de testes de domínio ampliada de 46 para 113 testes (saldo, faturas de cartão, casal, dinheiro, recorrência).
- 2 bugs corrigidos: `parseMoneyToCents` inflava 100x um valor com ponto decimal; `nextOccurrenceDate` pulava fevereiro inteiro numa recorrência no dia 31.
- Novo campo `anchorDay`: recorrência mensal/anual guarda o dia original e volta a ele quando o mês permite (client + Cloud Function + regras do Firestore, já deployadas em produção).

Detalhes técnicos completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-06-22 — feat: redesign página de Análise (SearchPage)

- **KPI strip**: 3 cards no topo — gasto total do mês (destaque laranja), maior categoria com valor, variação % vs. mês anterior com ícone `TrendingUp`/`TrendingDown`/`Minus`.
- **Donut**: aumentado para 200px; centro exibe nome + valor + percentual da categoria selecionada; legenda substituída por barras de progresso coloridas por categoria.
- **Histórico mensal**: altura do gráfico de barras aumentada para 220px; legenda própria com quadradinhos no lugar do `<Legend>` padrão do Recharts; tooltip com uppercase label.
- **Busca**: card de resultados oculto quando campo está vazio.

## 2026-06-22 — feat: logos oficiais com transparência real + fix Firestore coupleMode

- **Logos oficiais**: todos os PNGs de brand substituídos por versões com alpha real (sem fundo branco). `granativa-logo-horizontal.png` (nav/og:image), `granativa-logo-primary.png`, `granativa-logo-stacked.png` e `granativa-logo-stacked-hq.png` adicionados.
- **Favicons**: `favicon-16x16.png` e `favicon-32x32.png` transparentes substituem o `favicon.png` legado (784KB). `index.html` atualizado.
- **Nav/footer landing**: `LandingShell` agora usa a logo horizontal como `<img>` única (sem texto duplicado em HTML). `BrandLogo.tsx`: paths corrigidos para lowercase.
- **fix Firestore**: `validCoupleWorkspaceCreate` não listava `coupleMode` no `hasOnly()` — qualquer usuário recebia `permission-denied` ao criar espaço compartilhado. Corrigido + validação `in ['savings_only', 'transparent', 'balanced']`. `validCoupleWorkspaceUpdate` também corrigido para permitir troca de modo. Regras deployadas.
- **`Seo.tsx`**: og:image corrigido para `granativa-logo-horizontal.png` (casing lowercase).

## 2026-06-22 — rebrand: Granix → Granativa + landing UX mobile

- **Nome final**: app renomeado de "Granix" para **Granativa** (portmanteau: grana + ativa). 35 arquivos atualizados, concordância de gênero corrigida (a/na/da Granativa).
- **Assets**: `public/brand/granativa-*.png` (10 arquivos, casing lowercase). Paths em `index.html` e `LandingShell.tsx` corrigidos.
- **Landing mobile — hover removido**: `whileHover` eliminado de `TiltCard` e couple-card; eventos de mouse no hero ligados só em `(hover: hover)` via `canHover` ref; estilos `:hover` movidos para `@media (hover: hover)`.
- **Stats band**: mantido em linha horizontal no mobile (sem `flex-direction: column`), padding e fonte compactados em `≤520px` — números não quebram mais linha.
- **Botões hero**: `flex-direction: column; width: 100%` em `≤640px` — CTAs empilhados e legíveis no celular.
- **Nav mobile**: botão ghost "Entrar" oculto em `≤480px` para dar espaço ao "Começar grátis".
- **`CountUp`**: simplificado para `motion.span` único com texto completo — elimina quebra de linha entre número e sufixo `%`.

## 2026-06-20 — feat: landing page redesenhada com Framer Motion 3D

- **Hero light**: fundo claro (branco → areia), texto estático, stage (phone + badges) inclina em 3D com o mouse via `rotateX/Y` + `preserve-3d` e `useSpring`.
- **Parallax em camadas**: stage sobe mais devagar no scroll (`useScroll`); badges em Z-depths diferentes (`z: 60 / 30 / -15`) criam profundidade real; phone tem gloss de luz (`useMotionTemplate`) que desloca com o cursor.
- **Grade perspectiva**: `linear-gradient` com `perspective(700px) rotateX(-62deg)` e mask cria piso de grade laranja recuando para o fundo.
- **Seções**: stats band, bento com `TiltCard` 3D hover (`rotateX/Y` no `whileHover`), seção do casal com card hover + `rotateZ`, steps com `whileInView`, FAQ accordion, CTA dark. Tudo com `RevealSection` (useInView + stagger).
- Detalhes técnicos em `docs/history/2026-06.md`.

## 2026-06-20 — rebrand: Zerou → Granativa

- **Novo nome**: app renomeado de "Zerou" para **Granativa**. Tagline mantida: "Controle individual. Organização a dois."
- **Novo logo**: ícone de duas bolas sobrepostas (sólida laranja + outline escuro), gerado com IA. Assets em `public/brand/Granativa-*.png` (`Granativa-app-icon-180/192/512`, `Granativa-maskable-512`, `Granativa-logo-horizontal`, `Granativa-symbol`).
- **PWA manifest**: `name`, `short_name`, `theme_color` (`#EE5524`), `background_color` (`#FAF8F5`) e todos os ícones atualizados em `vite.config.ts`.
- **`index.html`**: `<title>`, meta description, OG tags e `apple-touch-icon` atualizados. Favicon agora é PNG (`/favicon.png`).
- **Componentes e textos**: todas as ocorrências visíveis de "Zerou" → "Granativa" com artigo correto (o/do/na Granativa). Version strings internas do Firestore (`zerou-v12.2-*`, `zerou-cache`) mantidas para não invalidar registros existentes.

## 2026-06-18 — feat: gráficos interativos de análise de gastos (Recharts)

- **`SearchPage` → `Análise`**: donut interativo (clique destaca fatia/legenda, centro mostra categoria + valor) e gráfico de barras entradas vs saídas dos últimos 6 meses. Recharts instalado (`v3.8.1`). Nav renomeada de "Busca" para "Análise" com ícone `BarChart2`.

## 2026-06-18 — fix: ícone de categoria, delete de cartão, InvoicePage simplificada

- **CSS mobile**: `.list-row--with-icon` agora mantém `flex-direction: row` dentro do `@media (max-width: 900px)` — ícone de categoria deixou de quebrar para cima do texto.
- **`deleteCard`** (`cardService.ts`): soft-delete com `isActive: false`. Botão de lixeira adicionado no `CardDetailPage` com `ConfirmDialog` antes de confirmar.
- **`InvoicePage` simplificada**: "Fechar fatura" e "Conciliar manualmente" removidos da UI principal (automação cuida do fechamento). Pagamento via `BottomSheet`. Compras e pagamentos em seções separadas. Antecipação, créditos e tarifas em `<details>` colapsados.

## 2026-06-18 — feat: notificação diária às 20h para registrar gastos

- **`sendDailyLogReminder`** (`functions/src/automation.ts`): Cloud Function scheduled todo dia às 20h (BRT). Busca todos os tokens FCM cadastrados (`collectionGroup('fcmTokens')`), envia push em lotes de 500 com título "Como foi o dia?" e corpo "Registre seus gastos antes de dormir." linkando para `/app/transactions/new`.
- Exportada em `functions/src/index.ts` e deployada em `billing:sendDailyLogReminder(southamerica-east1)`.

## 2026-06-18 — perf: boot instantâneo em internet fraca, saldo não pisca mais

- **`AuthContext`**: estado agora inicializa **sincronamente** do `localStorage` — se o usuário já logou antes, `loading` começa como `false` e o app abre direto sem tela "Carregando Zerou...". Firebase confirma a sessão em background. Timeout de fallback: 1800ms → **500ms**. Bug corrigido: sem cache + Firebase não responde → agora libera `loading=false` em vez de travar.
- **Google Fonts não-bloqueantes** (`index.html`): `<link rel="stylesheet">` externo era render-blocking em redes lentas. Trocado por `rel="preload" onload` — browser baixa em paralelo sem travar o render.
- **Workbox runtime cache** (`vite.config.ts`): fontes do googleapis.com e gstatic.com agora são cacheadas com `CacheFirst` 1 ano — ficam disponíveis offline após primeira visita.
- **Dashboard** (`DashboardPage`): saldo total, disponível e comprometido mostram `—` enquanto `finance.loading` é true, eliminando o flash `R$ 0,00` antes dos dados do Firestore chegarem.

## 2026-06-18 — fix: fatura aberta permanece aberta com pagamento antecipado

- **`resolveInvoiceStatus`**: fatura com lifecycle `'open'` agora sempre retorna `'open'` (exceto `'overpaid'`). Antes, um pagamento total numa fatura ainda aberta a marcava prematuramente como `'paid'` — comportamento errado, pois novas compras ainda podem entrar antes do fechamento.
- Consequência cascata correta: `advance` no pagamento é sempre `true` enquanto a fatura está aberta (qualquer pagamento antes do fechamento é um adiantamento); `Comprometido` já excluía por `outstandingBalanceCents > 0`, então continua correto.
- Teste atualizado para usar `lifecycle: 'closed'` nos cenários de `'partial'`/`'paid'`; novo teste cobre fatura aberta com pagamento antecipado permanecendo `'open'`.

## 2026-06-18 — antecipação de parcelas estilo Nubank

- **Novo tipo de ledger** `installment_anticipation_credit`: credita o invoice futuro quando uma parcela é antecipada, reduzindo seu `outstandingBalanceCents` client-side via `calculateInvoice`.
- **`anticipateInstallments`** reescrito em `cardService.ts`: usa `writeBatch` — adiciona `installment_anticipation_credit` em cada invoice futuro selecionado e `installment_anticipation` (débito total) no invoice atual. Fire-and-forget.
- **Schema atualizado** (`anticipateInstallmentsSchema`): aceita `currentInvoiceId` + array de `credits` `{invoiceId, amountCents, sourceTransactionId}` em vez de valor manual único.
- **`InvoicePage`**: painel de antecipação substituído por seleção inteligente — lista parcelas futuras do mesmo cartão agrupadas por invoice, com checkbox por item, total ao vivo e "Confirmar antecipação". Parcelas já antecipadas são ocultadas automaticamente.
- Comprometido no Dashboard atualiza em cascata: invoices futuros com crédito de antecipação têm `outstandingBalanceCents` reduzido, saindo do cálculo se zerados.

## 2026-06-18 — UI premium: cabeçalhos, ícones de categoria, cards de conta, nav inferior

- **Cabeçalhos**: todas as páginas do app passaram a ter eyebrow + título compacto sem parágrafo de descrição (menos espaço desperdiçado, conteúdo aparece logo de cara).
- **Ícones de categoria**: `CategoryMark` (tile colorido 36×36 com ícone lucide) adicionado em todos os itens de lista de transações — em `TransactionsPage` e `DashboardPage` (recentes). Fallback por tipo: verde para renda, slate para transferências.
- **Contas como cards**: `AccountsPage` reescrita — contas exibidas como cards com gradiente escuro (`--gradient-slate`), saldo em destaque, bank-mark no canto. Form de cadastro agora colapsável (igual ao CardsPage).
- **Nav inferior**: slot 2 trocado de Cartões → Extrato (Transações); slot 4 mantém Cartões. Casal movido para o menu "Mais". Indicador de ponto laranja acima do ícone ativo.
- **Formulários colapsáveis**: `BillsPage` e `AccountsPage` ganharam mesmo padrão do `CardsPage` — form colapsado por padrão, toggle com chevron animado.
- **`CategoryMark`** exportado de `src/components/categoryIcons.tsx` — reutilizável em qualquer lista.

## 2026-06-18 — cartão: offline-first na fatura, fatura aberta em destaque, chip-row de conta

- **`InvoicePage`**: removido `guardAction` — pagamento, crédito, tarifa e antecipação são agora fire-and-forget com reset imediato do form. Botão de pagamento desabilitado até valor e conta estarem preenchidos.
- **`InvoicePage`**: campo "Pagar com qual conta?" trocado de dropdown (`SelectField`) para chip-row (consistência com BillsPage, RecurringPage, GoalsPage).
- **`CardDetailPage`**: fatura aberta aparece em destaque entre o bloco de limite e o formulário de compra, com link direto para pagar e valor em vermelho.
- **`CardsPage`**: cada cartão na lista agora exibe fatura aberta (mês de referência, vencimento, valor em vermelho) quando houver saldo pendente.

## 2026-06-17 — lógica financeira: pagamentos debitam contas, metas não viram gasto

- **`payBill`**: batch atômico marca conta como paga e cria transação de despesa (tag `bill`) debitando a conta selecionada. BillsPage abre sheet de confirmação com valor editável e chip de conta.
- **`recordRecurringPayment`**: batch avança `nextOccurrenceAt` para o próximo período e cria transação de despesa (tag `recorrente`). RecurringPage ganha botão "Registrar" que abre sheet com valor, conta e aviso da próxima data.
- **`contributeToGoalWithTransaction`**: batch incrementa `savedCents` da meta e, quando conta escolhida, cria despesa (tag `meta`). GoalsPage tem chip "De qual conta sai? / Só registrar" no sheet de contribuição.
- **`nextOccurrenceDate`**: função pura que avança uma data por `weekly` / `monthly` / `yearly`.
- **DashboardPage**: `spendingByCategory` exclui transações com tags `meta` e `cofrinho` — contribuições de meta/cofrinho não aparecem mais como gasto no resumo mensal.

## 2026-06-17 — redesign do modo casal e offline-first

- **Sistema de modos** (`coupleMode` no workspace): `savings_only` (só cofrinho), `transparent` (despesas visíveis) e `balanced` (barra proporcional de quem cobre mais). Pode ser escolhido na criação e mudado em qualquer momento via "Gerenciar espaço".
- **Nomes reais**: `WorkspaceMembership.displayName` salvo na criação do workspace e no aceite do convite; "Dono/Parceiro(a)" substituído pelo nome real da pessoa.
- **Validação de saldo no cofrinho**: "Guardar" valida o saldo da conta pessoal selecionada e bloqueia com mensagem amigável se insuficiente.
- **Removido breakdown individual** do cofrinho ("Você juntou / Parceiro juntou"); agora só aparece o total unificado.
- **Removido fluxo de acerto de contas** (settlements); substituído pelos modos transparent/balanced que mostram proporção sem acerto formal.
- **Offline-first**: todos os writes em `SharedSpacePage` refatorados para fire-and-forget (`.catch`); `guardAction` removido. Confirm dialogs aguardam normalmente; o write subsequente é fire-and-forget.
- **CLAUDE.md**: seção `⚠️ REGRA PRINCIPAL` com padrão correto/errado e exemplos de código explicitando que o app deve funcionar offline.

## 2026-06-17 — painel admin em /admin com deleção de usuário via Cloud Function

- **Rota `/admin`** protegida por `RequireAdmin` (email `a.thurcos@gmail.com`); qualquer outro usuário é redirecionado para `/app`.
- **AdminPage** com 4 abas: Visão Geral (4 cards de métrica + tabelas recentes), Usuários (busca por nome/email, tabela completa), Espaços de Casal (dono + parceiro resolvidos por nome), Convites (status, expiração, quem usou).
- **Deleção de conta**: botão de lixeira em cada linha de usuário, modal de confirmação exige digitar o primeiro nome, toast de sucesso mostra quantos documentos foram removidos.
- **Cloud Function `adminDeleteUser`** (`functions-admin/` codebase separado, sem dependência do Stripe): usa Admin SDK para deletar workspace pessoal, espaços de casal criados, membership em espaços alheios, billing, privacy requests e a conta Firebase Auth. Deployed em `southamerica-east1`.
- **Firestore rules**: `isAdmin()` adicionada; admin tem `read` em `users`, `workspaces` e `coupleInvites`.
- **`firebase.json`**: dois codebases separados — `billing` (existente, com Stripe) e `admin` (novo, sem secrets) — permitindo deploy independente.
- CSS 100% com variáveis de token; nenhuma cor hardcoded. Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — cancelar espaço do casal sem parceiro

- **`cancelCoupleWorkspace`** (nova): quando o dono está sozinho e quer sair, deleta em batch o member record, o workspaceRef e o workspace em vez de fazer `update(status: removed)`. O path de update só estava disponível para `role == 'partner'` nas rules, o que gerava "missing or insufficient permissions".
- **SharedSpacePage**: `handleLeaveOrRemove` agora distingue três casos — dono+parceiro (`removePartner`), dono sozinho (`cancelCoupleWorkspace`), parceiro saindo (`leaveCoupleWorkspace`). Botão "Cancelar e sair do espaço" visível sem precisar expandir `<details>`.

## 2026-06-17 — invites de casal deletados após uso em vez de acumular

- **Firestore rule** (`coupleInvites` delete): adicionada condição `status == 'accepted' && usedBy == request.auth.uid` para que quem aceitou o convite possa deletá-lo depois que o membro foi criado.
- **`acceptCoupleInvite`**: após `batch.commit()` confirmar (membro criado, regras satisfeitas), dispara `deleteDoc` fire-and-forget no invite.
- **`createCoupleInvite`**: removida guarda `!== 'accepted'` — agora deleta todos os invites antigos do workspace, incluindo aceitos.
- **`cleanupExpiredInvites`**: removida guarda `accepted`; dono pode limpar tudo (ativos expirados + revogados + aceitos).
- Rules publicadas via `firebase deploy --only firestore:rules`.
- Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — três bugs de navegação e fluxo de convite

- **Bug: usuário logado via na landing** — rota `/` agora usa `RootRoute` que redireciona autenticados para `/app`; antes renderizava `<LandingCss />` incondicionalmente, quebrando o PWA instalado.
- **Bug: aceite de convite perdido após login/cadastro** — `JoinInvitePage` passa `state.returnTo = /join/:code` ao navegar para `/login` ou `/register`; `LoginPage` já usava `location.state.returnTo` para redirecionar de volta. `OnboardingPage` redireciona para `/join/:code` ao terminar onboarding se há invite pendente no localStorage, em vez de ir sempre para `/app`.
- **Bug: botão "Sair" escondido** — "Cancelar e sair do espaço" movido de `<details>` para botão visível na tela de aguardar parceiro.

## 2026-06-17 — redesign do fluxo de aceite de convite de casal

- **`JoinInvitePage`** (`/join/:code`): agora faz preview automático do convite quando o usuário já está logado e com onboarding completo, mostrando o nome do workspace, data de expiração e botão "Entrar" direto na página — sem precisar ir ao `/app/shared`.
- **`SharedSpacePage`** estado sem espaço: se há código pendente no localStorage, mostra o card de aceite como ação primária (não mais escondido em `<details>`); auto-dispara o preview no mount.
- Fluxo anterior ficava preso na etapa do convite pois a UI de aceite estava oculta em `<details>Tenho um convite</details>` e não havia preview automático.

## 2026-06-17 — limpeza de coupleInvites acumulados

- **`createCoupleInvite`**: deleta todos os invites anteriores do workspace (exceto `accepted`) ao criar um novo, em vez de atualizar status para `revoked`. Elimina o backlog de 38 docs acumulados.
- **`revokeCoupleInvite`**: deleta o documento em vez de marcar `status: revoked`.
- **`cleanupExpiredInvites`**: deleta todos os não-`accepted` (revogados + expirados + ativos vencidos) em vez de atualizar status. Invites `accepted` são mantidos pois a Firestore rule de membership faz `getAfter` neles.

## 2026-06-17 — providers de dados compartilhados e higiene de re-renders

- **`FinanceDataProvider` + `SharedDataProvider`** montados no nível do `<RequireOnboardingComplete>` em `App.tsx`: listeners de Firestore agora ficam vivos entre navegações em vez de serem destruídos e recriados em cada troca de página. Todas as 13 páginas autenticadas consomem contexto via `useFinanceContext()`, `useCardsContext()`, `useGoalsContext()`, `useSharedContext()` e `useCoupleSavingsContext()`.
- **`hydrateFromProfile` com guard de igualdade**: o Zustand só notifica subscribers (e grava no localStorage) quando algum dos 5 campos de aparência realmente muda, eliminando re-renders e escritas desnecessárias a cada snapshot do perfil.
- **`limit(300)` em `subscribeTransactions`**: limita o listener a 300 transações mais recentes, evitando crescimento ilimitado de memória e CPU com o tempo.

## 2026-06-17 — estabilidade de listeners em useCardsData

- **Sem cascata de re-subscription em cartões**: dependências dos effects de faturas e ledger trocadas de `state.cards`/`state.invoices` (array inteiro) para `cardIds`/`invoiceIds` (string de IDs). Listeners só são recriados quando o conjunto de cartões ou faturas muda, não a cada atualização de campo (como `localSyncStatus` pending → synced).
- Removido `CODEX.md` da raiz (instruções consolidadas em `CLAUDE.md`).

## 2026-06-17 — higiene de custo Firestore no Blaze

- **Menos writes invisíveis**: a sincronização de aparência só grava em `/users/{uid}` quando tema, densidade, fonte ou movimento realmente mudarem.
- **Menos operações repetidas**: categorias padrão passam a ser preparadas uma vez por workspace na sessão do app, evitando rechecagens a cada mount de página financeira.
- Testes adicionados para garantir que aparência igual não dispara sync e que categorias padrão não são preparadas repetidamente no mesmo workspace.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (45/45), `npm run build`.

## 2026-06-17 — QA preventivo de permissões e listeners Firestore

- **Listeners protegidos com retry**: metas, cartões/faturas/ledger, espaço compartilhado e cofrinho do casal agora tentam novamente em `permission-denied`, `unavailable` e `deadline-exceeded` transitórios antes de mostrar erro.
- **Categorias com cor sem acesso negado**: `firestore.rules` agora permite `color` em criação/edição de categorias, alinhando as regras com os formulários do app.
- **Metas/cofrinho com schema nas rules**: create/update de `goals` e create de `goalContributions` ganharam validação de campos, usuário, valores e `monthKey`.
- Testes de rules adicionados para categoria colorida, meta válida, tentativa de forjar `createdBy` e contribuição zerada.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; `firestore.rules` compilado e publicado em `zerou-26757`. `npm run test:rules` segue bloqueado pelo Java local.

## 2026-06-17 — retry financeiro pós-onboarding e bottom sheet sem arrasto lateral

- **Conta recém-criada mais estável**: leituras financeiras protegidas agora tentam novamente quando o workspace acabou de nascer e o Firestore ainda não confirmou o membership no servidor.
- **Sem erro prematuro no dashboard**: a mensagem “Não foi possível carregar os dados financeiros deste workspace” deixa de aparecer durante a janela curta de confirmação da fundação inicial.
- **Metas no iPhone sem arrasto lateral**: bottom sheets, grids de cor/ícone, campos e controles segmentados receberam contenção de largura para evitar scroll horizontal no Safari/mobile.
- Teste novo cobre retry de `permission-denied` transitório em `useFinanceData`.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; checagem Playwright em viewport 393x852 confirmou `scrollWidth == clientWidth` no sheet.

## 2026-06-17 — exclusão definitiva de conta nas configurações

- Adicionado botão **Excluir minha conta** em `Segurança > Métodos de login`, com confirmação digitada (`EXCLUIR`) e reautenticação por senha ou Google.
- Criado `accountDeletionService`: remove perfil, refs do usuário, workspace pessoal completo, cartões/faturas/ledger, coleções financeiras, billing shell e espaços de casal criados pelo usuário; se for parceiro, sai do espaço antes de apagar a referência local.
- `firestore.rules` agora permite deletes estritos para dados da própria conta, workspace pessoal e workspaces de casal em que o usuário é dono; regras publicadas em `zerou-26757`.
- Textos legais/docs atualizados para refletir que a exclusão automatizada já existe dentro do app autenticado.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — onboarding mais curto e fundação sem erro genérico

- **Questionário inicial compacto**: removido o logo persistente do app autenticado/onboarding e reduzido o espaço vertical do wizard; CTA fica visível sem arrastar na etapa inicial.
- **Causa do erro genérico encontrada**: `firestore.rules` bloqueava `onboardingGoal` e `onboardingChallenge`, embora o onboarding gravasse esses campos no perfil.
- **Regras publicadas**: `firestore.rules` agora permite os campos opcionais do questionário e foi publicado em `zerou-26757` com `firebase deploy --only firestore:rules`.
- **Fundação mais tolerante a rede fraca**: criação inicial não faz mais leitura bloqueante antes da escrita e usa timeout curto para não prender a tela em conexão ruim.
- **Mensagens menos genéricas**: removido fallback “Nao foi possivel concluir esta acao agora” dos caminhos de Auth/SharedSpace; onboarding usa fallback específico.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — boot resiliente em internet fraca e logos offline

- **Boot/Auth resiliente em rede fraca**: `AuthContext` salva o perfil localmente e usa esse cache como fallback depois de 1,8s se Firebase Auth/perfil ficarem presos em conexão “meio online”.
- **Perfil não some em erro de snapshot**: falha temporária do Firestore mantém o último perfil local em vez de deixar o usuário preso no carregamento.
- **Ações sensíveis protegidas**: quando a sessão está usando fallback local (`authFromCache`), telas de verificação/métodos de login ficam bloqueadas até Firebase confirmar a sessão real.
- **SVGs de bancos offline**: Workbox passou a precachear `svg`; logos em `public/bank-logos/` entram no service worker.
- Teste novo para cache de perfil. Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`.

## 2026-06-17 — correção crítica: app travando/escrita pendente, offline e zoom

- **Firestore travando** (escrita ficava "pendente" e só sincronizava após refresh): `experimentalAutoDetectLongPolling` ligado e `persistentMultipleTabManager` no cache — o transporte WebChannel travava em algumas redes/navegadores.
- **Escritas otimistas em todo o app** (`fireWrite` em finance/cards/shared): nenhuma mutação bloqueia mais a UI esperando o servidor (fim do spinner infinito). Dispara a escrita, responde na hora e o `onSnapshot` mostra o item (offline-first de verdade). Validação síncrona (Zod) continua surgindo pro usuário.
- **Metas/cofrinho offline**: removido `orderBy('createdAt')` das queries de goals/goalContributions (offline o serverTimestamp fica nulo e escondia o item recém-criado); ordenação no cliente.
- **Zoom / arrastar lateral**: travado o overflow-x (html/body/app-main) e corrigida a margem negativa do header de valor que estourava a largura no mobile; `viewport-fit=cover`.
- Detalhe em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test` (37/37), `npm run build`.

## 2026-06-17 — Redesign Sol, app mobile-nativo, cofrinho do casal e landing nova

- Direção visual "Sol" (areia + tangerina, DM Sans 800 nos números) aplicada no app inteiro.
- App mobile-nativo: nav inferior com FAB, header de valor nas telas de lançamento, seletores em bottom-sheet, categorias com ícone+cor, onboarding em questionário, empty states ilustrados.
- Despesa no cartão pelo fluxo de Despesa; novo cartão com header de limite; dashboard compacto.
- Espaço do casal: divisão flexível (igual/%/valor) + **cofrinho do casal** (meta compartilhada + contribuições por pessoa, opção de descontar de conta pessoal).
- Tela de **Metas** ligada ao questionário do onboarding.
- Landing reescrita (CSS 3D) com mockup do app e copy de dor (PAS); promovida para `/`.
- SVGs oficiais de ~24 bancos; cores tokenizadas (teste `noHardcodedColors` verde).
- Documentação reorganizada estilo plantão (`CLAUDE.md`, `CODEX.md`, `SESSAO.md`, `docs/`).
- Detalhe técnico completo em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test`, `npm run build`; regras Firestore publicadas.

## 2026-06-15 - Estado atual da main

### Projeto

- Zerou e um SaaS/PWA financeiro mobile-first para controle financeiro individual e organizacao a dois.
- Nome publico do produto: Zerou.
- Tagline oficial: "Controle individual. Organizacao a dois."
- Stack principal: React, TypeScript strict, Vite, Firebase Web SDK, Cloud Firestore, Firebase Auth, Vercel e PWA.
- O app esta em modo de lancamento gratuito. Nao ha cobranca ativa, checkout ativo ou pagina publica de planos.

### Fase 1 - Fundacao SaaS

- Criado o app React/TypeScript/Vite na raiz do repositorio.
- Configurado Firebase client-side por variaveis `VITE_`, sem `firebaseConfig` hardcoded.
- Preparado Firebase Auth com email/senha, Google, reset de senha e logout.
- Criadas rotas publicas e autenticadas com React Router.
- Implementado onboarding inicial com criacao de perfil, workspace pessoal e membership.
- Criado app shell autenticado com sidebar desktop e bottom navigation mobile.
- Implementado dashboard inicial pos-login.
- Implementado design system inicial com tokens semanticos.
- Implementados os seis temas: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Implementado modo `system`, persistencia em `localStorage` antes do primeiro render e sincronizacao do tema em `/users/{uid}`.
- Copiados assets oficiais da Zerou para `public/brand/`.
- Implementado PWA basico com manifest, service worker e icones oficiais.
- Criado `.env.example`, `.gitignore`, `firebase.json`, `firestore.rules`, `storage.rules` e `vercel.json`.
- Ajustado fallback SPA da Vercel para rotas como `/login`, `/register` e `/app/*`.

### Ajuste Spark/Firebase

- Removida a dependencia de Cloud Functions no fluxo ativo da fundacao para manter o app no plano Spark/free.
- Criacao de usuario, workspace pessoal e membership passou a ser feita client-side com regras Firestore restritivas.
- Publicadas Firestore Rules no projeto real `zerou-26757`.
- Corrigido erro inicial de onboarding causado por leitura protegida antes da fundacao existir.

### PWA e atualizacao automatica

- Implementado auto-refresh de versao inspirado no app Plantao.
- Service worker usa `skipWaiting`, `clientsClaim` e limpeza de caches antigos.
- Vercel recebeu headers sem cache para `sw.js` e `workbox-*.js`.
- O app verifica atualizacoes ao abrir, focar, voltar online, voltar de aba oculta e periodicamente.

### Fase 2 - Motor financeiro essencial

- Implementados tipos e contratos de `Account`, `Category`, `Transaction`, `Bill` e `RecurringRule`.
- Criados servicos Firestore client-side para contas, categorias, transacoes, contas a pagar e recorrencias.
- Persistencia de dinheiro em centavos inteiros.
- IDs client-side e `clientMutationId` para idempotencia de transacoes.
- Criado calculo puro de saldo com receita, despesa, transferencia, ajuste e soft delete.
- Dashboard financeiro com saldo total, disponivel livre v1, valor comprometido, proximos compromissos, transacoes recentes e acoes rapidas.
- Rotas adicionadas:
  - `/app/dashboard`
  - `/app/accounts`
  - `/app/transactions`
  - `/app/transactions/new`
  - `/app/transactions/:transactionId/edit`
  - `/app/bills`
  - `/app/recurring`
  - `/app/search`
- Cadastro rapido mobile de transacao com campos principais e avancado recolhido.
- Sync status visual baseado em `hasPendingWrites` do Firestore.

### Fase 3 - Cartoes e faturas

- Implementados tipos de `CreditCard`, `Invoice` e `InvoiceLedgerEntry`.
- Criado dominio puro de faturas em `src/domain/invoices/*`.
- Compra no cartao reconhece despesa sem reduzir saldo da conta imediatamente.
- Pagamento de fatura reduz saldo da conta uma unica vez.
- Suporte a fatura aberta/fechada, pagamento parcial, pagamento total, creditos, encargos, antecipacao e reconciliacao.
- Rotas adicionadas:
  - `/app/cards`
  - `/app/cards/:cardId`
  - `/app/cards/:cardId/invoices/:invoiceId`
- Ledger de fatura tratado como imutavel pelas regras.

### Fase 4 - Espaco compartilhado

- Implementado workspace do casal.
- Implementados convites com codigo amigavel `DUO-XXXX-XX`, hash SHA-256, validade, uso unico, revogacao e regeneracao.
- Geracao de QR code e link de convite no client sem persistir token bruto.
- Rota publica `/join/:code` preserva convite ate login/cadastro.
- Rota autenticada `/app/shared` com criacao de espaco do casal, convites, aceite, claims compartilhados, comentarios e settlements.
- Claims compartilhados nao expõem referencias pessoais de conta, cartao ou fatura.
- Criado calculo de balanco por membro e sugestao de acerto.
- Area compartilhada foi posteriormente simplificada para reduzir confusao no celular.

### Fase 5 - Billing Stripe custom

- Criado scaffold de `functions/` com Node 22, TypeScript strict, Firebase Functions v2, Firebase Admin, Stripe e Zod.
- Implementadas callable functions futuras:
  - `createCheckoutSession`
  - `createCustomerPortalSession`
- Implementado webhook Stripe com validacao de assinatura e `rawBody`.
- Criado processamento idempotente de `billingEvents`.
- Criado processor/retry de eventos.
- Criado script `functions/scripts/seedPlanCatalog.mjs`.
- Criados tipos e regras para `billingAccounts`, `subscriptions`, `billingEvents` e `planCatalog`.
- Decisao de produto posterior: billing fica suspenso. Zerou fica 100% gratuito por enquanto.
- Paginas e links publicos de planos foram removidos do fluxo ativo.

### Fase 6 - Lancamento

- Criada landing publica clara, mobile-first e mais direta.
- Tema Paper claro virou padrao visual publico e primeiro render.
- Landing recebeu mockup mobile com efeito/aspecto 3D leve.
- Funcionalidades passaram a aparecer no corpo da landing.
- Removidos links publicos soltos de planos, cookies e subprocessadores.
- Removido banner de cookies para nao bloquear cadastro/uso.
- Analytics fica desligado por padrao e so inicializa se `VITE_ENABLE_ANALYTICS=true`.
- Rotas publicas reais:
  - `/features`
  - `/security`
  - `/help`
  - `/contact`
  - `/privacy-center`
  - `/legal/terms`
  - `/legal/privacy`
- Rotas legadas redirecionam:
  - `/pricing`
  - `/legal/cookies`
  - `/legal/subprocessors`
- Criados textos juridicos operacionais em `docs/legal/TERMS.md` e `docs/legal/PRIVACY.md`.
- Privacidade e termos foram reforcados para o contexto brasileiro, LGPD, Marco Civil e CDC.
- Privacy Center virou pagina informativa, sem botoes publicos de protocolo.
- Copy publica removeu termos tecnicos como "billing", "checkout", "offline-first", "ledger" e "workspace".
- Mensagens de erro de validacao foram convertidas para texto humano, sem expor JSON, `too_small`, `invalid_format` ou payload tecnico.
- Onboarding autenticado virou modo foco, sem sidebar/bottom nav ate concluir fundacao.
- App shell passou a bloquear atalhos visuais para funcoes privadas antes da fundacao do usuario.

### Pos-Fase 6 - UX financeiro e contas

- Melhorada UX mobile do dashboard, navegacao inferior e fluxo inicial.
- Adicionadas sugestoes de instituicoes financeiras ao criar conta financeira.
- Busca de instituicao aceita nome, alias e acentos.
- Conta financeira sem vinculos agora e excluida fisicamente do Firestore.
- Se a conta financeira tiver lancamentos, contas a pagar ou recorrencias ligadas, a UI bloqueia a exclusao e orienta remover/alterar os vinculos.
- Saldo inicial sozinho nao impede a exclusao de uma conta financeira.
- Foram adicionadas marcas compactas locais por banco.
- Foi adicionada primeira leva de SVGs locais de bancos em `public/bank-logos/`:
  - Nubank
  - PicPay
  - Mercado Pago
  - Neon
  - Modal
  - Wise
  - Nomad
- Criado `scripts/generate-bank-logos.mjs` e script `npm run generate:bank-logos`.
- Bancos sem SVG disponivel continuam com marcador visual ate entrada de assets oficiais confiaveis.

### Documentacao e operacao

- Criados ou atualizados docs operacionais:
  - `README.md`
  - `ARCHITECTURE.md`
  - `SECURITY.md`
  - `PRIVACY.md`
  - `RUNBOOK.md`
  - `docs/PRODUCTION_CHECKLIST.md`
  - `docs/BILLING.md`
  - `docs/BOOTSTRAP_FIREBASE_STRIPE.md`
  - `docs/MANUAL_SETUP_REQUIRED.md`
  - `documentacao-v12.2/IMPLEMENTATION_STATUS.md`
  - `documentacao-v12.2/QA_SCENARIOS.md`
- Criado este `CHANGELOG.md`.
- Criado `HANDOFF-PARA-CLAUDE.md` para passar contexto para outro agente.

### Validacoes executadas

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run functions:build`
- `npm run test:functions`
- `npm audit --omit=dev`
- Deploy de Firestore Rules/Indexes no projeto `zerou-26757`
- Smoke tests em `https://zerou-five.vercel.app`

### Limitacoes conhecidas

- `npm run test:rules` depende de Java local. Neste computador, `java -version` falha com codigo `3221226505`, entao os emuladores ficam bloqueados ate corrigir Java/PATH.
- Bundle inicial ainda passa de 500 kB. Code splitting deve ser feito depois.
- Billing Stripe existe como scaffold futuro, mas nao esta ativo no produto.
- Cloud Functions nao devem ser ativadas sem decisao de produto, Blaze, secrets e checklist operacional.
- Revisao juridica profissional ainda e recomendada antes de escala publica maior.
- App Check, backups, alertas de custo, dominio final e emails oficiais ainda precisam de configuracao externa.
