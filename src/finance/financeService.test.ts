import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn().mockReturnValue({ id: 'doc-ref' }),
  serverTimestamp: vi.fn().mockReturnValue('server-timestamp')
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: firestoreMocks.doc,
  updateDoc: firestoreMocks.updateDoc,
  serverTimestamp: firestoreMocks.serverTimestamp
}));

vi.mock('../firebase/config', () => ({
  getFirebaseDb: vi.fn().mockReturnValue({})
}));

const { markOverdueBills } = await import('./financeService');

function bill(id: string, status: 'pending' | 'paid' | 'overdue' | 'cancelled', daysFromToday: number) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + daysFromToday);
  return { id, status, dueDate: Timestamp.fromDate(dueDate) };
}

describe('markOverdueBills', () => {
  it('marca como overdue apenas bills pending com vencimento em dia anterior a hoje', () => {
    firestoreMocks.updateDoc.mockClear();

    markOverdueBills('workspace-1', [
      bill('past-pending', 'pending', -2),
      bill('today-pending', 'pending', 0),
      bill('future-pending', 'pending', 3),
      bill('past-paid', 'paid', -2),
      bill('past-already-overdue', 'overdue', -2),
      bill('past-cancelled', 'cancelled', -2)
    ]);

    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'overdue' })
    );
  });

  it('não escreve nada quando não há bill pending vencida', () => {
    firestoreMocks.updateDoc.mockClear();

    markOverdueBills('workspace-1', [bill('today-pending', 'pending', 0), bill('future-pending', 'pending', 1)]);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});
