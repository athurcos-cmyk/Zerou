import { useState, type FormEvent } from 'react';
import { Check, Minus, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import { categoryColors } from '../../components/categoryIcons';
import { ACCENT_FOREGROUND } from '../../theme/palette';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { coupleGoalDeposit, coupleGoalWithdraw, createGoal, deleteGoal } from '../../finance/financeService';
import { currentAccountBalances } from '../../finance/financeCalculations';
import { formatMoney, parseMoneyToCents } from '../../finance/money';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import { memberLabel } from './memberLabel';
import type { WorkspaceMembership } from '../../types/contracts';
import type { useFinanceContext } from '../../finance/FinanceDataContext';
import type { useCoupleWriteGate } from '../../shared/coupleWriteGate';
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
  /** Pra rotular "quem colocou quanto" — `byUser` é indexado por uid. */
  activeMembers: WorkspaceMembership[];
  personalDefaultWorkspaceId: string | undefined;
  savings: ReturnType<typeof useCoupleSavingsContext>;
  personalFinance: ReturnType<typeof useFinanceContext>;
  /** Cofrinho é dado compartilhado: os dois gravam nos MESMOS `goals`/`goalContributions`,
   * então vale a mesma trava de conexão das despesas (ver `coupleWriteGate.ts`). */
  gate: ReturnType<typeof useCoupleWriteGate>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onMessage: (message: string | null) => void;
}

