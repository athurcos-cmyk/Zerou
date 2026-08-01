import { useState } from 'react';
import { Plus, ArrowUpRight, RefreshCw, HelpCircle, ChevronDown, ChevronRight, Building2 } from 'lucide-react';
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
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Investimentos</h1>
          <p className="text-muted" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
            A Granativa não se conecta com nenhuma corretora ou banco — todo valor aqui é o que você mesmo informa.
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
        <div className="card-list-hero" style={{ marginBottom: '1rem', background: 'var(--gradient-income)' }}>
          <div className="card-list-hero-inner" style={{ background: 'none', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="card-list-hero-stat" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span className="card-list-hero-eyebrow">Total investido</span>
              <strong className="card-list-hero-balance" style={{ fontSize: 'clamp(1.15rem, 3vw, 1.4rem)' }}>{formatMoney(totalContributed)}</strong>
            </div>
            <div className="card-list-hero-stat" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span className="card-list-hero-eyebrow">Valor atual</span>
              <strong className="card-list-hero-balance" style={{ fontSize: 'clamp(1.15rem, 3vw, 1.4rem)' }}>{formatMoney(totalBalance)}</strong>
            </div>
            <div className="card-list-hero-stat" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              <span className="card-list-hero-eyebrow">Rendimento</span>
              <strong className="card-list-hero-balance" style={{ fontSize: 'clamp(1.15rem, 3vw, 1.4rem)' }}>
                {totalReturn >= 0 ? '+' : ''}{formatMoney(totalReturn)}
              </strong>
              {totalContributed > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--on-accent-82)' }}>
                  {totalReturn >= 0 ? '+' : ''}{totalReturnPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      {valueUpdates.length >= 2 && (
        <div className="surface surface-pad" style={{ marginBottom: '1rem' }}>
          <p className="card-list-hero-label" style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Evolução do portfólio</p>
          <InvestmentHistoryChart updates={valueUpdates} />
        </div>
      )}

      {/* Investment list grouped by account */}
      {!hasData ? (
        <EmptyState illustration="wallet" title="Nenhum investimento ainda" description="Cadastre uma conta de investimento pra começar a acompanhar seu portfólio." />
      ) : (
        <div className="item-list">
          {investmentAccounts.map((account) => {
            const accountInvestments = investmentsByAccount.get(account.id) ?? [];
            const isExpanded = expandedAccounts.has(account.id);
            const accountCategory = finance.categories.find((c) => c.linkedInvestmentAccountId === account.id);
            const accountTotal = accountInvestments.reduce((sum, inv) => sum + (inv.currentBalanceCents ?? 0), 0);

            return (
              <div key={account.id} className="day-group">
                <button
                  type="button"
                  className="list-row--tap category-parent-row"
                  onClick={() => toggleAccount(account.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: 10,
                      background: 'var(--success-soft)', color: 'var(--success)',
                      transition: 'transform var(--duration-fast) ease',
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(0deg)'
                    }}>
                      <Building2 size={16} aria-hidden="true" />
                    </span>
                    <span>
                      <strong style={{ display: 'block', lineHeight: 1.25 }}>{account.name}</strong>
                      <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {accountInvestments.length} investimento{accountInvestments.length !== 1 ? 's' : ''}
                      </span>
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {accountTotal > 0 && (
                      <strong style={{ fontSize: '0.95rem', fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 800 }}>
                        {formatMoney(accountTotal)}
                      </strong>
                    )}
                    {isExpanded ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                  </span>
                </button>

                {isExpanded && (
                  <>
                    {accountInvestments.length > 0 ? (
                      <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        {accountInvestments.map((inv) => {
                          const invReturn = (inv.currentBalanceCents ?? 0) - (inv.contributedCents ?? 0);
                          return (
                            <div
                              key={inv.id}
                              className="list-row"
                              style={{
                                paddingLeft: '3.25rem', paddingRight: '0.75rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: '0.5rem', flexWrap: 'wrap'
                              }}
                            >
                              <span style={{ flex: 1, minWidth: '120px' }}>
                                <strong style={{ display: 'block', lineHeight: 1.3 }}>{inv.name}</strong>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-surface-subtle)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                                  {investmentKindLabels[inv.kind]}
                                </span>
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span style={{ textAlign: 'right', lineHeight: 1.25 }}>
                                  <strong style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 800, fontSize: '0.92rem', display: 'block' }}>
                                    {formatMoney(inv.currentBalanceCents ?? 0)}
                                  </strong>
                                  {invReturn !== 0 && (
                                    <span style={{
                                      fontSize: '0.72rem',
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
                                  style={{ width: '2.25rem', height: '2.25rem', color: 'var(--action-primary)' }}
                                  onClick={() => { setContributeTarget(inv); setContributeCategoryId(accountCategory?.id ?? ''); }}
                                  title="Aportar / Resgatar"
                                >
                                  <ArrowUpRight size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  type="button"
                                  style={{ width: '2.25rem', height: '2.25rem', color: 'var(--info)' }}
                                  onClick={() => setValueUpdateTarget(inv)}
                                  title="Quanto rendeu desde a última vez?"
                                >
                                  <RefreshCw size={15} />
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
                      style={{ margin: '0.25rem 0 0.5rem 2.75rem' }}
                      onClick={() => { setSelectedAccountId(account.id); setInvestmentSheetOpen(true); }}
                    >
                      <Plus size={14} aria-hidden="true" /> Novo investimento
                    </button>
                  </>
                )}
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
