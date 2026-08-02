import { useState, type FormEvent } from 'react';
import { Building2, ChevronDown, Eye, EyeOff, Scale, Star, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { AccountReconcileSheet } from '../finance/AccountReconcileSheet';
import { findBankInstitution, searchBankInstitutions, type BankInstitution } from '../finance/bankInstitutions';
import type { AccountBalance } from '../finance/financeCalculations';
import { accountTypeLabels } from '../finance/financeLabels';
import { accountHasLiveTransactions, createAccount, deleteAccount, setAccountExcludeFromTotals, setPrimaryAccount, unsetPrimaryAccount } from '../finance/financeService';
import { accountTypes } from '../finance/financeSchemas';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import type { AccountType } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function AccountsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceContext();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [openingBalance, setOpeningBalance] = useState('');
  const [excludeFromTotals, setExcludeFromTotals] = useState(false);
  // Mensagem com tom: erros em vermelho (padrão), sucesso (ex.: acerto de saldo) em verde.
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);
  const showError = (text: string) => setMessage({ text, tone: 'danger' });
  const [formOpen, setFormOpen] = useState(false);
  // Enquanto a conferência de lançamentos roda, o botão da conta fica travado — a leitura
  // vai ao servidor e demora o suficiente pra dar dois cliques.
  const [deleteProbeAccountId, setDeleteProbeAccountId] = useState<string | null>(null);
  const [reconcileAccount, setReconcileAccount] = useState<AccountBalance | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const suggestions = searchBankInstitutions(name, name.trim() ? 6 : 8);
  const syncStatusByAccountId = new Map(finance.accounts.map((account) => [account.id, account.localSyncStatus]));
  // O badge do topo é o mesmo número do "Saldo total" do Dashboard: só conta que conta como
  // dinheiro. As contas "fora do saldo" continuam na lista abaixo, com o próprio saldo.
  const totalBalance = finance.accountBalances
    .filter((a) => !a.excludeFromTotals)
    .reduce((sum, a) => sum + a.balanceCents, 0);
  const excludedBalance = finance.accountBalances
    .filter((a) => a.excludeFromTotals)
    .reduce((sum, a) => sum + a.balanceCents, 0);
  const hasExcludedAccount = finance.accountBalances.some((a) => a.excludeFromTotals);

  function selectInstitution(institution: BankInstitution) {
    setName(institution.name);
    setType(institution.suggestedType);
  }

  function handleTogglePrimary(accountId: string, isPrimary: boolean) {
    if (!workspaceId) {
      return;
    }

    if (isPrimary) {
      unsetPrimaryAccount(workspaceId, accountId).catch((error) =>
        showError(getUserFacingErrorMessage(error, 'Não foi possível atualizar a conta principal agora.'))
      );
      return;
    }

    const currentPrimaryId = finance.accountBalances.find((account) => account.isPrimary)?.id ?? null;
    setPrimaryAccount(workspaceId, accountId, currentPrimaryId).catch((error) =>
      showError(getUserFacingErrorMessage(error, 'Não foi possível atualizar a conta principal agora.'))
    );
  }

  function handleToggleExcludeFromTotals(accountId: string, isExcluded: boolean) {
    if (!workspaceId) {
      return;
    }

    setAccountExcludeFromTotals(workspaceId, accountId, !isExcluded).catch((error) =>
      showError(getUserFacingErrorMessage(error, 'Não foi possível atualizar a conta agora.'))
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      showError('Conclua seu cadastro inicial antes de criar contas.');
      return;
    }

    createAccount(workspaceId, user.uid, {
      name,
      type,
      openingBalanceCents: parseMoneyToCents(openingBalance),
      excludeFromTotals
    }).catch((error) => showError(getUserFacingErrorMessage(error, 'Não foi possível criar a conta agora.')));
    setName('');
    setType('checking');
    setOpeningBalance('');
    setExcludeFromTotals(false);
    setFormOpen(false);
  }

  async function handleDeleteAccount(accountId: string, accountName: string) {
    if (!workspaceId) {
      return;
    }

    const hasBills = finance.bills.some((bill) => bill.accountId === accountId && bill.status !== 'cancelled');
    const hasRecurringRules = finance.recurringRules.some((rule) => rule.accountId === accountId && rule.isActive);

    if (hasBills || hasRecurringRules) {
      showError(
        `Não dá para excluir "${accountName}" ainda. Ela está ligada a contas a pagar ou recorrências. Remova ou altere esses vínculos primeiro.`
      );
      return;
    }

    // Pergunta ao servidor em vez de olhar `finance.transactions`: aquela lista é a janela
    // das 300 transações mais recentes do workspace, e uma conta antiga passava por vazia.
    // `deleteAccount` é irreversível, então na dúvida (erro de rede) não deixamos seguir.
    setDeleteProbeAccountId(accountId);
    let hasTransactions: boolean;
    try {
      hasTransactions = await accountHasLiveTransactions(workspaceId, accountId);
    } catch (error) {
      showError(getUserFacingErrorMessage(error, 'Não foi possível conferir os lançamentos desta conta agora. Tente de novo.'));
      return;
    } finally {
      setDeleteProbeAccountId(null);
    }

    if (hasTransactions) {
      showError(
        `Não dá para excluir "${accountName}" ainda. Ela está ligada a lançamentos. Remova ou altere esses vínculos primeiro.`
      );
      return;
    }

    const ok = await confirm({
      title: `Excluir "${accountName}"?`,
      message: 'Como ela não tem histórico ligado, a Granativa vai apagar essa conta financeira do banco de dados.',
      confirmLabel: 'Excluir',
      danger: true
    });

    if (!ok) {
      return;
    }

    setMessage(null);
    deleteAccount(workspaceId, accountId).catch((error) =>
      showError(getUserFacingErrorMessage(error, 'Não foi possível excluir a conta agora.'))
    );
  }

  return (
    <section className="page-content">
      <div className="page-heading-row page-heading-row--tight">
        <div>
          <p className="eyebrow">Pessoal</p>
          <h1 className="page-title page-title--compact">Contas</h1>
        </div>
        {finance.accountBalances.length > 0 && (
          <span className="page-badge">{formatMoney(totalBalance)}</span>
        )}
      </div>

      <FormMessage type={message?.tone}>{message?.text}</FormMessage>

      {finance.accountBalances.length > 1 && (
        <p className="settings-hint">
          Marque uma conta principal (<Star size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />) — é nela que a Vic
          debita ou credita pelo WhatsApp quando a mensagem não deixa clara a conta.
        </p>
      )}

      {hasExcludedAccount && (
        <p className="settings-hint">
          O total acima não inclui {formatMoney(excludedBalance)} em contas fora do saldo
          (<EyeOff size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />) — elas também
          não entram na Análise nem no Comprometido.
        </p>
      )}

      {finance.loading ? (
        <LoadingState compact />
      ) : finance.accountBalances.length > 0 ? (
        <div className="account-card-list">
          {finance.accountBalances.map((account) => {
            const institution = findBankInstitution(account.name);
            return (
              <div className="account-card-hero" key={account.id}>
                <div className="account-card-hero-inner">
                  <div className="account-card-hero-header">
                    <div>
                      <span className="account-card-hero-eyebrow-row">
                        <span className="account-card-hero-eyebrow">{accountTypeLabels[account.type]}</span>
                        {account.excludeFromTotals && (
                          <span className="account-card-hero-flag">Fora do saldo</span>
                        )}
                      </span>
                      <strong className="account-card-hero-name">{account.name}</strong>
                    </div>
                    <BankMark institution={institution} />
                  </div>
                  <strong className={`account-card-hero-balance${account.excludeFromTotals ? ' account-card-hero-balance--muted' : ''}`}>
                    {formatMoney(account.balanceCents)}
                  </strong>
                </div>
                <div className="account-card-hero-footer">
                  <SyncStatusBadge status={syncStatusByAccountId.get(account.id) ?? 'synced'} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Acertar saldo de ${account.name} com o banco`}
                      title="Acertar saldo com o banco"
                      onClick={() => setReconcileAccount(account)}
                    >
                      <Scale size={17} aria-hidden="true" />
                    </button>
                    <button
                      className={`icon-button icon-button--excluded${account.excludeFromTotals ? ' is-active' : ''}`}
                      type="button"
                      aria-pressed={account.excludeFromTotals === true}
                      aria-label={
                        account.excludeFromTotals
                          ? `${account.name} está fora do saldo total. Clique para voltar a contar.`
                          : `Deixar ${account.name} fora do saldo total e das análises`
                      }
                      title={account.excludeFromTotals ? 'Fora do saldo e das análises' : 'Não contar no saldo nem nas análises'}
                      onClick={() => handleToggleExcludeFromTotals(account.id, account.excludeFromTotals === true)}
                    >
                      {account.excludeFromTotals ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                    </button>
                    <button
                      className={`icon-button icon-button--star${account.isPrimary ? ' is-active' : ''}`}
                      type="button"
                      aria-pressed={account.isPrimary === true}
                      aria-label={
                        account.isPrimary
                          ? `${account.name} é a conta principal. Clique para desmarcar.`
                          : `Definir ${account.name} como conta principal`
                      }
                      title={account.isPrimary ? 'Conta principal' : 'Definir como conta principal'}
                      onClick={() => handleTogglePrimary(account.id, account.isPrimary === true)}
                    >
                      <Star size={17} aria-hidden="true" fill={account.isPrimary ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Excluir ${account.name}`}
                      disabled={deleteProbeAccountId !== null}
                      onClick={() => void handleDeleteAccount(account.id, account.name)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          illustration="wallet"
          title="Nenhuma conta ainda"
          description="Adicione sua primeira conta financeira — banco, carteira ou poupança — para começar a registrar seu dinheiro."
        />
      )}

      <form className="surface surface-pad form-stack" onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="form-accordion-toggle"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
        >
          <div>
            <p className="eyebrow">Nova conta</p>
            <h2 style={{ margin: 0 }}>Adicionar conta financeira</h2>
          </div>
          <ChevronDown
            size={20}
            aria-hidden="true"
            style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-normal)', flexShrink: 0, color: 'var(--text-secondary)' }}
          />
        </button>
        {formOpen && (
          <>
            <FormMessage type={message?.tone}>{message?.text}</FormMessage>
            <label className="field">
              <span>Nome</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nubank, Carteira, Poupança" />
            </label>
            <div className="bank-picker" aria-label="Sugestões de instituições">
              <span className="field-label">{name.trim() ? 'Encontramos estas opções' : 'Sugestões rápidas'}</span>
              <div className="bank-suggestion-grid">
                {suggestions.map((institution) => (
                  <button
                    className="bank-suggestion"
                    type="button"
                    key={institution.id}
                    onClick={() => selectInstitution(institution)}
                  >
                    <BankMark institution={institution} />
                    <span>{institution.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <SelectField
              label="Tipo"
              value={type}
              onChange={(v) => setType(v as AccountType)}
              options={accountTypes.filter((t) => t !== 'investment').map((t) => ({ value: t, label: accountTypeLabels[t] }))}
            />
            <label className="field">
              <span>Saldo inicial</span>
              <input className="input" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0,00" />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={excludeFromTotals}
                onChange={(event) => setExcludeFromTotals(event.target.checked)}
              />
              <span>
                Não contar no saldo nem nas análises
                <br />
                <span className="text-muted">
                  Para vale-refeição, vale-alimentação ou cartão presente — dinheiro que existe, mas
                  não se mistura com o resto. Você continua lançando gastos nela normalmente.
                </span>
              </span>
            </label>
            <button className="button button--primary" type="submit">
              Criar conta
            </button>
          </>
        )}
      </form>

      <AccountReconcileSheet
        open={reconcileAccount !== null}
        workspaceId={workspaceId}
        userId={user?.uid}
        account={reconcileAccount}
        onClose={() => setReconcileAccount(null)}
        onApplied={(deltaCents) => {
          const name = reconcileAccount?.name ?? 'a conta';
          const verb = deltaCents > 0 ? 'receita' : 'despesa';
          setMessage({
            text: `Saldo acertado — lançamos uma ${verb} de acerto de ${formatMoney(Math.abs(deltaCents))} em ${name}.`,
            tone: 'success'
          });
        }}
      />

      {confirmDialog}
    </section>
  );
}

function BankMark({ institution }: { institution: BankInstitution | null }) {
  const className = [
    'bank-mark',
    institution ? `bank-mark--${institution.id}` : 'bank-mark--generic',
    institution?.logoPath ? 'bank-mark--has-logo' : ''
  ].filter(Boolean).join(' ');

  return (
    <span className={className} aria-hidden="true">
      {institution?.logoPath ? (
        <img className="bank-mark__logo" src={institution.logoPath} alt="" loading="lazy" />
      ) : institution ? (
        <span className="bank-mark__text">{institution.initials}</span>
      ) : (
        <Building2 size={16} />
      )}
    </span>
  );
}
