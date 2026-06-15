import { useState, type FormEvent } from 'react';
import { Building2, Plus, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { findBankInstitution, searchBankInstitutions, type BankInstitution } from '../finance/bankInstitutions';
import { accountTypeLabels } from '../finance/financeLabels';
import { archiveAccount, createAccount } from '../finance/financeService';
import { accountTypes } from '../finance/financeSchemas';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { useFinanceData } from '../finance/useFinanceData';
import type { AccountType } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

export function AccountsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [openingBalance, setOpeningBalance] = useState('0,00');
  const [message, setMessage] = useState<string | null>(null);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);
  const suggestions = searchBankInstitutions(name, name.trim() ? 6 : 8);
  const syncStatusByAccountId = new Map(finance.accounts.map((account) => [account.id, account.localSyncStatus]));

  function selectInstitution(institution: BankInstitution) {
    setName(institution.name);
    setType(institution.suggestedType);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua seu cadastro inicial antes de criar contas.');
      return;
    }

    try {
      await createAccount(workspaceId, user.uid, {
        name,
        type,
        openingBalanceCents: parseMoneyToCents(openingBalance)
      });
      setName('');
      setType('checking');
      setOpeningBalance('0,00');
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível criar a conta agora.'));
    }
  }

  async function handleArchiveAccount(accountId: string, accountName: string) {
    if (!workspaceId) {
      return;
    }

    const hasTransactions = finance.transactions.some(
      (transaction) => transaction.accountId === accountId || transaction.destinationAccountId === accountId
    );
    const confirmed = window.confirm(
      hasTransactions
        ? `Excluir "${accountName}" da lista? Ela tem lançamentos no histórico, então a Zerou vai ocultar a conta para novos usos sem apagar os registros antigos.`
        : `Excluir "${accountName}" da lista de contas?`
    );

    if (!confirmed) {
      return;
    }

    setRemovingAccountId(accountId);
    setMessage(null);

    try {
      await archiveAccount(workspaceId, accountId);
      setMessage('Conta removida da lista.');
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível excluir a conta agora.'));
    } finally {
      setRemovingAccountId(null);
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Contas</p>
          <h1 className="page-title">Onde seu dinheiro está.</h1>
          <p className="page-description">Cadastre onde seu dinheiro fica: banco, carteira, poupança ou conta digital.</p>
        </div>
        <SyncStatusBadge status={finance.pendingWrites ? 'pending' : 'synced'} />
      </div>

      <div className="finance-grid">
        <form className="surface surface-pad form-stack" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nova conta</p>
              <h2>Adicionar conta financeira</h2>
            </div>
            <span className="empty-icon">
              <Plus size={20} aria-hidden="true" />
            </span>
          </div>
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
          <label className="field">
            <span>Tipo</span>
            <select className="select" value={type} onChange={(event) => setType(event.target.value as AccountType)}>
              {accountTypes.map((accountType) => (
                <option value={accountType} key={accountType}>
                  {accountTypeLabels[accountType]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Saldo inicial</span>
            <input className="input" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
          </label>
          <button className="button button--primary" type="submit">
            Criar conta
          </button>
        </form>

        <article className="surface surface-pad">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Saldos</p>
              <h2>Contas ativas</h2>
            </div>
            <Wallet size={22} aria-hidden="true" />
          </div>
          {finance.accountBalances.length > 0 ? (
            <div className="item-list">
              {finance.accountBalances.map((account) => (
                <div className="list-row" key={account.id}>
                  <div className="account-list-main">
                    <BankMark institution={findBankInstitution(account.name)} />
                    <div>
                      <strong>{account.name}</strong>
                      <span className="text-secondary">{accountTypeLabels[account.type]}</span>
                    </div>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(account.balanceCents)}</strong>
                    <SyncStatusBadge status={syncStatusByAccountId.get(account.id) ?? 'synced'} />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Excluir ${account.name}`}
                      disabled={removingAccountId === account.id}
                      onClick={() => void handleArchiveAccount(account.id, account.name)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-secondary">Nenhuma conta criada ainda.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function BankMark({ institution }: { institution: BankInstitution | null }) {
  return (
    <span className="bank-mark" aria-hidden="true">
      {institution ? institution.initials : <Building2 size={16} />}
    </span>
  );
}
