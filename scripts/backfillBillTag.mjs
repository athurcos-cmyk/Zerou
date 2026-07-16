#!/usr/bin/env node
// Renomeia a tag 'bill' (inglês, só aparecia internamente) para 'conta' em toda transação
// já existente. `payBill` (src/finance/financeService.ts) já grava 'conta' desde a correção —
// este script é só pra transações criadas ANTES da correção existir. Uso único.
import { initAdminApp } from './backfillShared.mjs';

async function main() {
  const db = initAdminApp();
  const workspacesSnap = await db.collection('workspaces').get();
  console.log(`Verificando ${workspacesSnap.size} workspace(s)...`);

  let totalUpdated = 0;

  for (const workspaceDoc of workspacesSnap.docs) {
    const workspaceId = workspaceDoc.id;
    const txnsSnap = await db
      .collection(`workspaces/${workspaceId}/transactions`)
      .where('tags', 'array-contains', 'bill')
      .get();

    if (txnsSnap.empty) continue;

    const batch = db.batch();
    for (const doc of txnsSnap.docs) {
      const tags = doc.data().tags ?? [];
      const newTags = tags.map((tag) => (tag === 'bill' ? 'conta' : tag));
      batch.update(doc.ref, { tags: newTags, updatedAt: new Date() });
    }
    await batch.commit();
    totalUpdated += txnsSnap.size;
    console.log(`  [${workspaceId}] ${txnsSnap.size} transação(ões) atualizada(s).`);
  }

  console.log(`Concluído: ${totalUpdated} transação(ões) com tag 'bill' renomeada(s) para 'conta'.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
