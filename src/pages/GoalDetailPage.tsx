import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext, useGoalsContext } from '../finance/FinanceDataContext';
import { CategoryIcon, categoryColors } from '../components/categoryIcons';
import { EmptyState } from '../components/EmptyState';
import { GoalContributeSheet } from '../finance/GoalContributeSheet';
import { GoalDeleteSheet } from '../finance/GoalDeleteSheet';
import { useGoalContributions } from '../finance/useGoalContributions';
import { formatFriendlyDate } from '../finance/financeDates';
import { formatMoney } from '../finance/money';

export function GoalDetailPage() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const { goals, loading } = useGoalsContext();
  const finance = useFinanceContext();
  const goal = goals.find((item) => item.id === goalId);
  const { contributions, loading: contributionsLoading } = useGoalContributions(workspaceId, goalId);

  const [contributeOpen, setContributeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!goal && !loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Meta</p>
        <h1 className="page-title">Meta não encontrada.</h1>
        <Link className="button button--secondary" to="/app/goals">
          Voltar para metas
        </Link>
      </section>
    );
  }

  const pct = goal && goal.targetCents > 0 ? Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100)) : 0;
  const done = goal ? goal.savedCents >= goal.targetCents && goal.targetCents > 0 : false;
  const accountById = new Map(finance.accounts.map((account) => [account.id, account.name]));

  return (
    <section className="page-content page-content--narrow">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Meta</p>
          <h1 className="page-title">{goal?.name ?? 'Carregando meta'}</h1>
          <p className="page-description">
            {goal ? (goal.kind === 'debt' ? 'Quitar dívida' : 'Economizar') + (done ? ' · concluída 🎉' : '') : 'Carregando dados.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link className="button button--secondary" to="/app/goals">
            Todas as metas
          </Link>
          <button className="button button--ghost" type="button" onClick={() => setDeleteOpen(true)} aria-label="Excluir meta">
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {goal ? (
        <>
          <article className="surface surface-pad goal-card" style={{ marginBottom: '1.5rem' }}>
            <div className="goal-card-head">
              <span className="goal-mark" style={{ background: goal.color ?? categoryColors[0] }}>
                <CategoryIcon icon={goal.icon} size={20} />
              </span>
              <div className="goal-card-title">
                <strong>{formatMoney(goal.savedCents)}</strong>
                <span className="text-secondary">de {formatMoney(goal.targetCents)} · {pct}%</span>
              </div>
            </div>
            <div className="goal-progress-track" aria-hidden="true">
              <span className={`goal-progress-fill${done ? ' goal-progress-fill--done' : ''}`} style={{ width: `${Math.max(3, pct)}%`, background: done ? undefined : goal.color }} />
            </div>
            <button className="button button--subtle button--block" type="button" onClick={() => setContributeOpen(true)} style={{ marginTop: '1rem' }}>
              {goal.kind === 'debt' ? 'Registrar pagamento' : 'Guardar ou retirar valor'}
            </button>
          </article>

          <article className="surface surface-pad">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Histórico</p>
                <h2>Movimentações desta meta</h2>
              </div>
            </div>
            {contributionsLoading ? null : contributions.length > 0 ? (
              <div className="item-list">
                {contributions.map((contribution) => {
                  const isDeposit = contribution.type !== 'withdrawal';
                  const accountName = contribution.accountId ? accountById.get(contribution.accountId) : undefined;
                  return (
                    <div className="list-row" key={contribution.id}>
                      <div>
                        <strong>{isDeposit ? 'Guardado' : 'Retirado'}</strong>
                        <span className="text-secondary">
                          {contribution.createdAt ? formatFriendlyDate(contribution.createdAt) : 'Agora'}
                          {accountName ? ` · ${accountName}` : ' · só registrado'}
                        </span>
                      </div>
                      <strong className={isDeposit ? 'amount--income' : 'amount--expense'}>
                        {isDeposit ? '+' : '−'}{formatMoney(contribution.amountCents)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                illustration="goals"
                compact
                title="Nada registrado ainda"
                description="Guarde ou retire um valor pra ver o histórico desta meta aqui."
              />
            )}
          </article>

          <GoalContributeSheet
            open={contributeOpen}
            workspaceId={workspaceId}
            userId={user?.uid}
            goal={goal}
            accounts={finance.accounts}
            onClose={() => setContributeOpen(false)}
          />
          <GoalDeleteSheet
            open={deleteOpen}
            workspaceId={workspaceId}
            userId={user?.uid}
            goal={goal}
            accounts={finance.accounts}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => navigate('/app/goals')}
          />
        </>
      ) : null}
    </section>
  );
}
