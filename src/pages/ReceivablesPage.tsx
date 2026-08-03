import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { HelpCircle, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { SelectField } from '../components/SelectField';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { CategoryMark } from '../components/categoryIcons';
import { defaultCategoryColors } from '../theme/palette';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { formatFriendlyDate, fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { receivableStatusLabels } from '../finance/financeLabels';
import { createReceivable, markReceivableReceived, updateReceivableStatus } from '../finance/financeService';
import { centsToInputValue, formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Receivable } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { ReceivablesTour } from '../onboarding/ReceivablesTour';
import { useReceivablesTour } from '../onboarding/receivablesTour.store';

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
  const openReceivablesTour = useReceivablesTour((state) => state.openTour);

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
  const [receiving, setReceiving] = useState(false);

  const [filter, setFilter] = useState<ReceivableFilterKey>('open');

  const accountOptions = useMemo(() => finance.accounts.map((a) => ({ value: a.id, label: a.name })), [finance.accounts]);

  const visible = useMemo(() => {
    const sorted = finance.receivables.slice().sort((a, b) => a.dueDate.toMillis() - b.dueDate.toMillis());
    if (filter === 'all') return sorted;
    if (filter === 'open') return sorted.filter((r) => r.status === 'pending' || r.status === 'overdue');
    return sorted.filter((r) => r.status === filter);
  }, [finance.receivables, filter]);

  // Faixa de resumo. Só os dois números que pedem ação: quanto ainda tem pra entrar, e
  // quanto disso já venceu.
  //
  // Chegou a ter um terceiro, "Já recebido" — retirado por pedido do dono (03/08/2026), e
  // ele estava certo por três motivos: é acumulado de sempre, então só cresce e nunca vira
  // decisão; o dinheiro já recebido **já está no saldo**, então repeti-lo numa tela sobre o
  // que FALTA entrar sugere que ainda é pendente; e ele empurrava os dois números úteis pra
  // um terço da largura cada. Quem quiser o histórico tem o chip "Recebidos" logo abaixo.
  const summary = useMemo(() => {
    let openCents = 0;
    let overdueCents = 0;
    for (const r of finance.receivables) {
      if (r.status === 'pending' || r.status === 'overdue') openCents += r.amountCents;
      if (r.status === 'overdue') overdueCents += r.amountCents;
    }
    return { openCents, overdueCents };
  }, [finance.receivables]);

  const hasAnyReceivable = finance.receivables.length > 0;

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
    setReceiving(false);
    setReceiveTarget(receivable);
    setReceiveAccountId(receivable.accountId ?? '');
    setReceiveAmount(centsToInputValue(receivable.amountCents));
  }

  function handleConfirmReceive() {
    if (!workspaceId || !user || !receiveTarget || receiving) return;
    setReceiving(true);
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
          <h1 className="page-title page-title--compact">Dinheiro a receber</h1>
          <p className="text-secondary" style={{ margin: '0.35rem 0 0', maxWidth: '34rem' }}>
            Anote quem te deve. Só entra no seu saldo quando você marcar como recebido.
          </p>
        </div>
        <div className="page-heading-actions">
          <button
            className="button button--subtle page-action-button"
            type="button"
            onClick={openCreateSheet}
          >
            <Plus size={15} aria-hidden="true" /> Anotar
          </button>
          <button
            className="button button--subtle page-action-button"
            type="button"
            onClick={openReceivablesTour}
          >
            <HelpCircle size={15} aria-hidden="true" /> Como funciona
          </button>
          <SyncStatusBadge status={finance.pendingWrites ? 'pending' : 'synced'} />
        </div>
      </div>

      {hasAnyReceivable && (
        <div className="summary-hero summary-hero--income reveal">
          <div className="summary-hero-inner">
            <div className="summary-hero-stat">
              <span className="summary-hero-eyebrow">A receber</span>
              <strong className="summary-hero-value summary-hero-value--lead">{formatMoney(summary.openCents)}</strong>
            </div>
            <div className="summary-hero-stat">
              <span className="summary-hero-eyebrow">Em atraso</span>
              <strong className={`summary-hero-value${summary.overdueCents === 0 ? ' summary-hero-value--muted' : ''}`}>
                {formatMoney(summary.overdueCents)}
              </strong>
            </div>
          </div>
        </div>
      )}

      <div>
        <article className="surface surface-pad reveal" style={{ '--reveal-i': 1 } as CSSProperties}>
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

          {finance.loading ? (
            <LoadingState compact />
          ) : visible.length === 0 ? (
            <EmptyState
              illustration="bills"
              compact
              title={filter === 'received' ? 'Nada recebido ainda' : 'Nada a receber por aqui'}
              description="Anote dinheiro que esperam te pagar — freela, empréstimo, um racha de conta. Nada entra no saldo até você confirmar o recebimento."
              // Estado vazio que não oferece a saída obriga a pessoa a procurar o
              // botão sozinha — com o formulário agora em sheet, o caminho ficaria
              // ainda menos óbvio do que era no acordeão.
              action={
                filter === 'received' ? undefined : (
                  <button className="button button--primary button--compact" type="button" onClick={openCreateSheet}>
                    <Plus size={16} aria-hidden="true" /> Anotar a receber
                  </button>
                )
              }
            />
          ) : (
            <div className="item-list">
              {visible.map((receivable, index) => {
                const isOpen = receivable.status === 'pending' || receivable.status === 'overdue';
                const metaClass =
                  receivable.status === 'overdue'
                    ? 'amount--expense'
                    : receivable.status === 'received' || receivable.status === 'cancelled'
                      ? 'text-muted'
                      : 'text-secondary';
                return (
                  <div
                    className="list-row list-row--with-icon reveal"
                    key={receivable.id}
                    style={{ '--reveal-i': Math.min(index, 8) } as CSSProperties}
                  >
                    <CategoryMark category={null} fallback={{ icon: 'money', color: defaultCategoryColors.income_salary }} />
                    <div className="list-row-body">
                      <strong>{receivable.description}</strong>
                      <span className={metaClass}>
                        {receivable.fromWho ? `${receivable.fromWho} · ` : ''}
                        {receivableStatusLabels[receivable.status]} · {formatFriendlyDate(receivable.dueDate)}
                      </span>
                    </div>
                    <div className="list-row-end">
                      <strong className="amount--income">+{formatMoney(receivable.amountCents)}</strong>
                      <SyncStatusBadge status={receivable.localSyncStatus} />
                      {isOpen ? (
                        <>
                          <button type="button" className="button button--subtle button--compact" onClick={() => handleOpenReceive(receivable)}>
                            Recebi
                          </button>
                          <button type="button" className="button button--ghost button--compact" onClick={() => handleCancel(receivable)}>
                            Cancelar
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </div>

      {/* Sheet de criação — era um `.form-accordion-toggle` estacionado ACIMA da lista,
          ocupando a área nobre da tela mesmo fechado (02/08/2026). O formulário não mudou:
          só saiu do corpo da página e ganhou de graça foco preso, ESC, backdrop e
          swipe-to-dismiss do BottomSheet. */}
      <BottomSheet
        open={formOpen}
        onClose={closeCreateSheet}
        title="Anotar valor a receber"
        subtitle="Só entra no seu saldo quando você marcar como recebido"
      >
        <form className="form-stack" onSubmit={handleSubmit}>
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

          <div className="sheet-actions">
            <button className="button button--primary" type="submit">Anotar</button>
          </div>
        </form>
      </BottomSheet>

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
            disabled={!receiveAccountId || receiving}
          >
            Confirmar recebimento
          </button>
          {!receiveAccountId ? (
            <span className="field-hint" style={{ textAlign: 'center' }}>Escolha a conta onde o dinheiro caiu.</span>
          ) : null}
        </div>
      </BottomSheet>

      <ReceivablesTour />

      {confirmDialog}
    </section>
  );
}
