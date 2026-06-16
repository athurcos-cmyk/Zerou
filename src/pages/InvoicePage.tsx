import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ReceiptText } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels, ledgerTypeLabels } from '../cards/cardLabels';
import {
  anticipateInstallments,
  closeInvoice,
  reconcileInvoice,
  recordInvoiceCredit,
  recordInvoiceFee,
  recordInvoicePayment
} from '../cards/cardService';
import { useCardsData } from '../cards/useCardsData';
import { fromDateInputValue, todayInputValue, toDateInputValue } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { useFinanceData } from '../finance/useFinanceData';
import type { InvoiceLedgerEntryType, InvoiceStatus } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function InvoicePage() {
  const { cardId, invoiceId } = useParams();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsData(workspaceId);
  const finance = useFinanceData(workspaceId, user?.uid);
  const card = cardsData.cards.find((item) => item.id === cardId);
  const invoice = cardsData.invoices.find((item) => item.cardId === cardId && item.id === invoiceId);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayInputValue());
  const [creditAmount, setCreditAmount] = useState('');
  const [creditType, setCreditType] = useState<'refund_credit' | 'chargeback_credit' | 'manual_credit'>('refund_credit');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeType, setFeeType] = useState<'interest' | 'fine' | 'iof' | 'fee' | 'manual_debit'>('fee');
  const [anticipationAmount, setAnticipationAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function guardAction(action: () => Promise<unknown>) {
    setMessage(null);

    if (!workspaceId || !user || !cardId || !invoiceId) {
      setMessage('Não foi possível localizar a fatura.');
      return;
    }

    try {
      await action();
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível concluir a ação agora.'));
    }
  }

  function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void guardAction(async () => {
      await recordInvoicePayment(workspaceId!, user!.uid, {
        cardId: cardId!,
        invoiceId: invoiceId!,
        accountId: paymentAccountId,
        amountCents: parseMoneyToCents(paymentAmount),
        paidAt: fromDateInputValue(paymentDate),
        advance: invoice?.status === 'open'
      });
      setPaymentAmount('');
      setPaymentAccountId('');
      setPaymentDate(todayInputValue());
    });
  }

  function handleCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void guardAction(async () => {
      await recordInvoiceCredit(workspaceId!, user!.uid, {
        cardId: cardId!,
        invoiceId: invoiceId!,
        type: creditType,
        amountCents: parseMoneyToCents(creditAmount),
        effectiveAt: new Date(),
        description: ledgerTypeLabels[creditType]
      });
      setCreditAmount('');
    });
  }

  function handleFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void guardAction(async () => {
      await recordInvoiceFee(workspaceId!, user!.uid, {
        cardId: cardId!,
        invoiceId: invoiceId!,
        type: feeType,
        amountCents: parseMoneyToCents(feeAmount),
        effectiveAt: new Date(),
        description: ledgerTypeLabels[feeType]
      });
      setFeeAmount('');
    });
  }

  function handleAnticipation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void guardAction(async () => {
      await anticipateInstallments(workspaceId!, user!.uid, {
        cardId: cardId!,
        invoiceId: invoiceId!,
        amountCents: parseMoneyToCents(anticipationAmount),
        effectiveAt: new Date(),
        installmentGroupId: `manual-${invoiceId}`
      });
      setAnticipationAmount('');
    });
  }

  function handleReconcile(status: InvoiceStatus) {
    void guardAction(() => reconcileInvoice(workspaceId!, { cardId: cardId!, invoiceId: invoiceId!, status: status as 'closed' | 'partial' | 'paid' | 'overpaid' }));
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

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Fatura · {card?.name ?? ''}</p>
          <h1 className="page-title">{invoice ? `Fatura ${invoice.referenceMonth}` : 'Carregando fatura'}</h1>
        </div>
        <Link className="button button--secondary" to={`/app/cards/${cardId ?? ''}`}>
          Voltar ao cartão
        </Link>
      </div>

      <FormMessage>{message}</FormMessage>

      {invoice ? (
        <>
          {/* Hero: valor principal em destaque */}
          <div className="invoice-hero">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
                  {isPaid ? 'Fatura paga' : 'Valor a pagar'}
                </p>
                <span className={`invoice-hero-amount ${isPaid ? 'amount--income' : 'amount--expense'}`}>
                  {formatMoney(invoice.outstandingBalanceCents)}
                </span>
              </div>
              <span className="sync-badge sync-badge--synced">{invoiceStatusLabels[invoice.status]}</span>
            </div>
            <div className="invoice-hero-meta">
              <span>Vence {toDateInputValue(invoice.dueDate)}</span>
              {isOpen && <span>· Fatura ainda em aberto — novos lançamentos entram aqui.</span>}
            </div>

            {/* Detalhamento secundário */}
            <div className="invoice-breakdown">
              <span>
                Compras
                <strong>{formatMoney(invoice.purchasesTotalCents)}</strong>
              </span>
              {invoice.creditsTotalCents > 0 && (
                <span>
                  Créditos
                  <strong className="amount--income">− {formatMoney(invoice.creditsTotalCents)}</strong>
                </span>
              )}
              {invoice.feesTotalCents > 0 && (
                <span>
                  Juros / tarifas
                  <strong className="amount--expense">+ {formatMoney(invoice.feesTotalCents)}</strong>
                </span>
              )}
              {invoice.paymentsTotalCents > 0 && (
                <span>
                  Pagamentos
                  <strong className="amount--income">− {formatMoney(invoice.paymentsTotalCents)}</strong>
                </span>
              )}
              {invoice.overpaidCreditCents > 0 && (
                <span>
                  Crédito sobrando
                  <strong className="amount--income">{formatMoney(invoice.overpaidCreditCents)}</strong>
                </span>
              )}
            </div>

            {/* Ações de status — secundárias */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
              {!isPaid && (
                <button
                  className="button button--subtle button--compact"
                  type="button"
                  onClick={() => void guardAction(() => closeInvoice(workspaceId!, cardId!, invoiceId!))}
                >
                  Fechar fatura
                </button>
              )}
              <button
                className="button button--subtle button--compact"
                type="button"
                onClick={() => handleReconcile(invoice.overpaidCreditCents > 0 ? 'overpaid' : invoice.outstandingBalanceCents === 0 ? 'paid' : 'partial')}
              >
                <CheckCircle2 size={16} aria-hidden="true" /> Conciliar manualmente
              </button>
            </div>
          </div>

          <div className="finance-grid">
            <div className="form-stack">
              {/* Formulário de pagamento — destaque principal */}
              <form className="surface surface-pad form-stack" onSubmit={handlePayment}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Pagar fatura</p>
                    <h2>Registrar pagamento</h2>
                  </div>
                </div>
                <p className="text-secondary" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.55 }}>
                  Pode pagar o valor completo ou parcial. O saldo restante fica pendente na fatura.
                </p>
                <label className="field">
                  <span>Valor do pagamento</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder={invoice.outstandingBalanceCents > 0 ? formatMoney(invoice.outstandingBalanceCents).replace('R$ ', '') : '0,00'}
                  />
                </label>
                <div className="field">
                  <span className="field-label">Pagar com qual conta?</span>
                  <CustomSelect
                    value={paymentAccountId}
                    onChange={setPaymentAccountId}
                    options={finance.accounts.map((a) => ({ value: a.id, label: a.name }))}
                    placeholder="Escolha uma conta"
                  />
                </div>
                <label className="field">
                  <span>Data do pagamento</span>
                  <input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                </label>
                <button className="button button--primary" type="submit">
                  Registrar pagamento
                </button>
              </form>

              {/* Antecipar parcelas — com explicação */}
              <details className="advanced-panel">
                <summary>Antecipar parcelas de outra fatura</summary>
                <div className="form-stack" style={{ marginTop: '0.75rem' }}>
                  <div className="anticipation-explain">
                    <strong>O que é antecipar parcelas?</strong>
                    Quando você tem uma compra parcelada em faturas futuras, pode trazer as parcelas para esta fatura e pagar tudo agora.
                    Útil para liberar limite ou quitar tudo de uma vez antes do vencimento.
                  </div>
                  <form className="form-stack" onSubmit={handleAnticipation}>
                    <label className="field">
                      <span>Valor a antecipar</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={anticipationAmount}
                        onChange={(event) => setAnticipationAmount(event.target.value)}
                        placeholder="0,00"
                      />
                    </label>
                    <button className="button button--secondary" type="submit">
                      Confirmar antecipação
                    </button>
                  </form>
                </div>
              </details>

              {/* Créditos e tarifas — ações avançadas */}
              <details className="advanced-panel">
                <summary>Créditos e tarifas</summary>
                <div className="form-stack" style={{ marginTop: '0.75rem' }}>
                  <p className="text-secondary" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.55 }}>
                    Para estornos, chargebacks, juros ou tarifas da operadora.
                  </p>
                  <form className="form-stack" onSubmit={handleCredit}>
                    <p className="eyebrow">Crédito / estorno</p>
                    <CustomSelect
                      value={creditType}
                      onChange={(v) => setCreditType(v as typeof creditType)}
                      options={[
                        { value: 'refund_credit', label: 'Estorno de compra' },
                        { value: 'chargeback_credit', label: 'Chargeback' },
                        { value: 'manual_credit', label: 'Crédito manual' }
                      ]}
                    />
                    <input className="input" inputMode="decimal" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} placeholder="0,00" />
                    <button className="button button--secondary" type="submit">
                      Registrar crédito
                    </button>
                  </form>
                  <form className="form-stack" onSubmit={handleFee} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                    <p className="eyebrow">Tarifa / juros</p>
                    <CustomSelect
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
                    <input className="input" inputMode="decimal" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} placeholder="0,00" />
                    <button className="button button--secondary" type="submit">
                      Registrar tarifa
                    </button>
                  </form>
                </div>
              </details>
            </div>

            <article className="surface surface-pad">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Histórico</p>
                  <h2>Movimentos da fatura</h2>
                </div>
                <ReceiptText size={22} aria-hidden="true" />
              </div>
              {invoice.ledgerEntries.length > 0 ? (
                <div className="item-list">
                  {invoice.ledgerEntries.map((entry) => {
                    const isCredit = entry.type.includes('credit');
                    const isPurchase = entry.type === 'purchase';
                    const amountClass = isCredit ? 'amount--income' : isPurchase || entry.type.includes('fee') || entry.type === 'interest' || entry.type === 'fine' || entry.type === 'iof' || entry.type === 'manual_debit' ? 'amount--expense' : '';
                    return (
                      <div className="list-row" key={entry.id}>
                        <div>
                          <strong>{ledgerTypeLabels[entry.type as InvoiceLedgerEntryType]}</strong>
                          <span className="text-secondary">
                            {toDateInputValue(entry.effectiveAt)}
                          </span>
                        </div>
                        <strong className={amountClass}>
                          {isCredit ? '−' : isPurchase ? '' : '+'}{formatMoney(entry.amountCents)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-secondary">Nenhum movimento nesta fatura ainda.</p>
              )}
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