/** Cofrinho do casal — meta(s) compartilhada(s) + guardar/resgatar. Mesma lógica de antes, só isolada. */
export function CoupleSavingsSection({
  workspaceId,
  userId,
  activeMembers,
  personalDefaultWorkspaceId,
  savings,
  personalFinance,
  gate,
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
  /** Cofrinho que a pessoa tentou excluir ainda com dinheiro dentro — vira explicação, não ação. */
  const [blockedDeleteTarget, setBlockedDeleteTarget] = useState<CoupleGoalStats | null>(null);
  const partnerUserId = activeMembers.find((member) => member.userId !== userId)?.userId;

  function blockedByConnection() {
    if (!gate.blocked) return false;
    onMessage(gate.message);
    return true;
  }

  function handleCreateCofrinho(event: FormEvent) {
    event.preventDefault();
    if (!cofrinhoName.trim()) return;
    if (blockedByConnection()) return;
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
    if (blockedByConnection()) return;
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

  /**
   * Excluir cofrinho: **só quando está vazio**.
   *
   * A regra do sistema desde as Metas pessoais é "excluir algo que guarda dinheiro de verdade
   * precisa perguntar o destino do valor" (`docs/design/DESIGN.md`) — e aqui a resposta "devolver
   * pra uma conta" é **impossível de honrar**: parte do dinheiro é da outra pessoa, e transação só
   * pode ser gravada no workspace pessoal de quem está usando o app (as regras impedem escrever na
   * conta dela, e é isso que sustenta a privacidade). Não existe ação atômica que devolva a parte
   * de cada um.
   *
   * Então em vez de decidir sozinho que o dinheiro some (o que o código fazia até 2026-08-03),
   * a exclusão espera: cada um resgata a sua parte — caminho que já existe e já credita a conta —
   * e o cofrinho vazio pode ser excluído por qualquer um dos dois.
   */
  async function handleDeleteCofrinho(stat: CoupleGoalStats) {
    if (blockedByConnection()) return;
    if (stat.totalCents > 0) {
      setBlockedDeleteTarget(stat);
      return;
    }
    const ok = await confirm({
      title: 'Excluir este cofrinho?',
      message: 'Ele está vazio. O histórico de depósitos e resgates será removido.',
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return;
    deleteGoal(workspaceId, stat.goal.id)
      .catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível excluir o cofrinho agora.')));
  }

  function openResgate(stat: CoupleGoalStats) {
    setBlockedDeleteTarget(null);
    setGuardarTarget(stat);
    setGuardarAmount('');
    setGuardarFromAccount('');
    setGuardarSign(-1);
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
        {savings.loading ? (
          <article className="surface surface-pad">
            <LoadingState compact />
          </article>
        ) : savings.stats.length === 0 ? (
          <article className="surface surface-pad">
            <EmptyState
              illustration="goals"
              compact
              title="Nenhum cofrinho ainda"
              description="Criem um objetivo em comum — viagem, reserva, casa — e acompanhem quanto já juntaram."
              action={
                <button className="button button--primary button--compact" type="button" disabled={gate.blocked} onClick={() => setCofrinhoOpen(true)}>
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
                  <button className="icon-button" type="button" aria-label="Excluir cofrinho" disabled={gate.blocked} onClick={() => void handleDeleteCofrinho(stat)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="cofrinho-amount">
                  <strong className="display-number">{formatMoney(stat.totalCents)}</strong>
                  {stat.goal.targetCents > 0 ? <span> de {formatMoney(stat.goal.targetCents)} · {stat.percent}%</span> : null}
                </div>
                {/* Quanto cada um colocou. `byUser` já era calculado em `calculateCoupleGoalStats`
                    desde sempre e nunca tinha sido exibido — a pessoa não conseguia nem saber
                    quanto do cofrinho era dela. */}
                {stat.totalCents > 0 && (
                  <div className="split-preview">
                    <span><strong>Você</strong>{formatMoney(stat.byUser[userId] ?? 0)}</span>
                    {partnerUserId && (
                      <span><strong>{memberLabel(activeMembers.find((m) => m.userId === partnerUserId), userId)}</strong>{formatMoney(stat.byUser[partnerUserId] ?? 0)}</span>
                    )}
                  </div>
                )}
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
                    disabled={gate.blocked}
                    onClick={() => { setGuardarTarget(stat); setGuardarAmount(''); setGuardarFromAccount(''); setGuardarSign(1); }}
                  >
                    <PiggyBank size={17} aria-hidden="true" /> Guardar
                  </button>
                  {stat.totalCents > 0 && (
                    <button
                      className="button button--subtle"
                      style={{ flex: 1 }}
                      type="button"
                      disabled={gate.blocked}
                      onClick={() => { setGuardarTarget(stat); setGuardarAmount(''); setGuardarFromAccount(''); setGuardarSign(-1); }}
                    >
                      <Minus size={17} aria-hidden="true" /> Resgatar
                    </button>
                  )}
                </div>
              </article>
            ))}
            <button className="button button--ghost" type="button" disabled={gate.blocked} onClick={() => setCofrinhoOpen(true)}>
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
            <div className="color-grid" role="radiogroup" aria-label="Cor do cofrinho">
              {categoryColors.map((color) => (
                <button key={color} type="button" className={`color-dot${cofrinhoColor === color ? ' color-dot--selected' : ''}`} style={{ background: color, color }} role="radio" aria-checked={cofrinhoColor === color} aria-label={`Cor ${color}`} onClick={() => setCofrinhoColor(color)}>
                  {cofrinhoColor === color && <Check size={15} color={ACCENT_FOREGROUND} />}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={gate.blocked || !cofrinhoName.trim()}>Criar cofrinho</button>
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
          <div className="segmented" role="radiogroup" aria-label="Guardar ou resgatar">
            <button type="button" role="radio" aria-checked={guardarSign === 1} onClick={() => setGuardarSign(1)}>
              <Plus size={15} aria-hidden="true" /> Guardar
            </button>
            <button type="button" role="radio" aria-checked={guardarSign === -1} onClick={() => setGuardarSign(-1)}>
              <Minus size={15} aria-hidden="true" /> Resgatar
            </button>
          </div>
          <label className="field">
            <span>Valor</span>
            <input className="input input--money" inputMode="decimal" value={guardarAmount} onChange={(event) => setGuardarAmount(event.target.value)} placeholder="0,00" autoFocus />
          </label>
          {guardarSign === -1 && guardarTarget && (
            <>
              <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                Disponível pra resgatar: {formatMoney(guardarTarget.totalCents)} · sua parte: {formatMoney(guardarTarget.byUser[userId] ?? 0)}
              </p>
              {/* Aviso, não trava: cofrinho de casal é dinheiro conjunto, e tirar mais do que você
                  colocou é caso legítimo (ela deposita, você paga a viagem). O que não pode é isso
                  acontecer sem a pessoa perceber. */}
              {parseMoneyToCents(guardarAmount || '0') > (guardarTarget.byUser[userId] ?? 0) && (
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0, color: 'var(--warning)' }}>
                  Você está resgatando mais do que colocou — o resto sai do que {memberLabel(activeMembers.find((m) => m.userId === partnerUserId), userId)} guardou.
                </p>
              )}
            </>
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
              disabled={gate.blocked || !guardarAmount || (guardarSign === -1 && Boolean(guardarTarget) && parseMoneyToCents(guardarAmount) > (guardarTarget?.totalCents ?? 0))}
            >
              {guardarSign === 1 ? 'Guardar' : 'Resgatar'}
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Exclusão de cofrinho com dinheiro dentro: explicação + caminho, nunca uma ação que
          decide sozinha o destino do valor (ver `handleDeleteCofrinho`). */}
      <BottomSheet
        open={Boolean(blockedDeleteTarget)}
        onClose={() => setBlockedDeleteTarget(null)}
        title="Resgatem antes de excluir"
        subtitle={blockedDeleteTarget ? `Ainda tem ${formatMoney(blockedDeleteTarget.totalCents)} guardado em "${blockedDeleteTarget.goal.name}"` : ''}
      >
        {blockedDeleteTarget && (
          <div className="form-stack">
            <p className="text-secondary" style={{ margin: 0 }}>
              Excluir agora faria esse dinheiro sumir sem voltar pra conta de ninguém. E não dá pra
              devolver automaticamente: parte é de {memberLabel(activeMembers.find((m) => m.userId === partnerUserId), userId)}, e
              o app não pode lançar nada na conta dela — só ela mesma pode.
            </p>
            <div className="split-preview">
              <span><strong>Sua parte</strong>{formatMoney(blockedDeleteTarget.byUser[userId] ?? 0)}</span>
              {partnerUserId && (
                <span>
                  <strong>{memberLabel(activeMembers.find((m) => m.userId === partnerUserId), userId)}</strong>
                  {formatMoney(blockedDeleteTarget.byUser[partnerUserId] ?? 0)}
                </span>
              )}
            </div>
            <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Cada um resgata a sua parte pra conta que quiser. Com o cofrinho vazio, qualquer um de
              vocês dois pode excluir.
            </p>
            <div className="sheet-actions">
              <button className="button button--primary" type="button" disabled={gate.blocked} onClick={() => openResgate(blockedDeleteTarget)}>
                <Minus size={16} aria-hidden="true" /> Resgatar minha parte
              </button>
              <button className="button button--ghost" type="button" onClick={() => setBlockedDeleteTarget(null)}>Deixar como está</button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
