import { useState } from 'react';
import { Plus, ArrowUpRight, RefreshCw, HelpCircle, ChevronDown, ChevronRight, Building2, Landmark } from 'lucide-react';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { useAuth } from '../auth/AuthContext';
import { createInvestmentAccount, createInvestment, deleteInvestment } from '../finance/financeService';
import { formatMoney } from '../finance/money';
import { investmentKindLabels } from '../finance/financeLabels';
import { InvestmentContributeSheet } from '../finance/InvestmentContributeSheet';
import { InvestmentValueUpdateSheet } from '../finance/InvestmentValueUpdateSheet';
import { InvestmentHistoryChart } from '../finance/InvestmentHistoryChart';
import { BottomSheet } from '../components/BottomSheet';
import { SelectField } from '../components/SelectField';
import { EmptyState } from '../components/EmptyState';
import { useConfirm } from '../components/ConfirmDialog';
import { InvestmentsTour } from '../onboarding/InvestmentsTour';
import { useInvestmentsTour } from '../onboarding/investmentsTour.store';
import type { Investment, InvestmentKind } from '../types/contracts';
import { investmentKinds } from '../finance/financeSchemas';

export function InvestmentsPage() {
  const finance = useFinanceContext();
  const { profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const userId = profile?.id;

  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');

  const [investmentSheetOpen, setInvestmentSheetOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [newInvName, setNewInvName] = useState('');
  const [newInvKind, setNewInvKind] = useState<InvestmentKind>('cdb');
  const [newInvValue, setNewInvValue] = useState('');

  const [contributeTarget, setContributeTarget] = useState<Investment | null>(null);
  const [contributeCategoryId, setContributeCategoryId] = useState('');

  const [valueUpdateTarget, setValueUpdateTarget] = useState<Investment | null>(null);

  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const { openTour } = useInvestmentsTour();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const investments = finance.investments ?? [];
  const valueUpdates = finance.investmentValueUpdates ?? [];
  const activeInvestments = investments.filter((inv) => inv.isActive !== false);

  const totalContributed = activeInvestments.reduce((sum, inv) => sum + (inv.contributedCents ?? 0), 0);
  const totalBalance = activeInvestments.reduce((sum, inv) => sum + (inv.currentBalanceCents ?? 0), 0);
  const totalReturn = totalBalance - totalContributed;
  const totalReturnPct = totalContributed > 0 ? ((totalReturn / totalContributed) * 100) : 0;

  const investmentsByAccount = new Map<string, Investment[]>();
  for (const inv of activeInvestments) {
    const list = investmentsByAccount.get(inv.investmentAccountId) ?? [];
    list.push(inv);
    investmentsByAccount.set(inv.investmentAccountId, list);
  }

  function toggleAccount(accountId: string) {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId); else next.add(accountId);
      return next;
    });
  }

  function handleCreateAccount() {
    if (!workspaceId || !userId || !newAccountName.trim()) return;
    createInvestmentAccount(workspaceId, userId, { name: newAccountName.trim() });
    setNewAccountName('');
    setAccountSheetOpen(false);
  }

  function handleCreateInvestment() {
    if (!workspaceId || !userId || !selectedAccountId || !newInvName.trim()) return;
    const valueCents = newInvValue.trim() ? parseInt(newInvValue.replace(/\D/g, ''), 10) || 0 : 0;
    createInvestment(workspaceId, userId, {
      investmentAccountId: selectedAccountId,
      name: newInvName.trim(),
      kind: newInvKind,
      openingBalanceCents: valueCents
    });
    setNewInvName('');
    setNewInvKind('cdb');
    setNewInvValue('');
    setSelectedAccountId('');
    setInvestmentSheetOpen(false);
  }

  async function handleDelete(investment: Investment) {
    const ok = await confirm({
      title: 'Excluir investimento?',
      message: 'Isso só apaga o registro no app — não mexe em dinheiro real. Continuar?',
      confirmLabel: 'Excluir'
    });
    if (!ok || !workspaceId) return;
    deleteInvestment(workspaceId, investment.id);
  }

  const investmentAccounts = finance.investmentAccounts ?? [];
  const kindOptions = investmentKinds.map((k) => ({ value: k, label: investmentKindLabels[k] }));
  const hasData = activeInvestments.length > 0 || investmentAccounts.length > 0;

  return (
    <div className="page" style={{ animation: 'fadeIn var(--duration-slow) ease both' }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Investimentos</h1>
          <p className="text-muted" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', maxWidth: '42ch' }}>
            Acompanhe seu portfólio. Nenhum valor é automático — você decide quando atualizar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="button button--subtle" type="button" onClick={openTour}>
            <HelpCircle size={15} aria-hidden="true" /> Como funciona
          </button>
          <button className="button button--subtle" type="button" onClick={() => setAccountSheetOpen(true)}>
            <Plus size={15} aria-hidden="true" /> Nova conta
          </button>
        </div>
      </header>

      {/* Dashboard — green gradient hero for investment/growth context */}
      {hasData && (
        <div
          className="card-list-hero"
          style={{
            marginBottom: '1.25rem',
            background: 'var(--gradient-income)',
            animation: 'fadeIn var(--duration-slow) 0.1s ease both'
          }}
        >
          <div className="card-list-hero-inner" style={{
            background: 'none',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Decorative background dot pattern — subtle depth on the hero */}
            <span aria-hidden="true" style={{
              position: 'absolute', right: '-0.5rem', top: '-0.5rem',
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--on-accent-16)', pointerEvents: 'none'
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span className="card-list-hero-eyebrow">Total investido</span>
              <strong className="card-list-hero-balance" style={{ fontSize: 'clamp(1.1rem, 3vw, 1.35rem)' }}>
                {formatMoney(totalContributed)}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span className="card-list-hero-eyebrow">Valor atual</span>
              <strong className="card-list-hero-balance" style={{ fontSize: 'clamp(1.1rem, 3vw, 1.35rem)' }}>
                {formatMoney(totalBalance)}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <span className="card-list-hero-eyebrow">Rendimento</span>
              <strong className="card-list-hero-balance" style={{ fontSize: 'clamp(1.1rem, 3vw, 1.35rem)' }}>
                {totalReturn >= 0 ? '+' : ''}{formatMoney(totalReturn)}
              </strong>
              {totalContributed > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--on-accent-82)', fontWeight: 500 }}>
                  {totalReturn >= 0 ? '+' : ''}{totalReturnPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {valueUpdates.length >= 2 && (
        <div className="surface surface-pad" style={{
          marginBottom: '1.25rem',
          animation: 'fadeIn var(--duration-slow) 0.15s ease both'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 7,
              background: 'var(--success-soft)', color: 'var(--success)'
            }}>
              <Landmark size={13} aria-hidden="true" />
            </span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Evolução do portfólio
            </span>
          </div>
          <InvestmentHistoryChart updates={valueUpdates} />
        </div>
      )}

      {/* Investment list grouped by account */}
      {!hasData ? (
        <EmptyState illustration="wallet" title="Nenhum investimento ainda" description="Cadastre uma conta de investimento pra começar a acompanhar seu portfólio." />
      ) : (
        <div className="item-list">
          {investmentAccounts.map((account, idx) => {
            const accountInvestments = investmentsByAccount.get(account.id) ?? [];
            const isExpanded = expandedAccounts.has(account.id);
            const accountCategory = finance.categories.find((c) => c.linkedInvestmentAccountId === account.id);
            const accountTotal = accountInvestments.reduce((sum, inv) => sum + (inv.currentBalanceCents ?? 0), 0);

            return (
              <div
                key={account.id}
                className="day-group"
                style={{
                  animation: `fadeIn var(--duration-slow) ${0.2 + idx * 0.06}s ease both`
                }}
              >
                <button
                  type="button"
                  className="list-row--tap category-parent-row"
                  onClick={() => toggleAccount(account.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '0.75rem', cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--success-soft)', color: 'var(--success)',
                      transition: 'transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease',
                      boxShadow: isExpanded ? '0 2px 8px rgba(46, 174, 125, 0.15)' : 'none'
                    }}>
                      <Building2 size={17} aria-hidden="true" />
                    </span>
                    <span>
                      <strong style={{ display: 'block', lineHeight: 1.2, fontSize: '0.95rem' }}>{account.name}</strong>
                      <span className="text-muted" style={{ fontSize: '0.73rem' }}>
                        {accountInvestments.length} investimento{accountInvestments.length !== 1 ? 's' : ''}
                      </span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {accountTotal > 0 && (
                      <strong style={{
                        fontSize: '0.95rem', fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontWeight: 800, fontVariantNumeric: 'tabular-nums'
                      }}>
                        {formatMoney(accountTotal)}
                      </strong>
                    )}
                    <span style={{
                      transition: 'transform var(--duration-fast) ease',
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      display: 'flex', color: 'var(--text-muted)'
                    }}>
                      <ChevronDown size={16} />
                    </span>
                  </span>
                </button>

                {/* Expandable investment rows with CSS-only height animation */}
                <div style={{
                  overflow: 'hidden',
                  transition: 'max-height var(--duration-slow) ease, opacity var(--duration-fast) ease',
                  maxHeight: isExpanded ? `${accountInvestments.length * 56 + 48}px` : '0px',
                  opacity: isExpanded ? 1 : 0
                }}>
                  {accountInvestments.length > 0 ? (
                    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      {accountInvestments.map((inv) => {
                        const invReturn = (inv.currentBalanceCents ?? 0) - (inv.contributedCents ?? 0);
                        return (
                          <div
                            key={inv.id}
                            className="list-row"
                            style={{
                              padding: '0.55rem 0.75rem 0.55rem 3.25rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              gap: '0.5rem', flexWrap: 'wrap',
                              animation: 'fadeIn var(--duration-fast) ease both'
                            }}
                          >
                            <span style={{ flex: 1, minWidth: '110px' }}>
                              <strong style={{ display: 'block', lineHeight: 1.3, fontSize: '0.9rem' }}>{inv.name}</strong>
                              <span style={{
                                fontSize: '0.68rem', color: 'var(--text-muted)',
                                background: 'var(--bg-surface-muted)', padding: '0.08rem 0.4rem',
                                borderRadius: '3px', fontWeight: 500, letterSpacing: '0.02em'
                              }}>
                                {investmentKindLabels[inv.kind]}
                              </span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                              <span style={{ textAlign: 'right', lineHeight: 1.2 }}>
                                <strong style={{
                                  fontFamily: "'DM Sans', system-ui, sans-serif",
                                  fontWeight: 800, fontSize: '0.9rem', display: 'block',
                                  fontVariantNumeric: 'tabular-nums'
                                }}>
                                  {formatMoney(inv.currentBalanceCents ?? 0)}
                                </strong>
                                {invReturn !== 0 && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    color: invReturn >= 0 ? 'var(--success)' : 'var(--danger)',
                                    fontWeight: 600
                                  }}>
                                    {invReturn >= 0 ? '+' : ''}{formatMoney(invReturn)}
                                  </span>
                                )}
                              </span>
                              <button
                                className="icon-button"
                                type="button"
                                style={{
                                  width: '2.25rem', height: '2.25rem', color: 'var(--action-primary)',
                                  transition: 'background var(--duration-fast) ease'
                                }}
                                onClick={() => { setContributeTarget(inv); setContributeCategoryId(accountCategory?.id ?? ''); }}
                                title="Aportar / Resgatar"
                              >
                                <ArrowUpRight size={15} />
                              </button>
                              <button
                                className="icon-button"
                                type="button"
                                style={{
                                  width: '2.25rem', height: '2.25rem', color: 'var(--info)',
                                  transition: 'background var(--duration-fast) ease'
                                }}
                                onClick={() => setValueUpdateTarget(inv)}
                                title="Quanto rendeu desde a última vez?"
                              >
                                <RefreshCw size={14} />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted" style={{ padding: '0.6rem 0 0.6rem 3.25rem', fontSize: '0.85rem' }}>
                      Nenhum investimento cadastrado nesta conta.
                    </p>
                  )}
                  <button
                    className="button button--subtle"
                    type="button"
                    style={{ margin: '0.2rem 0 0.5rem 2.75rem' }}
                    onClick={() => { setSelectedAccountId(account.id); setInvestmentSheetOpen(true); }}
                  >
                    <Plus size={14} aria-hidden="true" /> Novo investimento
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sheet: Nova conta de investimento */}
      <BottomSheet open={accountSheetOpen} onClose={() => { setAccountSheetOpen(false); setNewAccountName(''); }} title="Nova conta de investimento" subtitle="Cadastre a corretora ou banco onde você investe">
        <div className="form-stack">
          <label className="field">
            <span>Nome da corretora ou banco</span>
            <input className="input" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="Ex.: XP, Nubank Investimentos" autoFocus />
          </label>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
            Depois você cadastra cada investimento (CDB, Tesouro, ações...) dentro dela.
          </p>
          <div className="sheet-actions">
            <button className="button button--primary" type="button" disabled={!newAccountName.trim()} onClick={handleCreateAccount}>
              Criar conta
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Sheet: Novo investimento */}
      <BottomSheet open={investmentSheetOpen} onClose={() => { setInvestmentSheetOpen(false); setNewInvName(''); setNewInvValue(''); setNewInvKind('cdb'); }} title="Novo investimento">
        <div className="form-stack">
          <label className="field">
            <span>Nome do investimento</span>
            <input className="input" value={newInvName} onChange={(e) => setNewInvName(e.target.value)} placeholder="Ex.: CDB Banco X 110% CDI" autoFocus />
          </label>
          <SelectField label="Tipo" value={newInvKind} onChange={(v) => setNewInvKind(v as InvestmentKind)} options={kindOptions} />
          <label className="field">
            <span>Valor investido</span>
            <input className="input input--money" inputMode="decimal" value={newInvValue} onChange={(e) => setNewInvValue(e.target.value)} placeholder="Opcional — deixe em branco se for começar do zero" />
          </label>
          <div className="sheet-actions">
            <button className="button button--primary" type="button" disabled={!newInvName.trim()} onClick={handleCreateInvestment}>
              Criar investimento
            </button>
          </div>
        </div>
      </BottomSheet>

      <InvestmentContributeSheet
        open={contributeTarget !== null}
        workspaceId={workspaceId}
        userId={userId}
        investment={contributeTarget}
        categoryId={contributeCategoryId}
        accounts={finance.accounts}
        onClose={() => setContributeTarget(null)}
      />

      <InvestmentValueUpdateSheet
        open={valueUpdateTarget !== null}
        workspaceId={workspaceId}
        userId={userId}
        investment={valueUpdateTarget}
        onClose={() => setValueUpdateTarget(null)}
      />

      <InvestmentsTour />
      {confirmDialog}
    </div>
  );
}
