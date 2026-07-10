import { describe, expect, it } from 'vitest';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { readSnapshotDoc } from './snapshotData';

/**
 * Emula o contrato do SDK do Firestore: um `serverTimestamp()` ainda não confirmado sai
 * como `null` com as opções padrão, e como uma estimativa local com `'estimate'`.
 */
function snapshotWithPendingTimestamp(pendingValue: Date) {
  return {
    id: 'txn-1',
    data: (options?: { serverTimestamps?: 'estimate' | 'previous' | 'none' }) => ({
      id: 'txn-1',
      description: 'Compra no cartão',
      deletedAt: options?.serverTimestamps === 'estimate' ? pendingValue : null
    })
  } as unknown as DocumentSnapshot<DocumentData>;
}

describe('readSnapshotDoc', () => {
  // Regressão: `softDeleteTransaction` grava `deletedAt: serverTimestamp()`. Lendo o
  // snapshot com as opções padrão, o campo vinha `null` até o servidor confirmar — então,
  // offline, excluir uma transação não a tirava do Extrato e a compra no cartão continuava
  // somando na fatura. Num app offline-first isso é a UI desfazendo a ação do usuário.
  it('surfaces a pending serverTimestamp as a local estimate instead of null', () => {
    const pendingDeletion = new Date('2026-07-11T09:00:00');
    const doc = readSnapshotDoc<{ id: string; deletedAt: Date | null }>(
      snapshotWithPendingTimestamp(pendingDeletion)
    );

    expect(doc.deletedAt).toEqual(pendingDeletion);
  });

  it('keeps the document id alongside the fields', () => {
    const doc = readSnapshotDoc<{ id: string; description: string }>(
      snapshotWithPendingTimestamp(new Date())
    );

    expect(doc.id).toBe('txn-1');
    expect(doc.description).toBe('Compra no cartão');
  });
});
