import { useState, type FormEvent } from 'react';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { BottomSheet } from '../components/BottomSheet';
import { CategoryIcon, categoryColors, categoryIconKeys } from '../components/categoryIcons';
import { EmptyState } from '../components/EmptyState';
import { FormMessage } from '../components/FormMessage';
import { contributeToGoal, createGoal, deleteGoal } from '../finance/financeService';
import { fromDateInputValue } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { useGoalsData } from '../finance/useGoalsData';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { Goal } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

const goalHints: Record<string, string> = {
  metas: 'Você disse no início que quer guardar dinheiro. Bora criar sua primeira meta?',
  guardar: 'Você disse que tem dificuldade de guardar dinheiro. Uma meta com prazo ajuda a manter o hábito.',
  dividas: 'Você quer sair das dívidas. Crie uma meta de quitação e acompanhe o quanto já abateu.'
};

export function GoalsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const { goals, loading, pendingWrites } = useGoalsData(workspaceId);
  const [message, setMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'save' | 'debt'>('save');
  const [target, setTarget] = useState('');
  const [initial, setInitial] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [icon, setIcon] = useState('piggy');
  const [color, setColor] = useState(categoryColors[0]);
  const [busy, setBusy] = useState(false);

  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeSign, setContributeSign] = useState<1 | -1>(1);

  const hintKey = profile?.onboardingGoal ?? profile?.onboardingChallenge ?? '';
  const hint = goalHints[hintKey];

  function resetCreate() {
    setName('');
    setKind('save');
    setTarget('');
    setInitial('');
    setDueDate('');
    setIcon('piggy');
    setColor(categoryColors[0]);
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !user || !name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await createGoal(workspaceId, user.uid, {
        name: name.trim(),
        kind,
        targetCents: parseMoneyToCents(target),
        savedCents: initial ? parseMoneyToCents(initial) : 0,
        icon,
        color,
        dueDate: dueDate ? fromDateInputValue(dueDate) : undefined
      });
      resetCreate();
      setCreateOpen(false);
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a meta agora.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleContribute(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !contributeGoal) return;
    setBusy(true);
    try {
      await contributeToGoal(workspaceId, contributeGoal.id, contributeSign * parseMoneyToCents(contributeAmount));
      setContributeGoal(null);
      setContributeAmount('');
      setContributeSign(1);
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar a meta agora.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(goalId: string) {
    if (!workspaceId) return;
    await deleteGoal(workspaceId, goalId);
  }

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Metas</p>
          <h1 className="page-title page-title--compact">Suas metas</h1>
        </div>
        <SyncStatusBadge status={pendingWrites ? 'pending' : 'synced'} />
      </div>

      <FormMessage>{message}</FormMessage>

      {hint && goals.length === 0 ? <div className="notice notice--success">{hint}</div> : null}

      {goals.length === 0 && !loading ? (
        <EmptyState
          illustration="goals"
          title="Nenhuma meta ainda"
          description="Defina um objetivo de economia ou de quitar uma dívida e acompanhe o progresso."
          action={
            <button className="button button--primary button--compact" type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" /> Criar meta
            </button>
          }
        />
      ) : (
        <div className="goal-list">
          {goals.map((goal) => {
            const pct = goal.targetCents > 0 ? Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100)) : 0;
            const done = goal.savedCents >= goal.targetCents && goal.targetCents > 0;
            return (
              <article className="surface surface-pad goal-card" key={goal.id}>
                <div className="goal-card-head">
                  <span className="goal-mark" style={{ background: goal.color ?? categoryColors[0] }}>
                    <CategoryIcon icon={goal.icon} size={20} />
                  </span>
                  <div className="goal-card-title">
                    <strong>{goal.name}</strong>
                    <span className="text-muted">{goal.kind === 'debt' ? 'Quitar dívida' : 'Economizar'}{done ? ' · concluída 🎉' : ''}</span>
                  </div>
                  <button className="icon-button" type="button" aria-label={`Excluir ${goal.name}`} onClick={() => void handleDelete(goal.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>

                <div className="goal-progress-track" aria-hidden="true">
                  <span className={`goal-progress-fill${done ? ' goal-progress-fill--done' : ''}`} style={{ width: `${Math.max(3, pct)}%`, background: done ? undefined : goal.color }} />
                </div>

                <div className="goal-card-foot">
                  <span className="display-number goal-amount">{formatMoney(goal.savedCents)}</span>
                  <span className="text-secondary">de {formatMoney(goal.targetCents)} · {pct}%</span>
                </div>

                <button className="button button--subtle button--block" type="button" onClick={() => { setContributeGoal(goal); setContributeSign(1); }}>
                  {goal.kind === 'debt' ? 'Registrar pagamento' : 'Guardar valor'}
                </button>
              </article>
            );
          })}

          <button className="button button--primary button--block" type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={18} aria-hidden="true" /> Nova meta
          </button>
        </div>
      )}

      {/* Create goal sheet */}
      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Nova meta">
        <form className="category-create" onSubmit={(event) => void handleCreate(event)}>
          <div className="category-create-preview">
            <span className="category-tile-mark category-tile-mark--lg" style={{ background: color }}>
              <CategoryIcon icon={icon} size={26} />
            </span>
          </div>

          <div className="field">
            <span className="field-label">Objetivo</span>
            <div className="segmented">
              <button type="button" aria-pressed={kind === 'save'} onClick={() => setKind('save')}>Economizar</button>
              <button type="button" aria-pressed={kind === 'debt'} onClick={() => setKind('debt')}>Quitar dívida</button>
            </div>
          </div>

          <label className="field">
            <span>Nome</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'debt' ? 'Ex: Cartão, empréstimo...' : 'Ex: Viagem, reserva...'} autoFocus />
          </label>

          <div className="form-grid-2">
            <label className="field">
              <span>{kind === 'debt' ? 'Total da dívida' : 'Meta (R$)'}</span>
              <input className="input" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="0,00" />
            </label>
            <label className="field">
              <span>{kind === 'debt' ? 'Já pago' : 'Já guardado'}</span>
              <input className="input" inputMode="decimal" value={initial} onChange={(event) => setInitial(event.target.value)} placeholder="0,00" />
            </label>
          </div>

          <label className="field">
            <span>Prazo (opcional)</span>
            <input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>

          <div className="field">
            <span className="field-label">Cor</span>
            <div className="color-grid">
              {categoryColors.map((c) => (
                <button key={c} type="button" className={`color-dot${color === c ? ' color-dot--selected' : ''}`} style={{ background: c, color: c }} aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}>
                  {color === c && <Check size={15} color="#fff" />}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Ícone</span>
            <div className="icon-grid">
              {categoryIconKeys.map((key) => (
                <button key={key} type="button" className={`icon-cell${icon === key ? ' icon-cell--selected' : ''}`} style={icon === key ? { background: color, borderColor: color, color: '#fff' } : undefined} aria-pressed={icon === key} onClick={() => setIcon(key)}>
                  <CategoryIcon icon={key} size={19} />
                </button>
              ))}
            </div>
          </div>

          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={busy || !name.trim() || !target}>
              {busy ? 'Criando...' : 'Criar meta'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Contribute sheet */}
      <BottomSheet open={Boolean(contributeGoal)} onClose={() => setContributeGoal(null)} title={contributeGoal?.name} subtitle={contributeGoal?.kind === 'debt' ? 'Registrar pagamento' : 'Guardar valor'}>
        <form className="form-stack" onSubmit={(event) => void handleContribute(event)}>
          <div className="segmented">
            <button type="button" aria-pressed={contributeSign === 1} onClick={() => setContributeSign(1)}>
              <Plus size={15} aria-hidden="true" /> {contributeGoal?.kind === 'debt' ? 'Paguei' : 'Guardei'}
            </button>
            <button type="button" aria-pressed={contributeSign === -1} onClick={() => setContributeSign(-1)}>
              <Minus size={15} aria-hidden="true" /> Corrigir
            </button>
          </div>
          <label className="field">
            <span>Valor</span>
            <input className="input" inputMode="decimal" value={contributeAmount} onChange={(event) => setContributeAmount(event.target.value)} placeholder="0,00" autoFocus />
          </label>
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={busy || !contributeAmount}>
              {busy ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </BottomSheet>
    </section>
  );
}
