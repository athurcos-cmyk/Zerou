import type { Account, Category, Transaction } from '../types/contracts';
import { transactionTypeLabels } from './financeLabels';

const BOM = '﻿';

function brlAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2).replace('.', ',');
}

function escapeCsvField(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function transactionsToCsv(
  transactions: Transaction[],
  categoryMap: Map<string, Category>,
  accountMap: Map<string, Account>,
): string {
  const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Tags'].join(';');

  const rows = transactions.map((t) => {
    const date = t.date.toDate().toLocaleDateString('pt-BR');
    const type = transactionTypeLabels[t.type] ?? t.type;
    const category = t.categoryId ? (categoryMap.get(t.categoryId)?.name ?? '') : '';
    const account = t.accountId ? (accountMap.get(t.accountId)?.name ?? '') : '';
    const value = brlAmount(t.amountCents);
    const tags = (t.tags ?? []).join(', ');

    return [
      escapeCsvField(date),
      escapeCsvField(type),
      escapeCsvField(t.description),
      escapeCsvField(category),
      escapeCsvField(account),
      escapeCsvField(value),
      escapeCsvField(tags),
    ].join(';');
  });

  return BOM + [header, ...rows].join('\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
