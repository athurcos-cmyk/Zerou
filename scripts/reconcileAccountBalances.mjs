#!/usr/bin/env node
// DIAGNÓSTICO (somente leitura — NÃO escreve nada). Para cada conta de cada workspace,
// compara o `currentBalanceCents` gravado (mantido incrementalmente a cada escrita) com o
// valor recalculado do ZERO a partir de `openingBalanceCents` + o histórico COMPLETO de
// transações. Serve pra achar a origem de uma divergência "app vs banco":
//
//   • Se `gravado` == `recalculado` em toda conta → o app está INTERNAMENTE CONSISTENTE:
//     o saldo mostrado é exatamente openingBalance + a soma de tudo que você lançou.
//     Nesse caso a diferença pro banco NÃO é bug de cálculo — é (a) saldo de abertura
//     digitado errado, (b) algo que o banco credita/debita e você não lançou (rendimento
//     automático, cashback, arredondamento, estorno de tarifa), ou (c) uma transação com
//     valor digitado errado.
//   • Se `gravado` != `recalculado` em alguma conta → o campo incremental DERIVOU do
//     histórico real. Aí sim é bug de código (efeito aplicado sem transação, transação
//     sem efeito, ou efeito dobrado). O `delta` mostra o tamanho exato.
//
// Mesma lógica de sinal de `transactionAccountEffects` (src/finance/financeCalculations.ts)
// e de `backfillAccountBalances.mjs` — mantenha em sincronia se aquela mudar.
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

const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main() {
  const db = initAdminApp();
  const workspacesSnap = await db.collection('workspaces').get();
  console.log(`Reconciliando saldo de conta em ${workspacesSnap.size} workspace(s)... (somente leitura)\n`);

  let totalAccounts = 0;
  let totalMismatches = 0;

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

    for (const accountDoc of accountsSnap.docs) {
      const data = accountDoc.data();
      const recalculated = balances.get(accountDoc.id) ?? 0;
      const stored = data.currentBalanceCents ?? data.openingBalanceCents ?? 0;
      const delta = stored - recalculated;
      totalAccounts++;

      const mark = delta === 0 ? 'OK ' : '>>>';
      console.log(
        `${mark} [${workspaceId}] ${data.name}\n` +
        `      abertura=${brl(data.openingBalanceCents ?? 0)}  ` +
        `recalculado=${brl(recalculated)}  gravado(app)=${brl(stored)}  ` +
        `delta=${brl(delta)}`
      );
      if (delta !== 0) totalMismatches++;
    }
  }

  console.log(`\nConcluído: ${totalAccounts} conta(s) verificada(s), ${totalMismatches} divergência(s) interna(s).`);
  if (totalMismatches === 0) {
    console.log('→ App consistente. A diferença pro banco NÃO é bug de cálculo (ver cabeçalho do script).');
  } else {
    console.log('→ Há divergência interna: o campo incremental derivou do histórico. É bug de código.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
