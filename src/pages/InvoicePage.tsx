import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, ReceiptText } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
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
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a ação agora.');
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
          Voltar
        </Link>
      </section>
    );
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Fatura</p>
          <h1 className="page-title">{invoice ? `Fatura ${invoice.referenceMonth}` : 'Carregando fatura'}</h1>
          <p className="page-description">
            {card ? `${card.name}. Compras, pagamentos, créditos e tarifas calculados pelo ledger.` : 'Carregando cartão.'}
          </p>
        </div>
        <Link className="button button--secondary" to={`/app/cards/${cardId ?? ''}`}>
          Voltar ao cartão
        </Link>
      </div>

      <FormMessage>{message}</FormMessage>

      {invoice ? (
        <>
          <div className="metric-grid">
            <Metric title="Compras" value={invoice.purchasesTotalCents} />
            <Metric title="Pagamentos" value={invoice.paymentsTotalCents} />
            <Metric title="Créditos" value={invoice.creditsTotalCents} />
            <Metric title="Tarifas" value={invoice.feesTotalCents} />
            <Metric title="Saldo pendente" value={invoice.outstandingBalanceCents} />
            <Metric title="Crédito excedente" value={invoice.overpaidCreditCents} />
          </div>

          <div className="quick-actions">
            <button className="button button--secondary" type="button" onClick={() => void guardAction(() => closeInvoice(workspaceId!, cardId!, invoiceId!))}>
              Fechar fatura
            </button>
            <button className="button button--subtle" type="button" onClick={() => handleReconcile(invoice.overpaidCreditCents > 0 ? 'overpaid' : invoice.outstandingBalanceCents === 0 ? 'paid' : 'partial')}>
              <CheckCircle2 size={18} aria-hidden="true" /> Conciliar
            </button>
            <span className="sync-badge sync-badge--synced">{invoiceStatusLabels[invoice.status]}</span>
          </div>

          <div className="finance-grid">
            <div className="form-stack">
              <form className="surface surface-pad form-stack" onSubmit={handlePayment}>
                <p className="eyebrow">Pagamento</p>
                <label className="field">
                  <span>Valor</span>
                  <input className="input" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0,00" />
                </label>
                <label className="field">
                  <span>Conta de pagamento</span>
                  <select className="select" value={paymentAccountId} onChange={(event) => setPaymentAccountId(event.target.value)}>
                    <option value="">Escolha uma conta</option>
                    {finance.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Data</span>
                  <input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                </label>
                <button className="button button--primary" type="submit">
                  Registrar pagamento
                </button>
              </form>

              <form className="surface surface-pad form-stack" onSubmit={handleCredit}>
                <p className="eyebrow">Crédito</p>
                <select className="select" value={creditType} onChange={(event) => setCreditType(event.target.value as typeof creditType)}>
                  <option value="refund_credit">Estorno</option>
                  <option value="chargeback_credit">Chargeback</option>
                  <option value="manual_credit">Crédito manual</option>
                </select>
                <input className="input" inputMode="decimal" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">
                  Registrar crédito
                </button>
              </form>

              <form className="surface surface-pad form-stack" onSubmit={handleFee}>
                <p className="eyebrow">Tarifa</p>
                <select className="select" value={feeType} onChange={(event) => setFeeType(event.target.value as typeof feeType)}>
                  <option value="fee">Tarifa</option>
                  <option value="interest">Juros</option>
                  <option value="fine">Multa</option>
                  <option value="iof">IOF</option>
                  <option value="manual_debit">Débito manual</option>
                </select>
                <input className="input" inputMode="decimal" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">
                  Registrar tarifa
                </button>
              </form>

              <form className="surface surface-pad form-stack" onSubmit={handleAnticipation}>
                <p className="eyebrow">Antecipar parcelas</p>
                <input className="input" inputMode="decimal" value={anticipationAmount} onChange={(event) => setAnticipationAmount(event.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">
                  Antecipar
                </button>
              </form>
            </div>

            <article className="surface surface-pad">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Ledger</p>
                  <h2>Timeline imutável</h2>
                </div>
                <ReceiptText size={22} aria-hidden="true" />
              </div>
              {invoice.ledgerEntries.length > 0 ? (
                <div className="item-list">
                  {invoice.ledgerEntries.map((entry) => (
                    <div className="list-row" key={entry.id}>
                      <div>
                        <strong>{ledgerTypeLabels[entry.type as InvoiceLedgerEntryType]}</strong>
                        <span className="text-secondary">
                          {toDateInputValue(entry.effectiveAt)} · {entry.idempotencyKey}
                        </span>
                      </div>
                      <strong>{formatMoney(entry.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-secondary">Nenhuma entrada de ledger ainda.</p>
              )}
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <article className="surface surface-pad metric-card">
      <p className="eyebrow">{title}</p>
      <strong>{formatMoney(value)}</strong>
    </article>
  );
}
