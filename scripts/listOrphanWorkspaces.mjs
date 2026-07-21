#!/usr/bin/env node
// Lista workspaces órfãos — workspaces cujo ownerUserId não existe mais no Firestore
// (users/{ownerUserId}) ou no Firebase Auth. Use --fix para deletar os órfãos.
//
// Uso:
//   node scripts/listOrphanWorkspaces.mjs              # só lista
//   node scripts/listOrphanWorkspaces.mjs --fix        # lista e deleta
//
// Precisa de serviceAccountKey.json na raiz (ver scripts/backfillShared.mjs).

import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = process.env.SERVICE_ACCOUNT_KEY_PATH || path.join(__dirname, '..', 'serviceAccountKey.json');

// ─── Init ──────────────────────────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error(`Não foi possível ler a service account em ${keyPath}.`);
  console.error('Baixe em: https://console.firebase.google.com/project/zerou-26757/settings/serviceaccounts/adminsdk');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();
const shouldFix = process.argv.includes('--fix');

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 Buscando workspaces...\n');

  const workspacesSnap = await db.collection('workspaces').get();
  const total = workspacesSnap.size;
  console.log(`${total} workspaces encontrados. Verificando owners...\n`);

  const orphans = [];
  const checked = [];

  for (const doc of workspacesSnap.docs) {
    const ws = doc.data();
    const ownerId = ws.ownerUserId;

    if (!ownerId) {
      console.log(`⚠️  ${doc.id} — sem ownerUserId (pulando)`);
      continue;
    }

    checked.push({ id: doc.id, ownerId, type: ws.type, name: ws.name, createdAt: ws.createdAt?.toDate?.() });

    // Check 1: Firestore user document
    const userDoc = await db.doc(`users/${ownerId}`).get();
    const existsInFirestore = userDoc.exists;

    // Check 2: Firebase Auth
    let existsInAuth = false;
    try {
      await auth.getUser(ownerId);
      existsInAuth = true;
    } catch {
      // User doesn't exist in Auth
    }

    if (!existsInFirestore && !existsInAuth) {
      orphans.push({
        id: doc.id,
        ownerId,
        type: ws.type || '?',
        name: ws.name || '(sem nome)',
        createdAt: ws.createdAt?.toDate?.() || null,
        reason: 'Firestore E Auth',
      });
    } else if (!existsInFirestore) {
      orphans.push({
        id: doc.id,
        ownerId,
        type: ws.type || '?',
        name: ws.name || '(sem nome)',
        createdAt: ws.createdAt?.toDate?.() || null,
        reason: 'Firestore',
      });
    } else if (!existsInAuth) {
      orphans.push({
        id: doc.id,
        ownerId,
        type: ws.type || '?',
        name: ws.name || '(sem nome)',
        createdAt: ws.createdAt?.toDate?.() || null,
        reason: 'Auth',
      });
    }
  }

  // ─── Report ────────────────────────────────────────────────────────────────
  if (orphans.length === 0) {
    console.log('✅ Nenhum workspace órfão encontrado.');
    return;
  }

  console.log(`🟡 ${orphans.length} workspaces órfãos encontrados:\n`);
  console.log('ID'.padEnd(50) + 'Tipo'.padEnd(12) + 'Owner'.padEnd(35) + 'Criado em'.padEnd(26) + 'Falta');
  console.log('-'.repeat(130));

  for (const o of orphans) {
    const date = o.createdAt ? o.createdAt.toISOString().slice(0, 10) : '(sem data)';
    console.log(
      o.id.padEnd(50) +
      o.type.padEnd(12) +
      o.ownerId.padEnd(35) +
      date.padEnd(26) +
      o.reason
    );
  }

  // ─── Fix ───────────────────────────────────────────────────────────────────
  if (shouldFix) {
    console.log(`\n🔧 --fix: deletando ${orphans.length} workspaces órfãos...\n`);

    for (const o of orphans) {
      try {
        await db.recursiveDelete(db.doc(`workspaces/${o.id}`));
        console.log(`  ✅ ${o.id}`);
      } catch (err) {
        console.error(`  ❌ ${o.id}: ${err.message}`);
      }
    }

    console.log('\n✅ Limpeza concluída.');
  } else {
    console.log(`\n💡 Rode com --fix para deletar esses ${orphans.length} workspaces.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
