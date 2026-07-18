import { useState, type FormEvent } from 'react';
import { Building2, ChevronDown, Star, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { findBankInstitution, searchBankInstitutions, type BankInstitution } from '../finance/bankInstitutions';
import { accountTypeLabels } from '../finance/financeLabels';
import { accountHasLiveTransactions, createAccount, deleteAccount, setPrimaryAccount, unsetPrimaryAccount } from '../finance/financeService';
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
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Enquanto a conferência de lançamentos roda, o botão da conta fica travado — a leitura
  // vai ao servidor e demora o suficiente pra dar dois cliques.
  const [deleteProbeAccountId, setDeleteProbeAccountId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const suggestions = searchBankInstitutions(name, name.trim() ? 6 : 8);
  const syncStatusByAccountId = new Map(finance.accounts.map((account) => [account.id, account.localSyncStatus]));
  const totalBalance = finance.accountBalances.reduce((sum, a) => sum + a.balanceCents, 0);

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
        setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar a conta principal agora.'))
      );
      return;
    }

    const currentPrimaryId = finance.accountBalances.find((account) => account.isPrimary)?.id ?? null;
    setPrimaryAccount(workspaceId, accountId, currentPrimaryId).catch((error) =>
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível atualizar a conta principal agora.'))
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar contas.');
      return;
    }

    createAccount(workspaceId, user.uid, {
      name,
      type,
      openingBalanceCents: parseMoneyToCents(openingBalance)
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a conta agora.')));
    setName('');
    setType('checking');
    setOpeningBalance('');
    setFormOpen(false);
  }

  async function handleDeleteAccount(accountId: string, accountName: string) {
    if (!workspaceId) {
      return;
    }

    const hasBills = finance.bills.some((bill) => bill.accountId === accountId && bill.status !== 'cancelled');
    const hasRecurringRules = finance.recurringRules.some((rule) => rule.accountId === accountId && rule.isActive);

    if (hasBills || hasRecurringRules) {
      setMessage(
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
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível conferir os lançamentos desta conta agora. Tente de novo.'));
      return;
    } finally {
      setDeleteProbeAccountId(null);
    }

    if (hasTransactions) {
      setMessage(
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
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível excluir a conta agora.'))
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

      <FormMessage>{message}</FormMessage>

      {finance.accountBalances.length > 1 && (
        <p className="settings-hint">
          Marque uma conta principal (<Star size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />) — é nela que a Grazi
          debita ou credita pelo WhatsApp quando a mensagem não deixa clara a conta.
        </p>
      )}

      {finance.accountBalances.length > 0 ? (
        <div className="account-card-list">
          {finance.accountBalances.map((account) => {
            const institution = findBankInstitution(account.name);
            return (
              <div className="account-card-hero" key={account.id}>
                <div className="account-card-hero-inner">
                  <div className="account-card-hero-header">
                    <div>
                      <span className="account-card-hero-eyebrow">{accountTypeLabels[account.type]}</span>
                      <strong className="account-card-hero-name">{account.name}</strong>
                    </div>
                    <BankMark institution={institution} />
                  </div>
                  <strong className="account-card-hero-balance">{formatMoney(account.balanceCents)}</strong>
                </div>
                <div className="account-card-hero-footer">
                  <SyncStatusBadge status={syncStatusByAccountId.get(account.id) ?? 'synced'} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
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
            style={{ transform: formOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, color: 'var(--text-secondary)' }}
          />
        </button>
        {formOpen && (
          <>
            <FormMessage>{message}</FormMessage>
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
              options={accountTypes.map((t) => ({ value: t, label: accountTypeLabels[t] }))}
            />
            <label className="field">
              <span>Saldo inicial</span>
              <input className="input" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0,00" />
            </label>
            <button className="button button--primary" type="submit">
              Criar conta
            </button>
          </>
        )}
      </form>

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
