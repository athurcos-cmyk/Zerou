import { useEffect, useRef, useState } from 'react';
import { Plus, ArrowUpRight, RefreshCw, HelpCircle, ChevronDown, ChevronRight, Building2, Landmark, Trash2, Check } from 'lucide-react';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { useAuth } from '../auth/AuthContext';
import { createInvestmentAccount, createInvestment, deleteInvestment, deleteAccount, deleteCategory } from '../finance/financeService';
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
import { categoryColors, ACCENT_FOREGROUND } from '../theme/palette';
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

  const [newInvColor, setNewInvColor] = useState<string | null>(null);

  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  // Contas nascem expandidas por padrão — sem isso, "+ Novo investimento" fica escondido atrás
  // de um toque que ninguém pediu pra fazer sempre que a página recarrega (achado ao vivo,
  // 01/08/2026). `seenAccountIds` garante que isso só acontece na PRIMEIRA vez que uma conta
  // aparece (boot ou recém-criada) — quem recolhe manualmente continua recolhido depois.
  const seenAccountIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newIds = (finance.investmentAccounts ?? [])
      .map((a) => a.id)
      .filter((id) => !seenAccountIds.current.has(id));
    if (newIds.length === 0) return;
    newIds.forEach((id) => seenAccountIds.current.add(id));
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      newIds.forEach((id) => next.add(id));
      return next;
    });
  }, [finance.investmentAccounts]);

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
  // Mesma fórmula de fallback que InvestmentHistoryChart usa (mesma ordem de activeInvestments)
  // — o pontinho de cor na lista sempre bate com a cor da linha no gráfico.
  const colorByInvestmentId = new Map(
    activeInvestments.map((inv, i) => [inv.id, inv.color ?? categoryColors[i % categoryColors.length]])
  );

  // Cor padrão do próximo investimento a criar: rotaciona pela paleta compartilhada conforme
  // quantos investimentos já existem na conta escolhida, pra vizinhos nascerem com cores
  // diferentes sem obrigar a pessoa a escolher. `newInvColor` (setado ao tocar num círculo do
  // grid) sobrescreve o padrão quando a pessoa quer algo específico.
  const defaultInvColor = categoryColors[(investmentsByAccount.get(selectedAccountId)?.length ?? 0) % categoryColors.length];
  const effectiveInvColor = newInvColor ?? defaultInvColor;

  function toggleAccount(accountId: string) {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId); else next.add(accountId);
      return next;
    });
  }

  function handleCreateAccount() {
    if (!workspaceId || !userId || !newAccountName.trim()) return;
    // Expansão por padrão é responsabilidade do efeito acima (roda pra qualquer conta nova,
    // não só a criada agora), não precisa duplicar aqui.
    createInvestmentAccount(workspaceId, userId, { name: newAccountName.trim() });
    setNewAccountName('');
    setAccountSheetOpen(false);
  }

  function handleCreateInvestment() {
    if (!workspaceId || !userId || !selectedAccountId || !newInvName.trim()) return;
    const valueCents = newInvValue.trim() ? parseInt(newInvValue.replace(/\D/g, ''), 10) || 0 : 0;
    const name = newInvName.trim();
    const kind = newInvKind;
    const investmentAccountId = selectedAccountId;
    const color = effectiveInvColor;
    const investmentId = createInvestment(workspaceId, userId, {
      investmentAccountId,
      name,
      kind,
      openingBalanceCents: valueCents,
      color
    });
    setNewInvName('');
    setNewInvKind('cdb');
    setNewInvValue('');
    setNewInvColor(null);
    setSelectedAccountId('');
    setInvestmentSheetOpen(false);

    // Investimento criado do zero (sem saldo inicial) não tem de onde vir dinheiro ainda — abre
    // o sheet de Aportar direto, guiando "criar conta → criar investimento → aportar" numa
    // sequência só, em vez de deixar a pessoa procurar o próximo passo sozinha. Investimento que
    // já nasceu com saldo (era um investimento anterior ao app) não precisa disso.
    if (valueCents === 0) {
      const category = finance.categories.find((c) => c.linkedInvestmentAccountId === investmentAccountId);
      setContributeCategoryId(category?.id ?? '');
      setContributeTarget({
        id: investmentId,
        workspaceId,
        investmentAccountId,
        name,
        kind,
        color,
        contributedCents: 0,
        currentBalanceCents: 0,
        isActive: true,
        createdBy: userId
      });
    }
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

  /** Excluir a conta de investimento (a corretora/banco, nível 1) — não um investimento
   * individual. Exige que já esteja vazia, mesmo espírito de `AccountsPage.tsx` bloqueando
   * exclusão de conta com lançamento vivo: apagar em cascata os investimentos de dentro seria
   * uma exclusão silenciosa demais pra um dado financeiro. Também apaga (logicamente) a
   * categoria sintética vinculada — sem isso ficaria uma categoria órfã, sem conta nenhuma por
   * trás, ainda ocupando espaço nos dados (já não aparece em seletor, mas o documento ficaria). */
  async function handleDeleteAccount(account: { id: string; name: string }) {
    const accountInvestments = investmentsByAccount.get(account.id) ?? [];
    if (accountInvestments.length > 0) {
      await confirm({
        title: 'Conta não está vazia',
        message: `Exclua os ${accountInvestments.length} investimento${accountInvestments.length > 1 ? 's' : ''} de "${account.name}" primeiro, antes de excluir a conta.`,
        confirmLabel: 'Entendi'
      });
      return;
    }

    const ok = await confirm({
      title: `Excluir "${account.name}"?`,
      message: 'A conta de investimento é removida do app. Não mexe em dinheiro real — só apaga o registro.',
      confirmLabel: 'Excluir'
    });
    if (!ok || !workspaceId) return;

    const linkedCategory = finance.categories.find((c) => c.linkedInvestmentAccountId === account.id);
    deleteAccount(workspaceId, account.id);
    if (linkedCategory) deleteCategory(workspaceId, linkedCategory.id);
  }

  const investmentAccounts = finance.investmentAccounts ?? [];
  const kindOptions = investmentKinds.map((k) => ({ value: k, label: investmentKindLabels[k] }));
  const hasData = activeInvestments.length > 0 || investmentAccounts.length > 0;

  return (
    // `page-content` + `page-heading-row page-heading-row--tight`, não `page`/`page-header` —
    // essas duas classes não existem em `global.css` (achado ao vivo, 01/08/2026): o cabeçalho
    // ficava sem o `margin-bottom` que toda tela irmã (Cartões, Contas, Metas) já tem de graça,
    // colado no hero abaixo. Corrigido casando com o padrão em vez de inventar espaçamento novo.
    <section className="page-content" style={{ animation: 'fadeIn var(--duration-slow) ease both' }}>
      <header className="page-heading-row page-heading-row--tight">
        <div>
          <h1 className="page-title page-title--compact">Investimentos</h1>
          <p className="page-description" style={{ fontSize: '0.85rem' }}>
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

      {/* Chart — renderiza sempre que há investimento; o próprio componente decide se tem dado
          suficiente (precisa de atualização em pelo menos 2 dias diferentes pra desenhar uma
          linha, não só 2 cliques no mesmo dia). Gate antigo (`valueUpdates.length >= 2`) checava
          a coisa errada e mostrava "sem dados suficientes" mesmo com várias atualizações no
          mesmo dia — achado ao vivo, 01/08/2026. */}
      {activeInvestments.length > 0 && (
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
          <InvestmentHistoryChart updates={valueUpdates} investments={activeInvestments} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="list-row--tap category-parent-row"
                    onClick={() => toggleAccount(account.id)}
                    style={{
                      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: '0.75rem', cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: 'var(--success-soft)', color: 'var(--success)',
                        transition: 'transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease',
                        boxShadow: isExpanded ? '0 2px 8px var(--success-soft)' : 'none'
                      }}>
                        <Building2 size={17} aria-hidden="true" />
                      </span>
                      <span style={{ minWidth: 0, textAlign: 'left' }}>
                        <strong style={{ display: 'block', lineHeight: 1.2, fontSize: '0.95rem' }}>{account.name}</strong>
                        <span className="text-muted" style={{ fontSize: '0.73rem' }}>
                          {accountInvestments.length} investimento{accountInvestments.length !== 1 ? 's' : ''}
                        </span>
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
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
                  {/* Fora do botão de expandir (não dá pra aninhar button em button) — achado
                      pelo dono ao vivo, 01/08/2026: só dava pra excluir o investimento, nunca a
                      conta de investimento em si. */}
                  <button
                    type="button"
                    className="icon-button"
                    style={{ flexShrink: 0, color: 'var(--danger)' }}
                    onClick={() => handleDeleteAccount(account)}
                    title="Excluir conta de investimento"
                    aria-label={`Excluir ${account.name}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>

                {/* Expandable investment rows — grid-template-rows 0fr/1fr anima sem precisar
                    estimar altura em px. A versão anterior usava um maxHeight calculado
                    (`investimentos × 56px`), calibrado pra quando cada linha era 1 linha só; ao
                    ganhar badge/cor/3 botões por linha, o conteúdo real passou a ser bem mais
                    alto que a estimativa, e o overflow:hidden cortava investimentos da lista —
                    com 3 investimentos só o primeiro aparecia (achado ao vivo, 01/08/2026). Essa
                    técnica nunca precisa de número mágico, então nunca quebra de novo por causa
                    de conteúdo mais alto. */}
                <div style={{
                  display: 'grid',
                  gridTemplateRows: isExpanded ? '1fr' : '0fr',
                  transition: 'grid-template-rows var(--duration-slow) ease, opacity var(--duration-fast) ease',
                  opacity: isExpanded ? 1 : 0
                }}>
                <div style={{ overflow: 'hidden' }}>
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
                              display: 'flex', flexDirection: 'column', gap: '0.45rem',
                              animation: 'fadeIn var(--duration-fast) ease both'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ flex: 1, minWidth: '110px' }}>
                                <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', lineHeight: 1.3, fontSize: '0.9rem' }}>
                                  <span aria-hidden="true" style={{
                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                    background: colorByInvestmentId.get(inv.id)
                                  }} />
                                  {inv.name}
                                </strong>
                                <span style={{
                                  fontSize: '0.68rem', color: 'var(--text-muted)',
                                  background: 'var(--bg-surface-muted)', padding: '0.08rem 0.4rem',
                                  borderRadius: '3px', fontWeight: 500, letterSpacing: '0.02em'
                                }}>
                                  {investmentKindLabels[inv.kind]}
                                </span>
                              </span>
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
                            </span>
                            {/* Ações com rótulo visível — ícone sozinho (com só um `title` de tooltip)
                                fazia a pessoa não achar como aportar e ir pelo caminho errado de
                                Nova Transação (achado testando ao vivo, 01/08/2026). */}
                            <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button
                                className="button button--subtle"
                                type="button"
                                style={{ color: 'var(--action-primary)', fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                                onClick={() => { setContributeTarget(inv); setContributeCategoryId(accountCategory?.id ?? ''); }}
                              >
                                <ArrowUpRight size={14} aria-hidden="true" /> Aportar / Resgatar
                              </button>
                              <button
                                className="button button--subtle"
                                type="button"
                                style={{ color: 'var(--info)', fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                                onClick={() => setValueUpdateTarget(inv)}
                              >
                                <RefreshCw size={13} aria-hidden="true" /> Quanto rendeu desde a última vez?
                              </button>
                              <button
                                className="button button--subtle"
                                type="button"
                                style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '0.35rem 0.6rem' }}
                                onClick={() => handleDelete(inv)}
                              >
                                <Trash2 size={13} aria-hidden="true" /> Excluir
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

      {/* Sheet: Novo investimento — subtítulo com o nome da conta: sem isso, quem tem mais de
          uma corretora não sabe em qual está criando (achado ao vivo, 01/08/2026). */}
      <BottomSheet
        open={investmentSheetOpen}
        onClose={() => { setInvestmentSheetOpen(false); setNewInvName(''); setNewInvValue(''); setNewInvKind('cdb'); setNewInvColor(null); }}
        title="Novo investimento"
        subtitle={investmentAccounts.find((a) => a.id === selectedAccountId)?.name ? `Em ${investmentAccounts.find((a) => a.id === selectedAccountId)?.name}` : undefined}
      >
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
          <div className="field">
            <span className="field-label">Cor no gráfico</span>
            <div className="color-grid" role="radiogroup" aria-label="Cor">
              {categoryColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  className={`color-dot${effectiveInvColor === c ? ' color-dot--selected' : ''}`}
                  style={{ background: c, color: c }}
                  onClick={() => setNewInvColor(c)}
                  aria-checked={effectiveInvColor === c}
                >
                  {effectiveInvColor === c && <Check size={15} color={ACCENT_FOREGROUND} />}
                </button>
              ))}
            </div>
          </div>
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
    </section>
  );
}
