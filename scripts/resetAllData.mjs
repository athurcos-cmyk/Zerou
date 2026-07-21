#!/usr/bin/env node
// ⚠️ Deleta TODOS os documentos de todas as coleções raiz.
// NÃO afeta Firebase Auth, Cloud Functions, ou regras do Firestore.
// Uso: node scripts/resetAllData.mjs

import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = process.env.SERVICE_ACCOUNT_KEY_PATH || path.join(__dirname, '..', 'serviceAccountKey.json');

const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();

const ROOT_COLLECTIONS = [
  'users',
  'workspaces',
  'whatsappProcessedMessages',
  'coupleInvites',
  'whatsappPhoneIndex',
  'privacyRequests',
];

async function main() {
  console.log('⚠️  Isso vai deletar TODOS os dados de TODAS as coleções.');
  console.log('   Firebase Auth NÃO será afetado.');
  console.log('   Tem 5 segundos pra cancelar (Ctrl+C)...\n');
  await new Promise(r => setTimeout(r, 5000));

  for (const col of ROOT_COLLECTIONS) {
    const snap = await db.collection(col).get();
    console.log(`\n📦 ${col}: ${snap.size} documentos`);

    if (snap.size === 0) continue;

    for (const doc of snap.docs) {
      try {
        await db.recursiveDelete(doc.ref);
        console.log(`  ✅ ${doc.id}`);
      } catch (err) {
        console.error(`  ❌ ${doc.id}: ${err.message}`);
      }
    }
  }

  console.log('\n✅ Reset completo.');
}

main().catch((err) => { console.error(err); process.exit(1); });
