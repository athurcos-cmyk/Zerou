import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { SelectField } from '../components/SelectField';
import { useConfirm } from '../components/ConfirmDialog';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels, ledgerTypeLabels } from '../cards/cardLabels';
import { anticipatedAwayEntryIds, groupAnticipatablePurchases } from '../cards/anticipation';
import {
  anticipateInstallments,
  recordInvoiceCredit,
  recordInvoiceFee,
  recordInvoicePayment
} from '../cards/cardService';
import { mergeInvoicesWithLedger, useInvoiceLedger } from '../cards/useInvoiceLedger';

import { formatFriendlyDate, formatFriendlyMonth, fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';

import type { InvoiceLedgerEntryType, InvoiceStatus } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

/** "fev", "fev e mar", "fev, mar e abr" */
function formatList(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Mapeia os 7 status de fatura pras 3 variantes semânticas que `.sync-badge` já tem. */
function statusBadgeVariant(status: InvoiceStatus): 'synced' | 'pending' | 'failed' {
  if (status === 'paid' || status === 'overpaid') return 'synced';
  if (status === 'overdue') return 'failed';
  return 'pending';
}

export function InvoicePage() {
  const { cardId, invoiceId } = useParams();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsContext();
  const finance = useFinanceContext();
  const card = cardsData.cards.find((item) => item.id === cardId);
  const cardInvoices = useMemo(() => cardsData.invoices.filter((item) => item.cardId === cardId), [cardsData.invoices, cardId]);
  const invoiceRefs = useMemo(() => cardInvoices.map((item) => ({ id: item.id, cardId: item.cardId })), [cardInvoices]);
  const ledgerEntries = useInvoiceLedger(workspaceId, invoiceRefs, finance.transactionIndex);
  const cardInvoicesWithLedger = useMemo(() => mergeInvoicesWithLedger(cardInvoices, ledgerEntries), [cardInvoices, ledgerEntries]);
  const invoice = cardInvoicesWithLedger.find((item) => item.id === invoiceId);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(todayInputValue());

  const [creditAmount, setCreditAmount] = useState('');
  const [creditType, setCreditType] = useState<'refund_credit' | 'chargeback_credit' | 'manual_credit'>('refund_credit');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeType, setFeeType] = useState<'interest' | 'fine' | 'iof' | 'fee' | 'manual_debit'>('fee');
  // Quantas das ÚLTIMAS parcelas antecipar, por compra (sourceTransactionId → N).
  const [anticipateCounts, setAnticipateCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);

  // Lista de Compras: colapsada além de 5 linhas, com busca por nome só quando há
  // muitas compras diferentes na fatura (não ajuda quando é a mesma compra parcelada
  // repetida — nesse caso o "ver todas" já resolve).
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [purchaseSearchOpen, setPurchaseSearchOpen] = useState(false);
  const [purchaseQuery, setPurchaseQuery] = useState('');
  const PURCHASES_COLLAPSE_THRESHOLD = 5;
  const PURCHASES_SEARCH_THRESHOLD = 8;

  const txnDescriptions = new Map(
    finance.transactions
      .filter((t) => t.type === 'card_purchase' && t.cardId === cardId && !t.deletedAt)
      .map((t) => [t.id, t.description])
  );

  const anticipatableGroups = invoice
    ? groupAnticipatablePurchases(cardInvoicesWithLedger, invoice).map((group) => ({
        ...group,
        description: txnDescriptions.get(group.sourceTransactionId) ?? 'Compra parcelada'
      }))
    : [];

  const anticipateTotalCents = anticipatableGroups.reduce((total, group) => {
    const count = anticipateCounts[group.sourceTransactionId] ?? 0;
    return total + group.installments.slice(0, count).reduce((sum, inst) => sum + inst.amountCents, 0);
  }, 0);

  function handleOpenPaySheet() {
    setPayAmount('');
    setPayAccountId('');
    setPayDate(todayInputValue());
    setPaySheetOpen(true);
  }

  function handlePay() {
    if (!workspaceId || !user || !cardId || !invoiceId || !payAccountId) return;
    const amount = payAmount.trim() ? parseMoneyToCents(payAmount) : (invoice?.outstandingBalanceCents ?? 0);
    if (!amount) return;
    setPaySheetOpen(false);
    setMessage(null);
    recordInvoicePayment(workspaceId, user.uid, {
      cardId,
      invoiceId,
      accountId: payAccountId,
      amountCents: amount,
      paidAt: fromDateInputValue(payDate),
      advance: invoice?.status === 'open'
    }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o pagamento.')));
  }

  async function handleAnticipation() {
    if (!workspaceId || !user || !cardId || !invoiceId) return;
    // Por compra, as N ÚLTIMAS parcelas (o grupo já vem ordenado da última pra primeira).
    // `installmentTotal` vem do grupo (não de cada parcela) — leva junto pra poder rotular
    // "parcela 8/10 antecipada" na fatura de origem, em vez de um genérico sem número.
    const selected = anticipatableGroups.flatMap((group) =>
      group.installments
        .slice(0, anticipateCounts[group.sourceTransactionId] ?? 0)
        .map((inst) => ({ ...inst, installmentTotal: group.installmentTotal }))
    );
    if (selected.length === 0) return;

    // Explica o que se move (decisão #4 da spec) + avisa que é irreversível.
    const leavingMonths = [...new Set(selected.map((inst) => inst.referenceMonth))]
      .sort()
      .map((rm) => format(new Date(Number(rm.slice(0, 4)), Number(rm.slice(5, 7)) - 1, 1), 'MMM/yyyy', { locale: ptBR }));
    const monthsLabel = formatList(leavingMonths);
    const ok = await confirm({
      title: `Antecipar ${selected.length} ${selected.length === 1 ? 'parcela' : 'parcelas'}?`,
      message: `${selected.length === 1 ? 'Ela sai' : 'Elas saem'} das faturas de ${monthsLabel} e ${selected.length === 1 ? 'passa' : 'passam'} a contar nesta fatura agora — total ${formatMoney(anticipateTotalCents)}. Seu limite não muda; só o mês em que cada parcela pesa. Isso não pode ser desfeito.`,
      confirmLabel: 'Antecipar',
      danger: false
    });
    if (!ok) return;

    const credits = selected.map((inst) => ({
      invoiceId: inst.invoiceId,
      amountCents: inst.amountCents,
      sourceTransactionId: inst.sourceTransactionId,
      installmentNumber: inst.installmentNumber,
      installmentTotal: inst.installmentTotal
    }));
    setAnticipateCounts({});
    setMessage(null);
    anticipateInstallments(workspaceId, user.uid, {
      cardId,
      currentInvoiceId: invoiceId,
      credits,
      effectiveAt: new Date()
    }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a antecipação.')));
  }

  function handleCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user || !cardId || !invoiceId) return;
    const amount = parseMoneyToCents(creditAmount);
    if (!amount) return;
    setMessage(null);
    setCreditAmount('');
    recordInvoiceCredit(workspaceId, user.uid, {
      cardId,
      invoiceId,
      type: creditType,
      amountCents: amount,
      effectiveAt: new Date(),
      description: ledgerTypeLabels[creditType]
    }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o crédito.')));
  }

  function handleFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user || !cardId || !invoiceId) return;
    const amount = parseMoneyToCents(feeAmount);
    if (!amount) return;
    setMessage(null);
    setFeeAmount('');
    recordInvoiceFee(workspaceId, user.uid, {
      cardId,
      invoiceId,
      type: feeType,
      amountCents: amount,
      effectiveAt: new Date(),
      description: ledgerTypeLabels[feeType]
    }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a tarifa.')));
  }

  if (!invoice && !cardsData.loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Fatura</p>
        <h1 className="page-title">Fatura não encontrada.</h1>
        <Link className="button button--secondary" to={`/app/cards/${cardId ?? ''}`}>
          Voltar ao cartão
        </Link>
      </section>
    );
  }

  const isPaid = invoice?.status === 'paid' || invoice?.status === 'overpaid';
  const isOpen = invoice?.status === 'open';
  // Parcela que foi antecipada PRA FORA desta fatura: o crédito que a cancela nasce aqui
  // mesmo (na fatura de origem), e mostrar "compra R$300 / crédito -R$300" lado a lado é ruído
  // — no cartão de verdade a parcela antecipada só SOME da fatura futura. `anticipatedAwayEntryIds`
  // casa cada parcela com o crédito que a anula (mesma compra, mesmo valor).
  const hiddenEntryIds = invoice ? anticipatedAwayEntryIds(invoice.ledgerEntries) : new Set<string>();
  // 'installment_anticipation' entra aqui de propósito: é um débito real que soma no
  // `purchasesTotalCents` do hero (calculateInvoice), então precisa aparecer na lista —
  // senão o total "Compras" não bate com a soma das linhas mostradas. Diferente do caso
  // acima: essa é a parcela pousando AGORA nesta fatura, sempre visível.
  const purchases = (invoice?.ledgerEntries.filter((e) => e.type === 'purchase' || e.type === 'installment_anticipation') ?? []).filter(
    (e) => !hiddenEntryIds.has(e.id)
  );
  const payments = invoice?.ledgerEntries.filter((e) => e.type === 'payment' || e.type === 'advance_payment') ?? [];

  // Label + prefixo ("parcela 8/10 antecipada") resolvidos uma vez só, pra poder
  // filtrar por nome e colapsar sem duplicar essa lógica no JSX.
  const purchaseRows = purchases.map((entry) => {
    const label = txnDescriptions.get(entry.sourceTransactionId ?? '') ?? ledgerTypeLabels[entry.type as InvoiceLedgerEntryType];
    const isAnticipated = entry.type === 'installment_anticipation';
    const installment =
      entry.installmentNumber && entry.installmentTotal ? `parcela ${entry.installmentNumber}/${entry.installmentTotal}` : null;
    const prefix = isAnticipated ? (installment ? `${installment} antecipada` : 'Parcela antecipada') : installment;
    return { entry, label, prefix };
  });
  const normalizedPurchaseQuery = purchaseQuery.trim().toLocaleLowerCase('pt-BR');
  const isSearchingPurchases = purchaseSearchOpen && normalizedPurchaseQuery.length > 0;
  const filteredPurchaseRows = isSearchingPurchases
    ? purchaseRows.filter((row) => row.label.toLocaleLowerCase('pt-BR').includes(normalizedPurchaseQuery))
    : purchaseRows;
  // Buscando, mostra todo mundo que bateu (a pessoa já filtrou pelo que queria ver).
  // Sem busca, respeita o colapso — "ver todas" existe justamente pra não repetir isso.
  const visiblePurchaseRows =
    isSearchingPurchases || showAllPurchases ? filteredPurchaseRows : filteredPurchaseRows.slice(0, PURCHASES_COLLAPSE_THRESHOLD);

  // Números do resumo (hero) descontando o par antecipado/anulado — senão "Compras: R$300"
  // ficaria contradizendo a lista logo abaixo, que não mostra mais essa parcela.
  const hiddenPurchaseCents =
    invoice?.ledgerEntries.filter((e) => e.type === 'purchase' && hiddenEntryIds.has(e.id)).reduce((s, e) => s + e.amountCents, 0) ?? 0;
  // 'purchase_reversal' entra aqui de propósito: é o estorno de uma compra excluída no
  // Extrato (reverseCardPurchaseOnDelete) — soma em `creditsTotalCents` igual a uma
  // antecipação, e sem contar aqui o par escondido ficava com "Créditos" inflado pra sempre.
  const hiddenCreditCents =
    invoice?.ledgerEntries
      .filter(
        (e) => (e.type === 'installment_anticipation_credit' || e.type === 'purchase_reversal') && hiddenEntryIds.has(e.id)
      )
      .reduce((s, e) => s + e.amountCents, 0) ?? 0;
  const displayPurchasesTotalCents = (invoice?.purchasesTotalCents ?? 0) - hiddenPurchaseCents;
  const displayCreditsTotalCents = (invoice?.creditsTotalCents ?? 0) - hiddenCreditCents;
  const hasVisibleBreakdown =
    displayPurchasesTotalCents > 0 ||
    displayCreditsTotalCents > 0 ||
    (invoice?.feesTotalCents ?? 0) > 0 ||
    (invoice?.paymentsTotalCents ?? 0) > 0;

  return (
    <section className="page-content page-content--narrow invoice-page">
      <div className="page-heading-row page-heading-row--icon-trailing">
        <div>
          <p className="eyebrow">Fatura · {card?.name ?? ''}</p>
          <h1 className="page-title">{invoice ? formatFriendlyMonth(invoice.referenceMonth) : 'Carregando…'}</h1>
        </div>
        <Link className="icon-button" to={`/app/cards/${cardId ?? ''}`} aria-label="Voltar ao cartão">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      </div>

      <FormMessage>{message}</FormMessage>

      {invoice ? (
        <>
          {/* Hero */}
          <div className="invoice-hero">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
                  {isPaid ? 'Fatura paga' : 'Valor a pagar'}
                </p>
                <span className="invoice-hero-amount">
                  {formatMoney(invoice.outstandingBalanceCents)}
                </span>
                <p className="text-secondary" style={{ marginTop: '0.35rem', fontSize: '0.86rem' }}>
                  Vence {formatFriendlyDate(invoice.dueDate)}
                  {isOpen ? ' · fatura ainda aberta' : ''}
                </p>
              </div>
              <span className={`sync-badge sync-badge--${statusBadgeVariant(invoice.status)}`}>{invoiceStatusLabels[invoice.status]}</span>
            </div>

            {hasVisibleBreakdown && (
            <div className="invoice-breakdown">
              {displayPurchasesTotalCents > 0 && (
                <span>Compras<strong>{formatMoney(displayPurchasesTotalCents)}</strong></span>
              )}
              {displayCreditsTotalCents > 0 && (
                <span>Créditos<strong className="amount--income">− {formatMoney(displayCreditsTotalCents)}</strong></span>
              )}
              {invoice.feesTotalCents > 0 && (
                <span>Juros/tarifas<strong className="amount--expense">+ {formatMoney(invoice.feesTotalCents)}</strong></span>
              )}
              {invoice.paymentsTotalCents > 0 && (
                <span>Pagamentos<strong className="amount--income">− {formatMoney(invoice.paymentsTotalCents)}</strong></span>
              )}
            </div>
            )}

            {!isPaid && (
              <>
                <button className="button button--invoice-cta" type="button" onClick={handleOpenPaySheet}>
                  {isOpen ? 'Antecipar fatura (pagar antes de fechar)' : 'Pagar fatura'}
                </button>
                {isOpen && (
                  <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
                    Antecipar a fatura é quitar este ciclo antes do fechamento — o valor sai da conta que você escolher e o
                    limite é liberado na hora. Diferente de <strong>antecipar parcela</strong>, que traz uma parcela de um mês
                    futuro pra cá.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Compras desta fatura */}
          <article className="surface surface-pad">
            <div className="section-heading">
              <p className="eyebrow" style={{ margin: 0 }}>Compras</p>
              {purchases.length > PURCHASES_SEARCH_THRESHOLD && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={purchaseSearchOpen ? 'Fechar busca' : 'Buscar compra por nome'}
                  onClick={() => {
                    setPurchaseSearchOpen((v) => !v);
                    setPurchaseQuery('');
                  }}
                >
                  <Search size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {purchaseSearchOpen && (
              <input
                className="input"
                type="text"
                value={purchaseQuery}
                onChange={(e) => setPurchaseQuery(e.target.value)}
                placeholder="Buscar por nome..."
                autoFocus
                style={{ marginBottom: '0.75rem' }}
              />
            )}
            {visiblePurchaseRows.length > 0 ? (
              <div className="item-list">
                {visiblePurchaseRows.map(({ entry, label, prefix }) => (
                  <div className="list-row" key={entry.id}>
                    <div>
                      <strong>{label}</strong>
                      <span className="text-secondary">
                        {prefix ? `${prefix} · ` : ''}
                        {formatFriendlyDate(entry.effectiveAt)}
                      </span>
                    </div>
                    <strong className="amount--expense">{formatMoney(entry.amountCents)}</strong>
                  </div>
                ))}
              </div>
            ) : isSearchingPurchases ? (
              <p className="text-secondary">Nenhuma compra encontrada para "{purchaseQuery.trim()}".</p>
            ) : hiddenEntryIds.size > 0 ? (
              <p className="text-secondary">A parcela que caía aqui foi antecipada pra uma fatura anterior.</p>
            ) : (
              <EmptyState illustration="cards" title="Nenhuma compra nesta fatura ainda." compact />
            )}
            {!isSearchingPurchases && filteredPurchaseRows.length > PURCHASES_COLLAPSE_THRESHOLD && (
              <button type="button" className="list-toggle" onClick={() => setShowAllPurchases((v) => !v)}>
                {showAllPurchases ? (
                  <>Ver menos <ChevronUp size={14} aria-hidden="true" /></>
                ) : (
                  <>Ver todas as {filteredPurchaseRows.length} compras <ChevronDown size={14} aria-hidden="true" /></>
                )}
              </button>
            )}
          </article>

          {/* Pagamentos registrados */}
          {payments.length > 0 && (
            <article className="surface surface-pad">
              <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Pagamentos</p>
              <div className="item-list">
                {payments.map((entry) => (
                  <div className="list-row" key={entry.id}>
                    <div>
                      <strong>{ledgerTypeLabels[entry.type as InvoiceLedgerEntryType]}</strong>
                      <span className="text-secondary">{formatFriendlyDate(entry.effectiveAt)}</span>
                    </div>
                    <strong className="amount--income">− {formatMoney(entry.amountCents)}</strong>
                  </div>
                ))}
              </div>
            </article>
          )}

          {/* Ações avançadas — antecipar só faz sentido na fatura que ainda acumula
              compras. Numa fatura fechada ou paga, o débito da antecipação entraria
              num ciclo que já terminou. */}
          {isOpen && (
          <details className="advanced-panel">
            <summary>Antecipar parcelas de faturas futuras</summary>
            <div className="form-stack" style={{ marginTop: '0.75rem' }}>
              <div className="anticipation-explain">
                <strong>O que é antecipar?</strong>
                Traz as <strong>últimas</strong> parcelas de uma compra para esta fatura — pagando adiantado da última pra trás, como no cartão. O valor entra aqui e sai das faturas futuras; o total devido não muda.
              </div>
              {anticipatableGroups.length === 0 ? (
                <p className="text-secondary" style={{ fontSize: '0.86rem' }}>Nenhuma parcela futura disponível.</p>
              ) : (
                <>
                  {anticipatableGroups.map((group) => {
                    const available = group.installments.length;
                    const count = anticipateCounts[group.sourceTransactionId] ?? 0;
                    const selected = group.installments.slice(0, count);
                    const groupTotal = selected.reduce((s, inst) => s + inst.amountCents, 0);
                    // A "próxima a antecipar" é a última ainda não marcada.
                    const nextToAnticipate = group.installments[count];
                    const parcelaLabel = (n?: number) =>
                      n && group.installmentTotal ? `parcela ${n}/${group.installmentTotal}` : null;

                    return (
                      <div key={group.sourceTransactionId} className="anticipation-group">
                        <div className="anticipation-group-head">
                          <strong className="anticipation-group-name">{group.description}</strong>
                          <span className="text-secondary" style={{ fontSize: '0.82rem' }}>
                            {available} {available === 1 ? 'parcela futura' : 'parcelas futuras'}
                          </span>
                        </div>
                        <div className="anticipation-stepper">
                          <button
                            className="anticipation-step-btn"
                            type="button"
                            aria-label="Antecipar menos"
                            disabled={count === 0}
                            onClick={() =>
                              setAnticipateCounts((prev) => ({
                                ...prev,
                                [group.sourceTransactionId]: Math.max(0, (prev[group.sourceTransactionId] ?? 0) - 1)
                              }))
                            }
                          >
                            −
                          </button>
                          <span className="anticipation-step-value">
                            {count === 0
                              ? 'Nenhuma'
                              : `${count} ${count === 1 ? 'última' : 'últimas'}`}
                          </span>
                          <button
                            className="anticipation-step-btn"
                            type="button"
                            aria-label="Antecipar mais"
                            disabled={count >= available}
                            onClick={() =>
                              setAnticipateCounts((prev) => ({
                                ...prev,
                                [group.sourceTransactionId]: Math.min(available, (prev[group.sourceTransactionId] ?? 0) + 1)
                              }))
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="text-muted anticipation-group-hint">
                          {count === 0
                            ? nextToAnticipate
                              ? `Próxima a antecipar: ${parcelaLabel(nextToAnticipate.installmentNumber) ?? `fatura ${formatFriendlyMonth(nextToAnticipate.referenceMonth)}`}`
                              : ''
                            : `${parcelaLabel(selected[selected.length - 1].installmentNumber) ?? `fatura ${formatFriendlyMonth(selected[selected.length - 1].referenceMonth)}`} até ${parcelaLabel(selected[0].installmentNumber) ?? `fatura ${formatFriendlyMonth(selected[0].referenceMonth)}`} · ${formatMoney(groupTotal)}`}
                        </span>
                      </div>
                    );
                  })}
                  {anticipateTotalCents > 0 && (
                    <div className="anticipation-confirm-row">
                      <span className="text-secondary" style={{ fontSize: '0.86rem' }}>
                        Total: <strong>{formatMoney(anticipateTotalCents)}</strong>
                      </span>
                      <button className="button button--secondary" type="button" onClick={() => void handleAnticipation()}>
                        Confirmar antecipação
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
          )}

          <details className="advanced-panel">
            <summary>Estornos, créditos e tarifas</summary>
            <div className="form-stack" style={{ marginTop: '0.75rem' }}>
              <form className="form-stack" onSubmit={handleCredit}>
                <p className="eyebrow">Crédito / estorno</p>
                <SelectField
                  label="Tipo"
                  value={creditType}
                  onChange={(v) => setCreditType(v as typeof creditType)}
                  options={[
                    { value: 'refund_credit', label: 'Estorno de compra' },
                    { value: 'chargeback_credit', label: 'Chargeback' },
                    { value: 'manual_credit', label: 'Crédito manual' }
                  ]}
                />
                <input className="input" inputMode="decimal" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">Registrar crédito</button>
              </form>
              <form className="form-stack" onSubmit={handleFee} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                <p className="eyebrow">Tarifa / juros</p>
                <SelectField
                  label="Tipo"
                  value={feeType}
                  onChange={(v) => setFeeType(v as typeof feeType)}
                  options={[
                    { value: 'fee', label: 'Tarifa da operadora' },
                    { value: 'interest', label: 'Juros por atraso' },
                    { value: 'fine', label: 'Multa' },
                    { value: 'iof', label: 'IOF' },
                    { value: 'manual_debit', label: 'Débito manual' }
                  ]}
                />
                <input className="input" inputMode="decimal" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">Registrar tarifa</button>
              </form>
            </div>
          </details>
        </>
      ) : null}

      {/* BottomSheet de pagamento */}
      <BottomSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        title={isOpen ? 'Antecipar fatura' : 'Pagar fatura'}
        subtitle={invoice ? `${formatFriendlyMonth(invoice.referenceMonth)} · ${formatMoney(invoice.outstandingBalanceCents)} em aberto` : undefined}
      >
        <div className="form-stack">
          <label className="field">
            <span>Valor a pagar</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={invoice ? formatMoney(invoice.outstandingBalanceCents) : '0,00'}
              autoFocus
            />
            <span className="field-hint">Deixe em branco para pagar o total.</span>
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
          <label className="field">
            <span>Data do pagamento</span>
            <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </label>
          {isOpen && (
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
              Fatura ainda aberta — pagamentos antes do fechamento liberam limite imediatamente.
            </p>
          )}
          <div className="sheet-actions">
            <button className="button button--primary" type="button" disabled={!payAccountId} onClick={handlePay}>
              Confirmar pagamento
            </button>
          </div>
        </div>
      </BottomSheet>
      {confirmDialog}
    </section>
  );
}
