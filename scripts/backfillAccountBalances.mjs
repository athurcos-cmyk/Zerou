#!/usr/bin/env node
// Recalcula `currentBalanceCents` do ZERO para toda conta de todo workspace, somando o
// histórico COMPLETO de transações (sem o limite de 300 que a UI usa) a partir de
// `openingBalanceCents`. Uso único — depois disso, `currentBalanceCents` é mantido
// incrementalmente a cada escrita (ver src/finance/financeService.ts).
//
// Mesma lógica de sinal que `transactionAccountEffects` (src/finance/financeCalculations.ts) —
// mantenha em sincronia manualmente se aquela mudar.
import { initAdminApp } from './backfillShared.mjs';

const CREDIT_LIKE = new Set(['income', 'refund', 'reimbursement']);
const DEBIT_LIKE = new Set(['expense', 'card_payment']);

function applyEffect(balances, accountId, deltaCents) {
  if (!accountId) return;
  balances.set(accountId, (balances.get(accountId) ?? 0) + deltaCents);
}

function accumulate(balances, txn) {
  if (txn.deletedAt) return;

  const { type, amountCents, accountId, destinationAccountId } = txn;

  if (CREDIT_LIKE.has(type)) {
    applyEffect(balances, accountId, amountCents);
  } else if (DEBIT_LIKE.has(type)) {
    applyEffect(balances, accountId, -amountCents);
  } else if (type === 'transfer') {
    applyEffect(balances, accountId, -amountCents);
    applyEffect(balances, destinationAccountId, amountCents);
  } else if (type === 'adjustment') {
    applyEffect(balances, accountId, amountCents);
  }
  // card_purchase: nunca afeta saldo de conta.
}

async function main() {
  const db = initAdminApp();
  const workspacesSnap = await db.collection('workspaces').get();
  console.log(`Recalculando saldo de conta em ${workspacesSnap.size} workspace(s)...`);

  let totalAccounts = 0;
  let totalChanged = 0;

  for (const workspaceDoc of workspacesSnap.docs) {
    const workspaceId = workspaceDoc.id;
    const accountsSnap = await db.collection(`workspaces/${workspaceId}/accounts`).get();
    if (accountsSnap.empty) continue;

    const balances = new Map();
    for (const accountDoc of accountsSnap.docs) {
      balances.set(accountDoc.id, accountDoc.data().openingBalanceCents ?? 0);
    }

    const transactionsSnap = await db.collection(`workspaces/${workspaceId}/transactions`).get();
    transactionsSnap.docs.forEach((doc) => accumulate(balances, doc.data()));

    let batch = db.batch();
    let batchSize = 0;

    for (const accountDoc of accountsSnap.docs) {
      const recalculated = balances.get(accountDoc.id) ?? 0;
      const previous = accountDoc.data().currentBalanceCents;
      totalAccounts++;

      if (previous !== recalculated) {
        totalChanged++;
        console.log(
          `  [${workspaceId}] conta ${accountDoc.id} (${accountDoc.data().name}): ${previous ?? '(vazio)'} -> ${recalculated}`
        );
      }

      batch.update(accountDoc.ref, { currentBalanceCents: recalculated, updatedAt: new Date() });
      batchSize++;

      if (batchSize >= 400) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }

    if (batchSize > 0) {
      await batch.commit();
    }
  }

  console.log(`Concluído: ${totalAccounts} conta(s) verificada(s), ${totalChanged} valor(es) corrigido(s)/definido(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
