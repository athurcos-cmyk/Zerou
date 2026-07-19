import { useMemo, useState, type FormEvent } from 'react';
import { HandCoins } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { formatFriendlyDate, fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { receivableStatusLabels } from '../finance/financeLabels';
import { createReceivable, markReceivableReceived, updateReceivableStatus } from '../finance/financeService';
import { centsToInputValue, formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Receivable } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

type ReceivableFilterKey = 'open' | 'received' | 'all';

const filterChips: Array<{ key: ReceivableFilterKey; label: string }> = [
  { key: 'open', label: 'A receber' },
  { key: 'received', label: 'Recebidos' },
  { key: 'all', label: 'Todos' }
];

export function ReceivablesPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // ── form (novo a receber) ──
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [fromWho, setFromWho] = useState('');
  const [dueDate, setDueDate] = useState(todayInputValue());
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // ── sheet de "marcar recebido" ──
  const [receiveTarget, setReceiveTarget] = useState<Receivable | null>(null);
  const [receiveAccountId, setReceiveAccountId] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');

  const [filter, setFilter] = useState<ReceivableFilterKey>('open');

  const accountOptions = useMemo(() => finance.accounts.map((a) => ({ value: a.id, label: a.name })), [finance.accounts]);

  const visible = useMemo(() => {
    const sorted = finance.receivables.slice().sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis());
    if (filter === 'all') return sorted;
    if (filter === 'open') return sorted.filter((r) => r.status === 'pending' || r.status === 'overdue');
    return sorted.filter((r) => r.status === filter);
  }, [finance.receivables, filter]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de anotar valores a receber.');
      return;
    }
    if (!amount.trim()) {
      setMessage('Informe o valor a receber.');
      return;
    }

    createReceivable(workspaceId, user.uid, {
      description,
      amountCents: parseMoneyToCents(amount),
      fromWho: fromWho.trim() || undefined,
      dueDate: fromDateInputValue(dueDate),
      accountId: accountId || undefined
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar o a receber.')));

    setDescription('');
    setAmount('');
    setFromWho('');
    setDueDate(todayInputValue());
    setAccountId('');
    setFormOpen(false);
  }

  function handleOpenReceive(receivable: Receivable) {
    setReceiveTarget(receivable);
    setReceiveAccountId(receivable.accountId ?? '');
    setReceiveAmount(centsToInputValue(receivable.amountCents));
  }

  function handleConfirmReceive() {
    if (!workspaceId || !user || !receiveTarget) return;
    const amt = receiveAmount.trim() ? parseMoneyToCents(receiveAmount) : receiveTarget.amountCents;
    markReceivableReceived(workspaceId, user.uid, receiveTarget, {
      accountId: receiveAccountId || undefined,
      amountCents: amt
    });
    setReceiveTarget(null);
    setReceiveAccountId('');
    setReceiveAmount('');
  }

  async function handleCancel(receivable: Receivable) {
    if (!workspaceId) return;
    const ok = await confirm({
      title: 'Cancelar este a receber?',
      message: `"${receivable.description}" sai da lista. Não cria nenhuma transação (nada entra no seu saldo).`,
      confirmLabel: 'Cancelar a receber',
      danger: true
    });
    if (!ok) return;
    updateReceivableStatus(workspaceId, receivable.id, 'cancelled').catch((error) =>
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível cancelar.'))
    );
  }

  const receiveTargetName = receiveTarget?.description ?? '';

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">O que você tem pra receber</p>
          <h1 className="page-title page-title--compact">Contas a Receber</h1>
        </div>
        <SyncStatusBadge status={finance.pendingWrites ? 'pending' : 'synced'} />
      </div>

      <p className="text-secondary" style={{ marginTop: '-0.5rem' }}>
        Anote quem te deve e o que você espera receber. Só entra no seu saldo quando você marcar como recebido.
      </p>

      <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
        <button
          type="button"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
        >
          <div>
            <p className="eyebrow">Novo a receber</p>
            <h2 style={{ margin: 0 }}>Anotar valor a receber</h2>
          </div>
          <HandCoins size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
        </button>

        {formOpen && (
          <>
            <FormMessage>{message}</FormMessage>

            <label className="field">
              <span>Descrição</span>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Freela, empréstimo, racha do jantar" autoFocus />
            </label>

            <label className="field">
              <span>Valor</span>
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </label>

            <label className="field">
              <span>De quem <span className="text-secondary">(opcional)</span></span>
              <input className="input" value={fromWho} onChange={(e) => setFromWho(e.target.value)} placeholder="Fulano, Cliente X" />
            </label>

            <label className="field">
              <span>Previsão de recebimento</span>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            <SelectField
              label="Cai em qual conta?"
              value={accountId}
              onChange={setAccountId}
              options={accountOptions}
              placeholder="Escolher na hora de receber"
            />

            <button className="button button--primary" type="submit">Anotar</button>
          </>
        )}
      </form>

      <article className="surface surface-pad">
        <div className="chip-row chip-row--scroll" role="group" aria-label="Filtrar">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`chip${filter === chip.key ? ' chip--active' : ''}`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            illustration="bills"
            compact
            title={filter === 'received' ? 'Nada recebido ainda' : 'Nada a receber por aqui'}
            description="Anote dinheiro que esperam te pagar — freela, empréstimo, um racha de conta. Nada entra no saldo até você confirmar o recebimento."
          />
        ) : (
          <div className="item-list">
            {visible.map((receivable) => {
              const isOpen = receivable.status === 'pending' || receivable.status === 'overdue';
              const isOverdue = receivable.status === 'overdue';
              return (
                <div className="list-row list-row--with-icon" key={receivable.id}>
                  <div className="list-row-body">
                    <strong>{receivable.description}</strong>
                    <span className="text-secondary">
                      {receivable.fromWho ? `${receivable.fromWho} · ` : ''}
                      <span className={isOverdue ? 'amount--expense' : undefined}>
                        {receivableStatusLabels[receivable.status]}
                      </span>
                      {' · '}{formatFriendlyDate(receivable.dueDate)}
                    </span>
                  </div>
                  <div className="list-row-end" style={{ alignItems: 'flex-end', gap: '0.4rem' }}>
                    <strong className="amount--income">+{formatMoney(receivable.amountCents)}</strong>
                    {isOpen ? (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="button button--subtle button--compact" onClick={() => handleCancel(receivable)}>
                          Cancelar
                        </button>
                        <button type="button" className="button button--primary button--compact" onClick={() => handleOpenReceive(receivable)}>
                          Recebi
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <BottomSheet open={receiveTarget !== null} onClose={() => setReceiveTarget(null)} title="Marcar como recebido">
        <div className="form-stack">
          <p className="text-secondary" style={{ margin: 0 }}>
            Vai criar uma receita de <strong>{receiveTargetName}</strong> na conta escolhida — aí sim entra no seu saldo.
          </p>

          <SelectField
            label="Cai em qual conta?"
            value={receiveAccountId}
            onChange={setReceiveAccountId}
            options={accountOptions}
            placeholder="Escolha a conta"
          />

          <label className="field">
            <span>Valor recebido</span>
            <input className="input" inputMode="decimal" value={receiveAmount} onChange={(e) => setReceiveAmount(e.target.value)} placeholder="0,00" />
            <span className="field-hint">Ajuste se recebeu um valor diferente do combinado.</span>
          </label>

          <button
            className="button button--primary"
            type="button"
            onClick={handleConfirmReceive}
            disabled={!receiveAccountId}
          >
            Confirmar recebimento
          </button>
          {!receiveAccountId ? (
            <span className="field-hint" style={{ textAlign: 'center' }}>Escolha a conta onde o dinheiro caiu.</span>
          ) : null}
        </div>
      </BottomSheet>

      {confirmDialog}
    </section>
  );
}
