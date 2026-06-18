import type { InvoiceLedgerEntryType, InvoiceStatus } from '../types/contracts';

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  partial: 'Parcial',
  paid: 'Paga',
  overpaid: 'Com crédito',
  overdue: 'Vencida',
  renegotiated: 'Renegociada'
};

export const ledgerTypeLabels: Record<InvoiceLedgerEntryType, string> = {
  purchase: 'Compra',
  payment: 'Pagamento',
  advance_payment: 'Pagamento antecipado',
  refund_credit: 'Estorno',
  chargeback_credit: 'Chargeback',
  manual_credit: 'Crédito manual',
  manual_debit: 'Débito manual',
  interest: 'Juros',
  fine: 'Multa',
  iof: 'IOF',
  fee: 'Tarifa',
  installment_anticipation: 'Antecipação',
  installment_anticipation_credit: 'Crédito de antecipação'
};
