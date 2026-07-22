import { increment, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import type { AccountEffect } from './financeCalculations';

// Módulo-folha de propósito: `cardService.ts` já importa de `financeService.ts`
// (era a origem de `applyAccountEffectsToBatch`). Se `financeService.ts` também
// importasse de `cardService.ts` (necessário pra reaproveitar `addCardPurchaseToBatch`
// em `payBill`/`recordRecurringPayment`), os dois módulos formariam um ciclo de import
// ESM. Extrair essa função pra cá (sem depender de nenhum dos dois) quebra o ciclo.

function accountDocRef(workspaceId: string, accountId: string) {
  return doc(getFirebaseDb(), 'workspaces', workspaceId, 'accounts', accountId);
}

/** Aplica os deltas de saldo (ver `transactionAccountEffects`) num batch já existente —
 * `increment()` é atômico no servidor, funciona offline igual o resto do batch. */
export function applyAccountEffectsToBatch(
  batch: ReturnType<typeof writeBatch>,
  workspaceId: string,
  effects: AccountEffect[]
) {
  for (const effect of effects) {
    batch.update(accountDocRef(workspaceId, effect.accountId), {
      currentBalanceCents: increment(effect.deltaCents),
      updatedAt: serverTimestamp()
    });
  }
}
