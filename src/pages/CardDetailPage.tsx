import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, ChevronDown, ChevronRight, ChevronUp, Layers, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { OngoingInstallmentsSheet } from '../cards/OngoingInstallmentsSheet';
import { invoiceHasVisibleActivity } from '../cards/anticipation';
import { groupInvoicesForDisplay } from '../cards/invoiceGroups';
import { useConfirm } from '../components/ConfirmDialog';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels } from '../cards/cardLabels';
import { deleteCard, loadMoreInvoices, recordInvoicePayment, updateCard, type LocalCardSynced } from '../cards/cardService';
import { pickCurrentInvoice } from '../cards/cardDates';
import { invoiceLedgerKey, mergeInvoicesWithLedger, useInvoiceLedger } from '../cards/useInvoiceLedger';

import { formatFriendlyDate, formatFriendlyMonth, monthKeyFromDate } from '../finance/financeDates';
import { centsToInputValue, formatMoney, parseMoneyToCents } from '../finance/money';

import type { Invoice } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function CardDetailPage() {
  const { cardId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsContext();
  const finance = useFinanceContext();
  const card = cardsData.cards.find((item) => item.id === cardId);
  const invoices = cardsData.invoices.filter((invoice) => invoice.cardId === cardId);
  const currentMonth = monthKeyFromDate(new Date());

  // ⚠️ Só o ledger das faturas EM ABERTO é assinado, e isso é um pedido direto do dono
  // (07/08/2026): *"essa aba ia tirar a leitura da fatura que já foi paga"*. Fatura paga acumula pra
  // sempre — em dois anos de uso são ~24 assinaturas de ledger a cada abertura da tela do cartão,
  // pagas pra renderizar linhas que dizem "Paga · R$ 0,00".
  //
  // É seguro porque esta tela não precisa do ledger de fatura paga pra NADA: a linha mostra mês,
  // status e saldo, todos campos persistidos que a Cloud Function mantém; `activeInvoices`
  // (limite usado) só olha `open`/`closed`; e ao abrir a fatura, `InvoicePage` assina o ledger dela.
  //
  // O agrupamento que decide o que assinar usa os totais PERSISTIDOS de propósito — usar os
  // recalculados seria circular (precisaria do ledger pra decidir se assina o ledger). Fatura paga
  // agora mesmo, cuja Function ainda não processou, tem saldo persistido > 0 ⇒ segue assinada até a
  // Function alcançar, que é justo o instante em que ainda vale a pena olhar o ledger dela.
  const ledgerTargets = useMemo(
    () => groupInvoicesForDisplay(invoices, currentMonth).toPay,
    [invoices, currentMonth]
  );
  const invoiceRefs = useMemo(
    () => ledgerTargets.map((invoice) => ({ id: invoice.id, cardId: invoice.cardId })),
    [ledgerTargets]
  );
  const { entries: ledgerEntries, loading: ledgerLoading, error: ledgerError, loadedInvoiceKeys } =
    useInvoiceLedger(workspaceId, invoiceRefs, finance.transactionIndex);
  const invoicesWithLedger = useMemo(
    () => mergeInvoicesWithLedger(invoices, ledgerEntries, loadedInvoiceKeys),
    [invoices, ledgerEntries, loadedInvoiceKeys]
  );
  // Uma fatura futura cuja única parcela foi antecipada pra cá some do histórico — igual sumiu
  // da própria tela dela (`anticipatedAwayEntryIds`). Se uma compra nova cair nela depois, ela
  // deixa de ficar vazia e reaparece sozinha (não é um estado gravado, é sempre recalculado).
  //
  // ⚠️ Só esconde fatura cujo ledger REALMENTE chegou. Sem essa condição, fatura ainda sem resposta
  // (`ledgerEntries: []`) era tratada como "vazia" e sumia da lista — foi o "só aparece a fatura
  // atual" de 07/08/2026, com 13 das 14 faturas do cartão desaparecendo no cache frio.
  const subscribedVisible = invoicesWithLedger.filter(
    (invoice) =>
      !loadedInvoiceKeys.has(invoiceLedgerKey(invoice.cardId, invoice.id)) ||
      invoiceHasVisibleActivity(invoice.ledgerEntries)
  );

  // Páginas de fatura ANTIGA trazidas pelo "Ver mais faturas". Vivem só nesta tela: não entram em
  // `cardsData.invoices` (não queremos assinar ledger delas — custo) nem em `invoiceRefs`. Sem
  // ledger, ficam com os totais persistidos, que é exatamente o certo pra fatura velha já quitada.
  const [olderInvoices, setOlderInvoices] = useState<Array<LocalCardSynced<Invoice>>>([]);
  const [loadingMoreInvoices, setLoadingMoreInvoices] = useState(false);
  const [reachedInvoiceEnd, setReachedInvoiceEnd] = useState(false);
  const [loadMoreInvoicesFailed, setLoadMoreInvoicesFailed] = useState(false);
  const [showAllToPay, setShowAllToPay] = useState(false);
  /** Aba do card de faturas. Abre sempre em "a pagar" — o que a pessoa precisa fazer vem primeiro. */
  const [invoiceTab, setInvoiceTab] = useState<'toPay' | 'paid'>('toPay');

  const visibleInvoices = useMemo(() => {
    const byId = new Map<string, (typeof subscribedVisible)[number]>();
    for (const invoice of olderInvoices) byId.set(invoice.id, { ...invoice, ledgerEntries: [] });
    for (const invoice of subscribedVisible) byId.set(invoice.id, invoice);
    return [...byId.values()].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olderInvoices, invoicesWithLedger, loadedInvoiceKeys]);

  const { toPay: invoicesToPay, settled: invoicesSettled } = useMemo(
    () => groupInvoicesForDisplay(visibleInvoices, currentMonth),
    [visibleInvoices, currentMonth]
  );
  /** Quantas faturas "a pagar" mostrar antes de recolher — 12 meses ("de agosto a agosto"). */
  const TO_PAY_COLLAPSE = 12;
  const shownToPay = showAllToPay ? invoicesToPay : invoicesToPay.slice(0, TO_PAY_COLLAPSE);

  async function handleLoadMoreInvoices() {
    if (loadingMoreInvoices || reachedInvoiceEnd || !workspaceId || !cardId) return;
    const oldest = visibleInvoices[0];
    if (!oldest) return;
    setLoadingMoreInvoices(true);
    setLoadMoreInvoicesFailed(false);
    try {
      const page = await loadMoreInvoices(workspaceId, cardId, oldest.referenceMonth);
      const known = new Set(visibleInvoices.map((invoice) => invoice.id));
      const fresh = page.filter((invoice) => !known.has(invoice.id));
      if (fresh.length > 0) setOlderInvoices((current) => [...current, ...fresh]);
      if (page.length < 12) {
        // Página incompleta só significa "fim" quando há conexão. Offline pode ser cache parcial —
        // dizer "fim" ali esconderia histórico que existe. Mesma regra do "Carregar mais" do
        // Extrato (`TransactionsPage`).
        if (typeof navigator !== 'undefined' && navigator.onLine) setReachedInvoiceEnd(true);
        else setLoadMoreInvoicesFailed(true);
      }
    } catch {
      setLoadMoreInvoicesFailed(true);
    } finally {
      setLoadingMoreInvoices(false);
    }
  }
  const [message, setMessage] = useState<string | null>(null);
  /** `danger` por padrão; vira `success` só na confirmação de pagamento (ver `handleQuickPay`). */
  const [messageType, setMessageType] = useState<'success' | 'danger'>('danger');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  /** Mensagem DENTRO do sheet — o motivo de não dar pra pagar tem que aparecer onde a pessoa
   *  está olhando, com o sheet ainda aberto. */
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const paidAtRef = useRef(new Date());
  const [ongoingSheetOpen, setOngoingSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLimit, setEditLimit] = useState('');

  // Destaque pra trazer compras existentes: logo após criar o cartão (`?novo=1`) ou
  // enquanto ele ainda não tem nenhuma compra lançada.
  const [searchParams] = useSearchParams();
  const showOnboardingCallout = searchParams.get('novo') === '1' || invoices.length === 0;

  function handleOpenPaySheet() {
    setPayAmount('');
    setPayAccountId('');
    setPaySubmitting(false);
    setPayMessage(null);
    paidAtRef.current = new Date();
    setPaySheetOpen(true);
  }

  function handleOpenEditSheet() {
    if (!card) return;
    setEditName(card.name);
    setEditLimit(centsToInputValue(card.limitCents));
    setEditSheetOpen(true);
  }

  function handleSaveEdit() {
    if (!workspaceId || !cardId || !editName.trim() || !editLimit.trim()) return;
    setEditSheetOpen(false);
    updateCard(workspaceId, cardId, {
      name: editName.trim(),
      limitCents: parseMoneyToCents(editLimit)
    }).catch((error) => {
      setMessageType('danger');
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível salvar as alterações do cartão.'));
    });
  }

  async function handleDeleteCard() {
    if (!workspaceId || !cardId) return;
    // Excluir um cartão que ainda tem saldo em aberto faz essa dívida sumir do
    // "Comprometido" e devolver limite — o "Disponível" sobe sem ninguém ter pago nada.
    // A pessoa precisa saber disso ANTES, com o valor na frente.
    const outstandingCents = activeInvoices.reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
    const ok = await confirm({
      title: 'Excluir cartão?',
      message:
        outstandingCents > 0
          ? `Este cartão ainda tem ${formatMoney(outstandingCents)} em faturas a pagar. Ao excluir, esse valor deixa de contar no seu "Comprometido" e as faturas sumem do app — as compras continuam no Extrato. Se a dívida existe de verdade, pague ou registre antes.`
          : 'O cartão sai da sua lista e as faturas dele deixam de aparecer no app. As compras já lançadas continuam no Extrato.',
      confirmLabel: outstandingCents > 0 ? 'Excluir mesmo assim' : 'Excluir',
      danger: true
    });
    if (!ok) return;
    deleteCard(workspaceId, cardId);
    navigate('/app/cards');
  }

  function handleQuickPay() {
    if (!workspaceId || !user || !card || paySubmitting) return;
    // Guardas que MOSTRAM o motivo e mantêm o sheet aberto — antes eram `return` mudos, e o clique
    // sem efeito nenhum foi o "cliquei pra pagar e não vai" de 06/08/2026. Ver `InvoicePage.tsx`.
    if (!openInvoice) {
      setPayMessage('Nenhuma fatura em aberto neste cartão.');
      return;
    }
    if (!payAccountId) {
      setPayMessage('Escolha a conta de onde vai sair o pagamento.');
      return;
    }
    if (ledgerLoading) {
      setPayMessage('Ainda carregando os lançamentos da fatura — aguarde um instante.');
      return;
    }
    // `parseMoneyToCents` LANÇA com texto não-numérico (`money.ts`) — sem este try, a exceção morre
    // dentro do handler de clique e o usuário não vê nada. Ver `InvoicePage.tsx`.
    let cents: number;
    try {
      cents = payAmount.trim() ? parseMoneyToCents(payAmount) : openInvoice.outstandingBalanceCents;
    } catch (err) {
      setPayMessage(getUserFacingErrorMessage(err, 'Informe um valor em reais válido.'));
      return;
    }
    if (!cents) {
      setPayMessage(
        payAmount.trim()
          ? 'Informe um valor maior que zero.'
          : 'Esta fatura não tem saldo em aberto. Se quiser registrar outro pagamento, digite o valor.'
      );
      return;
    }
    setPaySubmitting(true);
    setPaySheetOpen(false);
    setPayAmount('');
    setPayAccountId('');
    setPayMessage(null);
    recordInvoicePayment(workspaceId, user.uid, {
      cardId: card.id,
      invoiceId: openInvoice.id,
      accountId: payAccountId,
      amountCents: cents,
      paidAt: paidAtRef.current,
      advance: openInvoice.status === 'open'
    })
      .then(() => {
        setMessageType('success');
        setMessage(`Pagamento de ${formatMoney(cents)} registrado.`);
      })
      .catch((err) => {
        setMessageType('danger');
        setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o pagamento.'));
      })
      .finally(() => setPaySubmitting(false));
  }

  /** Uma linha da lista de faturas — usada pelas duas abas ("a pagar" e "pagas"). */
  function invoiceRow(invoice: (typeof visibleInvoices)[number]) {
    const isPaid = invoice.status === 'paid' || invoice.status === 'overpaid';
    return (
      <Link className="list-row list-row--link" key={invoice.id} to={`/app/cards/${invoice.cardId}/invoices/${invoice.id}`}>
        <div>
          <strong>Fatura {formatFriendlyMonth(invoice.referenceMonth)}</strong>
          <span className="text-secondary">
            {invoiceStatusLabels[invoice.status]} · vence {formatFriendlyDate(invoice.dueDate)}
          </span>
        </div>
        <div className="list-row-end">
          <strong className={isPaid ? 'amount--income' : invoice.outstandingBalanceCents > 0 ? 'amount--expense' : ''}>
            {formatMoney(invoice.outstandingBalanceCents)}
          </strong>
          {isPaid && <span className="sync-badge sync-badge--synced">Paga</span>}
        </div>
      </Link>
    );
  }

  if (!card && !cardsData.loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Cartão</p>
        <h1 className="page-title">Cartão não encontrado.</h1>
        <Link className="button button--secondary" to="/app/cards">
          Voltar para cartões
        </Link>
      </section>
    );
  }

  // invoicesWithLedger (não cardsData.invoices cru) — carrega o total AO VIVO calculado do
  // ledger já em memória, em vez de esperar a Cloud Function processar (ver comentário em
  // mergeInvoicesWithLedger). Cobre tanto "acabei de lançar uma compra" quanto offline.
  const activeInvoices = invoicesWithLedger.filter(
    (invoice) => invoice.status === 'open' || invoice.status === 'closed'
  );
  const openInvoice = pickCurrentInvoice(activeInvoices);
  const usedCents = activeInvoices.reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
  const availableCents = card ? Math.max(0, card.limitCents - usedCents) : 0;
  const usedPercent = card && card.limitCents > 0 ? Math.min(100, Math.round((usedCents / card.limitCents) * 100)) : 0;
  const heroBarClass =
    usedPercent >= 90 ? 'card-limit-hero-display-fill--danger' :
    usedPercent >= 70 ? 'card-limit-hero-display-fill--warning' : '';

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Cartão</p>
          <h1 className="page-title">{card?.name ?? 'Carregando cartão'}</h1>
          <p className="page-description">
            {card ? `${card.brand} ···· ${card.lastFour} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}` : 'Carregando dados.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link className="button button--secondary" to="/app/cards">
            Todos os cartões
          </Link>
          <button className="icon-button" type="button" onClick={() => void handleDeleteCard()} aria-label="Excluir cartão">
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {card ? (
        <>
          <div className="card-limit-hero-display">
            <div className="card-limit-hero-display-top">
              <div>
                <p className="card-limit-hero-display-label">Limite disponível</p>
                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <span className="card-limit-hero-display-value">{formatMoney(availableCents)}</span>
                  <span className="card-limit-hero-display-of">de {formatMoney(card.limitCents)}</span>
                  <button
                    className="button button--ghost button--compact card-limit-hero-display-edit"
                    type="button"
                    onClick={handleOpenEditSheet}
                    aria-label="Editar limite e nome do cartão"
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="card-limit-hero-display-secondary">
                {/* `usedCents` soma TODAS as faturas em aberto/fechadas (inclusive parcelas
                    de meses futuros), não só a fatura atual — chamar isso de "fatura em
                    aberto" fazia o número não bater com a fatura logo abaixo. */}
                <p className="card-limit-hero-display-label">Limite usado</p>
                <span className="card-limit-hero-display-secondary-value">{formatMoney(usedCents)}</span>
              </div>
            </div>
            <div className="card-limit-hero-display-track" aria-label={`${usedPercent}% do limite usado`}>
              <div className={`card-limit-hero-display-fill ${heroBarClass}`} style={{ width: `${Math.max(2, usedPercent)}%` }} />
            </div>
            {usedPercent >= 70 && (
              <p className="card-limit-hero-display-note">
                {usedPercent >= 90 ? 'Limite quase esgotado.' : 'Mais de 70% do limite em uso.'}
              </p>
            )}
          </div>

          {openInvoice ? (
            <div className="surface surface-pad card-invoice-current">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p className="eyebrow" style={{ marginBottom: '0.15rem' }}>Fatura atual</p>
                  <strong className="display-number" style={{ display: 'block', fontSize: '1.1rem' }}>
                    <span className={openInvoice.outstandingBalanceCents > 0 ? 'amount--expense' : 'amount--income'}>
                      {formatMoney(openInvoice.outstandingBalanceCents)}
                    </span>
                  </strong>
                  <span className="text-secondary">
                    {formatFriendlyMonth(openInvoice.referenceMonth)} · {openInvoice.status === 'open' ? 'em aberto' : 'fechada'} · vence {formatFriendlyDate(openInvoice.dueDate)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button className="button button--primary button--compact" type="button" onClick={handleOpenPaySheet}>
                    {openInvoice.status === 'open' ? 'Antecipar' : 'Pagar agora'}
                  </button>
                  <Link className="button button--subtle button--compact" to={`/app/cards/${card.id}/invoices/${openInvoice.id}`}>
                    Detalhes
                  </Link>
                </div>
              </div>
              {openInvoice.status === 'open' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                  Antecipar a fatura é quitar este ciclo antes de fechar — o valor libera seu limite na hora.
                </p>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      <FormMessage type={messageType}>{message}</FormMessage>
      {ledgerError && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: '0.75rem' }}>{ledgerError}</div>
      )}

      {card && showOnboardingCallout ? (
        // Logo depois de criar o cartão (ou enquanto ele não tem nenhuma compra): a maioria
        // já chega com parcelas rolando, então destacamos a entrada em vez de esconder num botão.
        <article className="surface surface-pad card-onboarding-callout">
          <p className="eyebrow">Esse cartão já tinha compras?</p>
          <h2>Traga o que já existe</h2>
          <p className="text-secondary">
            Parcelas que você já vinha pagando (ex.: algo em 12x, já na 7ª) ou uma compra futura que já fez e começa a ser
            cobrada mais pra frente. Adicione quantas precisar — as parcelas já pagas não são recriadas.
          </p>
          <button className="button button--primary button--block" type="button" onClick={() => setOngoingSheetOpen(true)}>
            <Layers size={17} aria-hidden="true" /> Adicionar parcelas em andamento
          </button>
        </article>
      ) : null}

      <article className="surface surface-pad">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Faturas</p>
            <h2>Faturas do cartão</h2>
          </div>
          <CalendarClock size={22} aria-hidden="true" />
        </div>
        {cardsData.loading || ledgerLoading ? (
          <LoadingState compact />
        ) : (card && !showOnboardingCallout) || visibleInvoices.length > 0 ? (
          <>
            {/* Duas ABAS, não dois grupos empilhados. A versão anterior recolhia as pagas no fim da
                mesma lista, e o dono apontou o furo (07/08/2026): a fatura paga do mês corrente
                continuava na lista principal, e mesmo recolhida a seção soma altura. *"Depois de
                cinco faturas pagas eu já vou ter que ficar arrastando a tela pra baixo pra ver as
                que eu preciso pagar."* Em aba, fatura paga sai do fluxo de rolagem — e o ledger dela
                nem é lido (ver `ledgerTargets`). */}
            <div className="segmented segmented--tabs" role="tablist" aria-label="Faturas do cartão">
              <button
                type="button"
                role="tab"
                id="faturas-tab-a-pagar"
                aria-selected={invoiceTab === 'toPay'}
                aria-controls="faturas-painel-a-pagar"
                onClick={() => setInvoiceTab('toPay')}
              >
                A pagar{invoicesToPay.length > 0 ? ` (${invoicesToPay.length})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                id="faturas-tab-pagas"
                aria-selected={invoiceTab === 'paid'}
                aria-controls="faturas-painel-pagas"
                onClick={() => setInvoiceTab('paid')}
              >
                Pagas{invoicesSettled.length > 0 ? ` (${invoicesSettled.length})` : ''}
              </button>
            </div>

            {invoiceTab === 'toPay' ? (
              <div className="item-list" id="faturas-painel-a-pagar" role="tabpanel" aria-labelledby="faturas-tab-a-pagar">
                {card && !showOnboardingCallout && (
                  <button
                    type="button"
                    className="list-row list-row--tap list-row--with-icon"
                    onClick={() => setOngoingSheetOpen(true)}
                  >
                    <div className="list-row-body" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Layers size={17} aria-hidden="true" />
                      <strong>Lançar compra parcelada que já começou</strong>
                    </div>
                    <ChevronRight size={16} aria-hidden="true" className="text-secondary" />
                  </button>
                )}
                {shownToPay.map((invoice) => invoiceRow(invoice))}
                {invoicesToPay.length > TO_PAY_COLLAPSE && (
                  <button type="button" className="list-toggle" onClick={() => setShowAllToPay((v) => !v)}>
                    {showAllToPay ? (
                      <>Ver menos <ChevronUp size={14} aria-hidden="true" /></>
                    ) : (
                      <>Ver todas as {invoicesToPay.length} <ChevronDown size={14} aria-hidden="true" /></>
                    )}
                  </button>
                )}
                {invoicesToPay.length === 0 && (
                  <p className="text-secondary" style={{ margin: '0.5rem 0 0' }}>
                    Nenhuma fatura a pagar neste cartão.
                  </p>
                )}
              </div>
            ) : (
              <div className="item-list" id="faturas-painel-pagas" role="tabpanel" aria-labelledby="faturas-tab-pagas">
                {invoicesSettled.map((invoice) => invoiceRow(invoice))}
                {invoicesSettled.length === 0 && (
                  <p className="text-secondary" style={{ margin: '0.5rem 0 0' }}>
                    Nenhuma fatura paga ainda.
                  </p>
                )}
                {!reachedInvoiceEnd && (
                  <div aria-live="polite">
                    <button
                      type="button"
                      className="button button--ghost button--compact"
                      onClick={handleLoadMoreInvoices}
                      disabled={loadingMoreInvoices}
                    >
                      {loadingMoreInvoices ? 'Carregando…' : 'Ver mais faturas'}
                    </button>
                    {loadMoreInvoicesFailed && (
                      <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.4rem 0 0' }}>
                        Não foi possível buscar faturas mais antigas. Verifique a conexão.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            illustration="cards"
            title="Nenhuma fatura ainda"
            description="Lance a primeira compra em Despesas."
          />
        )}
      </article>

      {confirmDialog}
      <BottomSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        title="Pagar fatura"
        subtitle={openInvoice ? `${formatFriendlyMonth(openInvoice.referenceMonth)} · ${formatMoney(openInvoice.outstandingBalanceCents)} em aberto` : undefined}
      >
        <div className="form-stack">
          <label className="field">
            <span>Valor a pagar</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={openInvoice ? formatMoney(openInvoice.outstandingBalanceCents) : '0,00'}
              autoFocus
            />
            <span className="field-hint">Deixe em branco para pagar o valor total em aberto.</span>
          </label>
          <div className="field">
            <span className="field-label">De qual conta sai?</span>
            <div className="chip-row">
              {finance.accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${payAccountId === a.id ? ' chip--active' : ''}`}
                  onClick={() => setPayAccountId(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
            {finance.accounts.length === 0 && (
              <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                Cadastre uma conta em <Link to="/app/accounts" className="inline-link">Contas</Link> para registrar o pagamento.
              </p>
            )}
          </div>
          {openInvoice?.status === 'open' && (
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
              Fatura ainda aberta — pode pagar qualquer valor agora. O limite é liberado imediatamente.
            </p>
          )}
          <FormMessage>{payMessage}</FormMessage>
          <div className="sheet-actions">
            {/* Só `paySubmitting` desabilita — falta de conta, saldo zero e ledger carregando viram
                MENSAGEM no `handleQuickPay`, não botão morto sem explicação. */}
            <button
              className="button button--primary"
              type="button"
              disabled={paySubmitting}
              onClick={handleQuickPay}
            >
              Confirmar pagamento
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        title="Editar cartão"
        subtitle="Ajustar limite ou nome"
      >
        <div className="form-stack">
          <label className="field">
            <span>Nome do cartão</span>
            <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Limite</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={editLimit}
              onChange={(e) => setEditLimit(e.target.value)}
              placeholder="0,00"
            />
            <span className="field-hint">Ajuste quando o banco aumentar ou reduzir seu limite.</span>
          </label>
          <div className="sheet-actions">
            <button
              className="button button--primary"
              type="button"
              disabled={!editName.trim() || !editLimit.trim()}
              onClick={handleSaveEdit}
            >
              Salvar
            </button>
          </div>
        </div>
      </BottomSheet>

      {card ? (
        <OngoingInstallmentsSheet
          open={ongoingSheetOpen}
          workspaceId={workspaceId}
          userId={user?.uid}
          card={card}
          categories={finance.categories}
          onClose={() => setOngoingSheetOpen(false)}
        />
      ) : null}
    </section>
  );
}
