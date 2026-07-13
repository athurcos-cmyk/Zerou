import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, CreditCard, Layers, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { OngoingInstallmentsSheet } from '../cards/OngoingInstallmentsSheet';
import { invoiceHasVisibleActivity } from '../cards/anticipation';
import { useConfirm } from '../components/ConfirmDialog';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels } from '../cards/cardLabels';
import { deleteCard, recordInvoicePayment } from '../cards/cardService';
import { pickCurrentInvoice } from '../cards/cardDates';

import { formatFriendlyDate } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';

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
  // Uma fatura futura cuja única parcela foi antecipada pra cá some do histórico — igual sumiu
  // da própria tela dela (`anticipatedAwayEntryIds`). Se uma compra nova cair nela depois, ela
  // deixa de ficar vazia e reaparece sozinha (não é um estado gravado, é sempre recalculado).
  const visibleInvoices = invoices.filter((invoice) => invoiceHasVisibleActivity(invoice.ledgerEntries));
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [ongoingSheetOpen, setOngoingSheetOpen] = useState(false);

  // Destaque pra trazer compras existentes: logo após criar o cartão (`?novo=1`) ou
  // enquanto ele ainda não tem nenhuma compra lançada.
  const [searchParams] = useSearchParams();
  const showOnboardingCallout = searchParams.get('novo') === '1' || invoices.length === 0;

  function handleOpenPaySheet() {
    setPayAmount('');
    setPayAccountId('');
    setPaySheetOpen(true);
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
    if (!workspaceId || !user || !card || !openInvoice || !payAccountId) return;
    const cents = payAmount.trim() ? parseMoneyToCents(payAmount) : openInvoice.outstandingBalanceCents;
    if (!cents) return;
    setPaySheetOpen(false);
    setPayAmount('');
    setPayAccountId('');
    recordInvoicePayment(workspaceId, user.uid, {
      cardId: card.id,
      invoiceId: openInvoice.id,
      accountId: payAccountId,
      amountCents: cents,
      paidAt: new Date(),
      advance: openInvoice.status === 'open'
    }).catch((err) => setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o pagamento.')));
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

  const activeInvoices = card
    ? cardsData.invoices.filter((invoice) => invoice.cardId === card.id && (invoice.status === 'open' || invoice.status === 'closed'))
    : [];
  const openInvoice = pickCurrentInvoice(activeInvoices);
  const usedCents = activeInvoices.reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
  const availableCents = card ? Math.max(0, card.limitCents - usedCents) : 0;
  const usedPercent = card && card.limitCents > 0 ? Math.min(100, Math.round((usedCents / card.limitCents) * 100)) : 0;
  const barClass =
    usedPercent >= 90 ? 'card-limit-bar-fill--danger' :
    usedPercent >= 70 ? 'card-limit-bar-fill--warning' : '';

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
          <button className="button button--ghost" type="button" onClick={() => void handleDeleteCard()} aria-label="Excluir cartão">
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {card ? (
        <>
          <div className="surface surface-pad card-limit-block">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Limite disponível</p>
                <span className="card-limit-available">{formatMoney(availableCents)}</span>
                <span className="text-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.86rem' }}>de {formatMoney(card.limitCents)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {/* `usedCents` soma TODAS as faturas em aberto/fechadas (inclusive parcelas
                    de meses futuros), não só a fatura atual — chamar isso de "fatura em
                    aberto" fazia o número não bater com a fatura logo abaixo. */}
                <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Limite usado</p>
                <span className="card-limit-available amount--expense">{formatMoney(usedCents)}</span>
              </div>
            </div>
            <div className="card-limit-bar-track" aria-label={`${usedPercent}% do limite usado`}>
              <div className={`card-limit-bar-fill ${barClass}`} style={{ width: `${Math.max(2, usedPercent)}%` }} />
            </div>
            {usedPercent >= 70 && (
              <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
                {usedPercent >= 90 ? 'Limite quase esgotado.' : 'Mais de 70% do limite em uso.'}
              </p>
            )}
          </div>

          {openInvoice ? (
            <div className="surface surface-pad" style={{ borderRadius: '1rem', display: 'grid', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p className="eyebrow" style={{ marginBottom: '0.15rem' }}>Fatura atual</p>
                  <strong style={{ fontSize: '1.1rem', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                    <span className={openInvoice.outstandingBalanceCents > 0 ? 'amount--expense' : 'amount--income'}>
                      {formatMoney(openInvoice.outstandingBalanceCents)}
                    </span>
                  </strong>
                  <span className="text-secondary">
                    {openInvoice.referenceMonth} · {openInvoice.status === 'open' ? 'em aberto' : 'fechada'} · vence {formatFriendlyDate(openInvoice.dueDate)}
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

      <FormMessage>{message}</FormMessage>

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
      ) : card ? (
        <button className="button button--subtle button--block" type="button" onClick={() => setOngoingSheetOpen(true)}>
          <Layers size={17} aria-hidden="true" /> Lançar compra parcelada que já começou
        </button>
      ) : null}

      <article className="surface surface-pad">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Faturas</p>
            <h2>Histórico de faturas</h2>
          </div>
          <CalendarClock size={22} aria-hidden="true" />
        </div>
        {visibleInvoices.length > 0 ? (
          <div className="item-list">
            {visibleInvoices.map((invoice) => {
              const isPaid = invoice.status === 'paid' || invoice.status === 'overpaid';
              return (
                <Link className="list-row list-row--link" key={invoice.id} to={`/app/cards/${invoice.cardId}/invoices/${invoice.id}`}>
                  <div>
                    <strong>Fatura {invoice.referenceMonth}</strong>
                    <span className="text-secondary">
                      {invoiceStatusLabels[invoice.status]} · vence {formatFriendlyDate(invoice.dueDate)}
                    </span>
                  </div>
                  <div className="list-row-end">
                    <strong className={isPaid ? 'amount--income' : invoice.outstandingBalanceCents > 0 ? 'amount--expense' : ''}>
                      {formatMoney(invoice.outstandingBalanceCents)}
                    </strong>
                    {isPaid && (
                      <span className="sync-badge sync-badge--synced">Paga</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-copy">
            <span className="empty-icon">
              <CreditCard size={24} aria-hidden="true" />
            </span>
            <p className="text-secondary">Nenhuma fatura ainda. Lance a primeira compra em Despesas.</p>
          </div>
        )}
      </article>

      {confirmDialog}
      <BottomSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        title="Pagar fatura"
        subtitle={openInvoice ? `${openInvoice.referenceMonth} · ${formatMoney(openInvoice.outstandingBalanceCents)} em aberto` : undefined}
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
          <div className="sheet-actions">
            <button
              className="button button--primary"
              type="button"
              disabled={!payAccountId}
              onClick={handleQuickPay}
            >
              Confirmar pagamento
            </button>
          </div>
        </div>
      </BottomSheet>

      {card ? (
        <OngoingInstallmentsSheet
          open={ongoingSheetOpen}
          workspaceId={workspaceId}
          userId={user?.uid}
          cardId={card.id}
          onClose={() => setOngoingSheetOpen(false)}
        />
      ) : null}
    </section>
  );
}
