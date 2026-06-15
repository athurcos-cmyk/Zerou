import { useState, type FormEvent } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { accountTypeLabels } from '../finance/financeLabels';
import { createAccount } from '../finance/financeService';
import { accountTypes } from '../finance/financeSchemas';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { SyncStatusBadge } from '../finance/SyncStatusBadge';
import { useFinanceData } from '../finance/useFinanceData';
import type { AccountType } from '../types/contracts';

export function AccountsPage() {
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const finance = useFinanceData(workspaceId, user?.uid);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [openingBalance, setOpeningBalance] = useState('0,00');
  const [message, setMessage] = useState<string | null>(null);
  const syncStatusByAccountId = new Map(finance.accounts.map((account) => [account.id, account.localSyncStatus]));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!workspaceId || !user) {
      setMessage('Conclua o onboarding antes de criar contas.');
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
      setMessage(error instanceof Error ? error.message : 'Não foi possível criar a conta agora.');
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Contas</p>
          <h1 className="page-title">Onde seu dinheiro está.</h1>
          <p className="page-description">Crie contas financeiras com saldo inicial explícito e acompanhe o saldo derivado.</p>
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
                  <div>
                    <strong>{account.name}</strong>
                    <span className="text-secondary">{accountTypeLabels[account.type]}</span>
                  </div>
                  <div className="list-row-end">
                    <strong>{formatMoney(account.balanceCents)}</strong>
                    <SyncStatusBadge status={syncStatusByAccountId.get(account.id) ?? 'synced'} />
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
