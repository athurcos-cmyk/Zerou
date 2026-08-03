import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Building2, Eye, EyeOff, Plus, Scale, Star, Trash2 } from 'lucide-react';
import { BottomSheet } from '../components/BottomSheet';
import { useAuth } from '../auth/AuthContext';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { SelectField } from '../components/SelectField';
import { FormMessage } from '../components/FormMessage';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { AccountReconcileSheet } from '../finance/AccountReconcileSheet';
import { findBankInstitution, searchBankInstitutions, type BankInstitution } from '../finance/bankInstitutions';
import { buildUpcomingCommitments, type AccountBalance } from '../finance/financeCalculations';
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
  const [excludeTarget, setExcludeTarget] = useState<AccountBalance | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  /** Quanto do Comprometido some se `excludeTarget` sair do saldo.
   *
   * Calculado chamando a função REAL (`buildUpcomingCommitments`) duas vezes e tirando a
   * diferença — nunca reimplementando a regra aqui. Reescrever o filtro daria uma prévia que
   * começa certa e sai de sincronia no dia em que a regra mudar, que é exatamente o tipo de drift
   * silencioso que este projeto já pagou caro (ver a trava anti-drift de `signedCharge` vs.
   * `calculateInvoice` em `spendingAnalysis`).
   *
   * `invoices`/`cards` vão vazios de propósito: fatura de cartão **não** é afetada por conta fora
   * do saldo (cartão não é conta, e `card_purchase` nem grava `accountId`), então ela se cancela
   * na subtração. Se um dia a exclusão passar a mexer em fatura, esta prévia passa a subestimar —
   * por isso o acoplamento está escrito aqui. */
  const excludeImpact = useMemo(() => {
    if (!excludeTarget) return null;
    const semConta = finance.excludedAccountIds;
    const comConta = new Set([...semConta, excludeTarget.id]);
    const total = (set: ReadonlySet<string>) =>
      buildUpcomingCommitments(finance.bills, finance.recurringRules, [], [], finance.transactions, set);
    const antes = total(semConta);
    const depois = total(comConta);
    const soma = (list: ReturnType<typeof buildUpcomingCommitments>) =>
      list.reduce((sum, c) => sum + c.amountCents, 0);
    return {
      committedCents: soma(antes) - soma(depois),
      linhas: antes.length - depois.length
    };
  }, [excludeTarget, finance.excludedAccountIds, finance.bills, finance.recurringRules, finance.transactions]);
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

  /** Tirar uma conta do saldo tem efeito MUITO maior do que o ícone de olho sugere: além do Saldo
   * total, ela sai da Análise, dos alertas de orçamento, da Projeção e do **Comprometido** — e é o
   * Comprometido que assusta, porque toda conta a pagar e toda recorrência debitada nela somem
   * junto (`buildUpcomingCommitments`). Achado pelo dono ao vivo (03/08/2026) marcando o Nubank:
   * o Comprometido caiu R$ 1.700,67 sem nada na tela dizendo por quê.
   *
   * A explicação existia, mas só era renderizada quando `hasExcludedAccount` já era verdadeiro —
   * ou seja, aparecia **depois** de a pessoa levar o susto. E o `title`/`aria-label` do botão não
   * conta: num app mobile-first não existe hover. Mesma correção que a tela de contas recebeu em
   * 02/08 (`.pay-preview`): dizer o efeito, com número real, ANTES de acontecer.
   *
   * Só a exclusão pede confirmação. Voltar a contar é restaurador — não surpreende ninguém. */
  function handleToggleExcludeFromTotals(account: AccountBalance) {
    if (!workspaceId) return;

    if (account.excludeFromTotals) {
      setAccountExcludeFromTotals(workspaceId, account.id, false).catch((error) =>
        showError(getUserFacingErrorMessage(error, 'Não foi possível atualizar a conta agora.'))
      );
      return;
    }

    setExcludeTarget(account);
  }

  function confirmExcludeFromTotals() {
    const account = excludeTarget;
    if (!workspaceId || !account) return;
    setExcludeTarget(null);
    setAccountExcludeFromTotals(workspaceId, account.id, true).catch((error) =>
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

  function openCreateSheet() {
    setMessage(null);
    setFormOpen(true);
  }

  function closeCreateSheet() {
    setFormOpen(false);
    setMessage(null);
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
        <div className="page-heading-actions">
          <button className="button button--subtle page-action-button" type="button" onClick={openCreateSheet}>
            <Plus size={15} aria-hidden="true" /> Nova conta
          </button>
        </div>
      </div>

      <FormMessage type={message?.tone}>{message?.text}</FormMessage>

      {/* O saldo total era um `.page-badge` (pílula pequena ao lado do título) — o número
          mais importante da tela ficava menor que qualquer saldo de conta na lista abaixo.
          Virou faixa de resumo, com o dinheiro fora do saldo do lado quando existe. */}
      {finance.accountBalances.length > 0 && (
        <div className="summary-hero summary-hero--plain reveal">
          <div className="summary-hero-inner">
            <div className="summary-hero-stat">
              <span className="summary-hero-eyebrow">Saldo total</span>
              <strong className="summary-hero-value summary-hero-value--lead">{formatMoney(totalBalance)}</strong>
              <span className="summary-hero-note">
                {finance.accountBalances.length} conta{finance.accountBalances.length !== 1 ? 's' : ''}
              </span>
            </div>
            {hasExcludedAccount && (
              <div className="summary-hero-stat">
                <span className="summary-hero-eyebrow">Fora do saldo</span>
                <strong className="summary-hero-value summary-hero-value--muted">{formatMoney(excludedBalance)}</strong>
                <span className="summary-hero-note">não entra na Análise</span>
              </div>
            )}
          </div>
        </div>
      )}

      {finance.accountBalances.length > 1 && (
        <p className="settings-hint">
          Marque uma conta principal (<Star size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />) — é nela que a Vic
          debita ou credita pelo WhatsApp quando a mensagem não deixa clara a conta.
        </p>
      )}

      {/* Antes esta dica só existia quando `hasExcludedAccount` já era true — a explicação chegava
          DEPOIS do susto. Agora ela aparece sempre que há conta na tela, porque o botão de olho
          está visível desde a primeira conta e é ele que precisa ser entendido antes do toque. */}
      {finance.accountBalances.length > 0 && (
        <p className="settings-hint">
          Conta fora do saldo (<EyeOff size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />) continua com o
          saldo dela aqui e nos lançamentos, mas some do Saldo total, da Análise e do Comprometido.
          É pra vale-refeição ou cartão presente — não pra conta do dia a dia.
        </p>
      )}

      {finance.loading ? (
        <LoadingState compact />
      ) : finance.accountBalances.length > 0 ? (
        <div className="account-card-list">
          {finance.accountBalances.map((account, index) => {
            const institution = findBankInstitution(account.name);
            return (
              <div
                className="account-card-hero reveal"
                key={account.id}
                style={{ '--reveal-i': Math.min(index + 1, 8) } as CSSProperties}
              >
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
                      onClick={() => handleToggleExcludeFromTotals(account)}
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
          action={
            <button className="button button--primary button--compact" type="button" onClick={openCreateSheet}>
              <Plus size={16} aria-hidden="true" /> Criar primeira conta
            </button>
          }
        />
      )}

      {/* Antes era um `.form-accordion-toggle` no fim da página: um card inteiro ocupado só
          pelo título "Adicionar conta financeira", que a pessoa tinha que rolar até o fim pra
          achar. Virou sheet acionado pelo "+ Nova conta" do cabeçalho (02/08/2026). */}
      <BottomSheet
        open={formOpen}
        onClose={closeCreateSheet}
        title="Nova conta financeira"
        subtitle="Banco, carteira ou poupança"
      >
        <form className="form-stack" onSubmit={handleSubmit}>
          <FormMessage type={message?.tone}>{message?.text}</FormMessage>
          <label className="field">
            <span>Nome</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nubank, Carteira, Poupança" autoFocus />
          </label>
          {/* Mesma regra do picker de serviços em `BillsPage.tsx` (03/08/2026): o estado ocioso
              ("Sugestões rápidas", 8 bancos fixos) custava 239px numa folha que escondia 155 —
              sem ele a folha inteira cabe sem rolagem. O filtro depois de digitar fica, e é ele
              que preenche o tipo da conta junto com o nome (`selectInstitution`). */}
          {name.trim().length > 0 && suggestions.length > 0 && (
          <div className="bank-picker" aria-label="Sugestões de instituições">
            <span className="field-label">Encontramos estas opções</span>
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
          )}
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
          <div className="sheet-actions">
            <button className="button button--primary" type="submit">
              Criar conta
            </button>
          </div>
        </form>
      </BottomSheet>

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

      {/* Prévia do efeito antes de tirar a conta do saldo — mesmo padrão (`.pay-preview`) da sheet
          de "Já foi paga". O número do Comprometido sai da função real, não de uma cópia da regra. */}
      <BottomSheet
        open={excludeTarget !== null}
        onClose={() => setExcludeTarget(null)}
        title={`Tirar ${excludeTarget?.name ?? ''} do saldo?`}
        subtitle="Pra vale-refeição, vale-alimentação ou cartão presente"
      >
        <div className="form-stack">
          <p className="pay-preview">
            {excludeTarget ? (
              <>
                O Saldo total cai <strong>{formatMoney(excludeTarget.balanceCents)}</strong>
                {excludeImpact && excludeImpact.committedCents > 0 ? (
                  <>
                    {' '}e o <strong>Comprometido cai {formatMoney(excludeImpact.committedCents)}</strong> —{' '}
                    {excludeImpact.linhas} conta{excludeImpact.linhas !== 1 ? 's' : ''} e assinatura
                    {excludeImpact.linhas !== 1 ? 's' : ''} que saem dessa conta deixam de ser contadas.
                  </>
                ) : (
                  <>. Nenhuma conta a pagar ou assinatura sai dessa conta, então o Comprometido não muda.</>
                )}
              </>
            ) : null}
          </p>
          <p className="text-secondary" style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
            Nada é apagado: o saldo continua aparecendo aqui, os lançamentos seguem no Extrato e a conta
            continua nos seletores. Dá pra voltar atrás a qualquer momento no mesmo botão.
          </p>
          <div className="sheet-actions">
            <button className="button button--primary" type="button" onClick={confirmExcludeFromTotals}>
              Tirar do saldo
            </button>
            <button className="button button--ghost" type="button" onClick={() => setExcludeTarget(null)}>
              Cancelar
            </button>
          </div>
        </div>
      </BottomSheet>

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
