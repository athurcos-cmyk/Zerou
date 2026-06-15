import type { AccountType, SyncStatus, TransactionType } from '../types/contracts';

export const accountTypeLabels: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  investment: 'Investimento',
  digital_wallet: 'Carteira digital',
  cash: 'Dinheiro',
  shared: 'Conta compartilhada'
};

export const transactionTypeLabels: Record<TransactionType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  adjustment: 'Ajuste',
  refund: 'Estorno',
  reimbursement: 'Reembolso',
  card_purchase: 'Compra no cartão',
  card_payment: 'Pagamento de fatura'
};

export const billStatusLabels = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado'
} as const;

export const recurringFrequencyLabels = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual'
} as const;

export const syncStatusLabels: Record<SyncStatus, string> = {
  pending: 'Pendente',
  synced: 'Sincronizado',
  failed: 'Falhou'
};
