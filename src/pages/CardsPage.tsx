import { useState, type CSSProperties, type FormEvent } from 'react';
import { CreditCard, Plus, WifiOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { cardBrandOptions, type CreateCreditCardInput } from '../cards/cardSchemas';
import { createCreditCard } from '../cards/cardService';
import { hasPendingCardLedgerActivity } from '../finance/financeCalculations';
import { pickCurrentInvoice } from '../cards/cardDates';

import { formatFriendlyDate, formatFriendlyMonth } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function CardsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsContext();
  const finance = useFinanceContext();
  // "Disponível" de cada cartão soma o total da fatura que só a Cloud Function atualiza —
  // ela não roda offline. Ver comentário completo em hasPendingCardLedgerActivity.
  const hasPendingCardActivity = hasPendingCardLedgerActivity(finance.transactions);
  const [name, setName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [brand, setBrand] = useState<CreateCreditCardInput['brand']>('Visa');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState(10);
  const [dueDay, setDueDay] = useState(20);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Faixa de resumo: os mesmos dois números que cada card já mostra, somados. Sem isso a
  // pessoa com 3 cartões precisa somar de cabeça pra saber quanto deve no mês.
  let totalLimitCents = 0;
  let totalUsedCents = 0;
  for (const card of cardsData.cards) {
    const active = cardsData.invoices.filter(
      (invoice) => invoice.cardId === card.id && (invoice.status === 'open' || invoice.status === 'closed')
    );
    totalLimitCents += card.limitCents;
    totalUsedCents += active.reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
  }
  const totalAvailableCents = Math.max(0, totalLimitCents - totalUsedCents);

  function openCreateSheet() {
    setMessage(null);
    setFormOpen(true);
  }

  function closeCreateSheet() {
    setFormOpen(false);
    setMessage(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar cartões.');
      return;
    }

    // Vai direto pra página do cartão recém-criado: é lá que a pessoa traz as compras que
    // já existem (parcelas em andamento / compras futuras). A maioria já chega com parcelas
    // no cartão, então esconder isso num segundo passo confundia. `createCreditCard` devolve
    // o id na hora (o write é fire-and-forget), então dá pra navegar imediatamente.
    createCreditCard(workspaceId, user.uid, {
      name,
      lastFour,
      brand,
      limitCents: parseMoneyToCents(limit),
      closingDay,
      dueDay,
      colorToken: 'chart-1'
    })
      .then((id) => navigate(`/app/cards/${id}?novo=1`))
      .catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o cartão agora.')));
    setName('');
    setLastFour('');
    setBrand('Visa');
    setLimit('');
    setClosingDay(10);
    setDueDay(20);
    setFormOpen(false);
  }

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Pessoal</p>
          <h1 className="page-title page-title--compact">Cartões</h1>
        </div>
        <div className="page-heading-actions">
          <button className="button button--subtle page-action-button" type="button" onClick={openCreateSheet}>
            <Plus size={15} aria-hidden="true" /> Novo cartão
          </button>
          <SyncStatusBadge status={cardsData.pendingWrites ? 'pending' : 'synced'} />
        </div>
      </div>

      {/* `--plain` e não gradiente: cada card da lista abaixo já é um `.card-list-hero`
          com `--gradient-slate`. Ver a regra em global.css (.summary-hero--plain).
          Só a partir de DOIS cartões: com um só, a faixa repetia dígito por dígito os
          números do próprio card logo abaixo (visto ao vivo, 02/08/2026) — resumo de um
          item é o item. */}
      {cardsData.cards.length > 1 && (
        <div className="summary-hero summary-hero--plain reveal">
          <div className="summary-hero-inner">
            <div className="summary-hero-stat">
              <span className="summary-hero-eyebrow">Limite disponível</span>
              <strong className="summary-hero-value summary-hero-value--lead">{formatMoney(totalAvailableCents)}</strong>
              <span className="summary-hero-note">de {formatMoney(totalLimitCents)}</span>
            </div>
            <div className="summary-hero-stat">
              <span className="summary-hero-eyebrow">Faturas em aberto</span>
              <strong className={`summary-hero-value${totalUsedCents === 0 ? ' summary-hero-value--muted' : ''}`}>
                {formatMoney(totalUsedCents)}
              </strong>
              <span className="summary-hero-note">
                {cardsData.cards.length} cartã{cardsData.cards.length !== 1 ? 'os' : 'o'}
              </span>
            </div>
          </div>
        </div>
      )}

      {hasPendingCardActivity && (
        <div className="notice" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '1rem' }}>
          <WifiOff size={16} style={{ flexShrink: 0, marginTop: '0.15rem' }} aria-hidden="true" />
          <span>Uma compra no cartão ainda não sincronizou — conecte-se à internet para atualizar o Disponível.</span>
        </div>
      )}

      {/* Sem `.finance-grid` e sem `<article className="surface">` em volta: o grid existia
          pra pôr o formulário ao lado da lista no desktop, e a superfície embrulhava cards
          que já são superfícies (card dentro de card), com um "Seus cartões / Cartões
          ativos" que só repetia o título da tela. Agora a lista é direta, igual a de
          Contas. */}
      {cardsData.loading ? (
        <LoadingState compact />
      ) : cardsData.cards.length > 0 ? (
            <div className="card-list-hero-list">
              {cardsData.cards.map((card, index) => {
                const activeInvoices = cardsData.invoices.filter(
                  (invoice) => invoice.cardId === card.id && (invoice.status === 'open' || invoice.status === 'closed')
                );
                const openInvoice = pickCurrentInvoice(activeInvoices);
                const usedCents = activeInvoices.reduce((total, invoice) => total + invoice.outstandingBalanceCents, 0);
                const availableCents = Math.max(0, card.limitCents - usedCents);
                const usedPercent = card.limitCents > 0 ? Math.min(100, Math.round((usedCents / card.limitCents) * 100)) : 0;
                const barClass =
                  usedPercent >= 90 ? 'card-list-hero-fill--danger' :
                  usedPercent >= 70 ? 'card-list-hero-fill--warning' : '';

                return (
                  <Link
                    className="card-list-hero reveal"
                    to={`/app/cards/${card.id}`}
                    key={card.id}
                    style={{ '--reveal-i': Math.min(index + 1, 8) } as CSSProperties}
                  >
                    <div className="card-list-hero-inner">
                      <div className="card-list-hero-header">
                        <div>
                          <span className="card-list-hero-eyebrow">
                            {card.brand} ···· {card.lastFour} · fecha dia {card.closingDay}
                          </span>
                          <strong className="card-list-hero-name">{card.name}</strong>
                        </div>
                        <CreditCard size={20} aria-hidden="true" className="card-list-hero-icon" />
                      </div>
                      <div>
                        <span className="card-list-hero-label">Disponível</span>
                        <strong className="card-list-hero-balance">{formatMoney(availableCents)}</strong>
                        <span className="card-list-hero-of">de {formatMoney(card.limitCents)}</span>
                      </div>
                      <div className="card-list-hero-track" aria-label={`${usedPercent}% do limite usado`}>
                        <div className={`card-list-hero-fill ${barClass}`} style={{ width: `${Math.max(2, usedPercent)}%` }} />
                      </div>
                    </div>
                    {openInvoice && openInvoice.outstandingBalanceCents > 0 && (
                      <div className="card-list-hero-footer">
                        <span className="card-list-hero-meta">
                          Fatura {formatFriendlyMonth(openInvoice.referenceMonth)} · vence {formatFriendlyDate(openInvoice.dueDate)}
                        </span>
                        <strong className="amount--expense">{formatMoney(openInvoice.outstandingBalanceCents)}</strong>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              illustration="cards"
              title="Nenhum cartão cadastrado"
              description="Adicione seu primeiro cartão para acompanhar compras, parcelas e faturas sem misturar com o saldo das contas."
              action={
                <button className="button button--primary button--compact" type="button" onClick={openCreateSheet}>
                  <Plus size={16} aria-hidden="true" /> Cadastrar cartão
                </button>
              }
            />
      )}

      {/* Cadastro em sheet (02/08/2026) — era um acordeão no fim da página. O
          `navigate` pro cartão recém-criado continua igual: `createCreditCard` devolve o
          id na hora (write fire-and-forget), então a sheet fecha e a tela do cartão abre. */}
      <BottomSheet
        open={formOpen}
        onClose={closeCreateSheet}
        title="Cadastrar cartão"
        subtitle="Limite, fechamento e vencimento"
      >
        <form className="form-stack" onSubmit={handleSubmit}>
          <FormMessage>{message}</FormMessage>
          <div className="card-limit-hero">
            <span className="card-limit-hero-label">Limite do cartão</span>
            <span className="card-limit-hero-wrap">
              <span className="card-limit-hero-currency">R$</span>
              <input
                className="card-limit-hero-input"
                inputMode="decimal"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                placeholder="0,00"
                aria-label="Limite do cartão"
              />
            </span>
          </div>
          <label className="field">
            <span>Nome do cartão</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Cartão principal" />
          </label>
          <label className="field">
            <span>Últimos 4 dígitos</span>
            <input className="input" inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value)} placeholder="0000" />
          </label>
          <SelectField
            label="Bandeira"
            value={brand}
            onChange={(v) => setBrand(v as CreateCreditCardInput['brand'])}
            options={cardBrandOptions.map((b) => ({ value: b, label: b }))}
          />
          <div className="form-grid-2">
            <label className="field">
              <span>Dia de fechamento</span>
              <input className="input" type="number" min={1} max={28} value={closingDay} onChange={(event) => setClosingDay(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Dia de vencimento</span>
              <input className="input" type="number" min={1} max={28} value={dueDay} onChange={(event) => setDueDay(Number(event.target.value))} />
            </label>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="submit">
              Adicionar cartão
            </button>
          </div>
        </form>
      </BottomSheet>
    </section>
  );
}
