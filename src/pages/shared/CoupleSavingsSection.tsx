import { useState, type FormEvent } from 'react';
import { Check, Minus, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import { categoryColors } from '../../components/categoryIcons';
import { ACCENT_FOREGROUND } from '../../theme/palette';
import { EmptyState } from '../../components/EmptyState';
import { coupleGoalDeposit, coupleGoalWithdraw, createGoal, deleteGoal } from '../../finance/financeService';
import { currentAccountBalances } from '../../finance/financeCalculations';
import { formatMoney, parseMoneyToCents } from '../../finance/money';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import type { useFinanceContext } from '../../finance/FinanceDataContext';
import type { useCoupleSavingsContext } from '../../shared/SharedDataContext';
import type { CoupleGoalStats } from '../../shared/useCoupleSavings';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface CoupleSavingsSectionProps {
  workspaceId: string;
  userId: string;
  personalDefaultWorkspaceId: string | undefined;
  savings: ReturnType<typeof useCoupleSavingsContext>;
  personalFinance: ReturnType<typeof useFinanceContext>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onMessage: (message: string | null) => void;
}

/** Cofrinho do casal — meta(s) compartilhada(s) + guardar/resgatar. Mesma lógica de antes, só isolada. */
export function CoupleSavingsSection({
  workspaceId,
  userId,
  personalDefaultWorkspaceId,
  savings,
  personalFinance,
  confirm,
  onMessage
}: CoupleSavingsSectionProps) {
  const [cofrinhoOpen, setCofrinhoOpen] = useState(false);
  const [cofrinhoName, setCofrinhoName] = useState('');
  const [cofrinhoTarget, setCofrinhoTarget] = useState('');
  const [cofrinhoColor, setCofrinhoColor] = useState(categoryColors[0]);
  const [guardarTarget, setGuardarTarget] = useState<CoupleGoalStats | null>(null);
  const [guardarAmount, setGuardarAmount] = useState('');
  const [guardarFromAccount, setGuardarFromAccount] = useState('');
  const [guardarSign, setGuardarSign] = useState<1 | -1>(1);

  function handleCreateCofrinho(event: FormEvent) {
    event.preventDefault();
    if (!cofrinhoName.trim()) return;
    onMessage(null);
    createGoal(workspaceId, userId, {
      name: cofrinhoName.trim(),
      kind: 'save',
      targetCents: cofrinhoTarget ? parseMoneyToCents(cofrinhoTarget) : 0,
      icon: 'piggy',
      color: cofrinhoColor
    });
    setCofrinhoName('');
    setCofrinhoTarget('');
    setCofrinhoColor(categoryColors[0]);
    setCofrinhoOpen(false);
  }

  function handleGuardar(event: FormEvent) {
    event.preventDefault();
    if (!guardarTarget) return;
    const amountCents = parseMoneyToCents(guardarAmount);
    if (amountCents <= 0) return;

    if (guardarSign === -1 && amountCents > guardarTarget.totalCents) {
      onMessage(`Só dá pra resgatar até ${formatMoney(guardarTarget.totalCents)} — o que já foi guardado neste cofrinho.`);
      return;
    }

    if (guardarSign === 1 && guardarFromAccount) {
      const balances = currentAccountBalances(personalFinance.accounts);
      const acct = balances.find((a) => a.id === guardarFromAccount);
      if (acct && amountCents > acct.balanceCents) {
        onMessage(`Saldo insuficiente. Disponível na conta: ${formatMoney(acct.balanceCents)}`);
        return;
      }
    }

    onMessage(null);

    if (guardarSign === 1) {
      coupleGoalDeposit(workspaceId, personalDefaultWorkspaceId, userId, guardarTarget.goal.id, amountCents, {
        description: `Cofrinho: ${guardarTarget.goal.name}`,
        accountId: guardarFromAccount
      });
    } else {
      coupleGoalWithdraw(workspaceId, personalDefaultWorkspaceId, userId, guardarTarget.goal.id, amountCents, {
        description: `Cofrinho: ${guardarTarget.goal.name} (resgate)`,
        accountId: guardarFromAccount
      });
    }

    setGuardarTarget(null);
    setGuardarAmount('');
    setGuardarFromAccount('');
    setGuardarSign(1);
  }

  async function handleDeleteCofrinho(goalId: string) {
    const ok = await confirm({ title: 'Excluir este cofrinho?', message: 'O histórico de quanto vocês já juntaram será removido.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    deleteGoal(workspaceId, goalId)
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível excluir o cofrinho agora.')));
  }

  return (
    <>
      <section className="cofrinho-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cofrinho do casal</p>
            <h2>Juntem dinheiro juntos</h2>
          </div>
          <PiggyBank size={22} aria-hidden="true" />
        </div>
        {savings.stats.length === 0 ? (
          <article className="surface surface-pad">
            <EmptyState
              illustration="goals"
              compact
              title="Nenhum cofrinho ainda"
              description="Criem um objetivo em comum — viagem, reserva, casa — e acompanhem quanto já juntaram."
              action={
                <button className="button button--primary button--compact" type="button" onClick={() => setCofrinhoOpen(true)}>
                  <Plus size={16} aria-hidden="true" /> Criar cofrinho
                </button>
              }
            />
          </article>
        ) : (
          <div className="form-stack">
            {savings.stats.map((stat) => (
              <article className="surface cofrinho-card" key={stat.goal.id}>
                <div className="cofrinho-top">
                  <span className="cofrinho-mark" style={{ background: stat.goal.color ?? categoryColors[0] }}><PiggyBank size={20} /></span>
                  <div className="cofrinho-title">
                    <strong>{stat.goal.name}</strong>
                    {stat.thisMonthCents > 0 && <span>Juntos este mês: {formatMoney(stat.thisMonthCents)}</span>}
                  </div>
                  <button className="icon-button" type="button" aria-label="Excluir cofrinho" onClick={() => void handleDeleteCofrinho(stat.goal.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="cofrinho-amount">
                  <strong className="display-number">{formatMoney(stat.totalCents)}</strong>
                  {stat.goal.targetCents > 0 ? <span> de {formatMoney(stat.goal.targetCents)} · {stat.percent}%</span> : null}
                </div>
                {stat.goal.targetCents > 0 ? (
                  <div className="goal-progress-track" aria-hidden="true">
                    <span className="goal-progress-fill" style={{ width: `${Math.max(3, stat.percent)}%`, background: stat.goal.color }} />
                  </div>
                ) : null}
                <div className="button-row">
                  <button
                    className="button button--primary"
                    style={{ flex: 1 }}
                    type="button"
                    onClick={() => { setGuardarTarget(stat); setGuardarAmount(''); setGuardarFromAccount(''); setGuardarSign(1); }}
                  >
                    <PiggyBank size={17} aria-hidden="true" /> Guardar
                  </button>
                  {stat.totalCents > 0 && (
                    <button
                      className="button button--subtle"
                      style={{ flex: 1 }}
                      type="button"
                      onClick={() => { setGuardarTarget(stat); setGuardarAmount(''); setGuardarFromAccount(''); setGuardarSign(-1); }}
                    >
                      <Minus size={17} aria-hidden="true" /> Resgatar
                    </button>
                  )}
                </div>
              </article>
            ))}
            <button className="button button--ghost" type="button" onClick={() => setCofrinhoOpen(true)}>
              <Plus size={16} aria-hidden="true" /> Novo cofrinho
            </button>
          </div>
        )}
      </section>

      <BottomSheet open={cofrinhoOpen} onClose={() => setCofrinhoOpen(false)} title="Novo cofrinho do casal" subtitle="Um objetivo em comum">
        <form className="category-create" onSubmit={(event) => void handleCreateCofrinho(event)}>
          <div className="category-create-preview">
            <span className="category-tile-mark category-tile-mark--lg" style={{ background: cofrinhoColor }}><PiggyBank size={26} /></span>
          </div>
          <label className="field">
            <span>Nome</span>
            <input className="input" value={cofrinhoName} onChange={(event) => setCofrinhoName(event.target.value)} placeholder="Ex: Viagem, Reserva, Casa nova..." autoFocus />
          </label>
          <label className="field">
            <span>Meta (opcional)</span>
            <input className="input" inputMode="decimal" value={cofrinhoTarget} onChange={(event) => setCofrinhoTarget(event.target.value)} placeholder="0,00" />
          </label>
          <div className="field">
            <span className="field-label">Cor</span>
            <div className="color-grid">
              {categoryColors.map((color) => (
                <button key={color} type="button" className={`color-dot${cofrinhoColor === color ? ' color-dot--selected' : ''}`} style={{ background: color, color }} aria-pressed={cofrinhoColor === color} aria-label={`Cor ${color}`} onClick={() => setCofrinhoColor(color)}>
                  {cofrinhoColor === color && <Check size={15} color={ACCENT_FOREGROUND} />}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={!cofrinhoName.trim()}>Criar cofrinho</button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={Boolean(guardarTarget)}
        onClose={() => setGuardarTarget(null)}
        title={guardarTarget ? `${guardarSign === 1 ? 'Guardar' : 'Resgatar'} — ${guardarTarget.goal.name}` : ''}
        subtitle={guardarSign === 1 ? 'Quanto você vai guardar?' : 'Quanto você vai resgatar?'}
      >
        <form className="form-stack" onSubmit={(event) => void handleGuardar(event)}>
          <div className="segmented">
            <button type="button" aria-pressed={guardarSign === 1} onClick={() => setGuardarSign(1)}>
              <Plus size={15} aria-hidden="true" /> Guardar
            </button>
            <button type="button" aria-pressed={guardarSign === -1} onClick={() => setGuardarSign(-1)}>
              <Minus size={15} aria-hidden="true" /> Resgatar
            </button>
          </div>
          <label className="field">
            <span>Valor</span>
            <input className="input input--money" inputMode="decimal" value={guardarAmount} onChange={(event) => setGuardarAmount(event.target.value)} placeholder="0,00" autoFocus />
          </label>
          {guardarSign === -1 && guardarTarget && (
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
              Disponível pra resgatar: {formatMoney(guardarTarget.totalCents)}
            </p>
          )}
          <div className="field">
            <span className="field-label">{guardarSign === 1 ? 'De onde sai o dinheiro?' : 'Pra qual conta vai?'}</span>
            <div className="chip-row">
              <button type="button" className={`chip${!guardarFromAccount ? ' chip--active' : ''}`} onClick={() => setGuardarFromAccount('')}>Só registrar</button>
              {personalFinance.accounts.map((account) => (
                <button key={account.id} type="button" className={`chip${guardarFromAccount === account.id ? ' chip--active' : ''}`} onClick={() => setGuardarFromAccount(account.id)}>{account.name}</button>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {guardarSign === 1
                ? (guardarFromAccount ? 'Vira uma despesa "Cofrinho" na sua conta pessoal e some no total do casal.' : 'Só soma no cofrinho do casal, sem mexer no saldo das suas contas.')
                : (guardarFromAccount ? 'Vira uma entrada "Cofrinho" na sua conta pessoal e desconta do total do casal.' : 'Só desconta do cofrinho do casal, sem mexer no saldo das suas contas.')}
            </p>
          </div>
          <div className="sheet-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={!guardarAmount || (guardarSign === -1 && Boolean(guardarTarget) && parseMoneyToCents(guardarAmount) > (guardarTarget?.totalCents ?? 0))}
            >
              {guardarSign === 1 ? 'Guardar' : 'Resgatar'}
            </button>
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
