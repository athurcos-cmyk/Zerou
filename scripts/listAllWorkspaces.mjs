#!/usr/bin/env node
// Lista TODOS os workspaces com status detalhado: tipo, owner, partner, membros ativos.
import { cert, initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = process.env.SERVICE_ACCOUNT_KEY_PATH || path.join(__dirname, '..', 'serviceAccountKey.json');

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const auth = getAuth();

async function userExists(uid) {
  if (!uid) return { exists: false, name: '(vazio)' };
  try {
    const u = await auth.getUser(uid);
    return { exists: true, name: u.displayName || u.email || uid };
  } catch {
    const doc = await db.doc(`users/${uid}`).get();
    if (doc.exists) return { exists: true, name: doc.data().name || uid, onlyFirestore: true };
    return { exists: false, name: uid };
  }
}

async function main() {
  const snap = await db.collection('workspaces').get();
  console.log(`${snap.size} workspaces:\n`);

  for (const doc of snap.docs) {
    const ws = doc.data();
    const owner = await userExists(ws.ownerUserId);
    const partner = await userExists(ws.partnerUserId || '');
    const created = ws.createdAt?.toDate?.()?.toISOString()?.slice(0, 10) || '?';

    const status = [];
    if (!owner.exists) status.push('🔴 owner não existe');
    else if (owner.onlyFirestore) status.push('🟡 owner só Firestore');
    else status.push('🟢 owner OK');

    if (ws.type === 'couple') {
      if (ws.partnerUserId && !partner.exists) status.push('🔴 partner não existe');
      else if (ws.partnerUserId && partner.onlyFirestore) status.push('🟡 partner só Firestore');
      else if (ws.partnerUserId) status.push('🟢 partner OK');
      else status.push('⚪ sem partner');
    }

    console.log(`${ws.id}`);
    console.log(`  tipo: ${ws.type} | criado: ${created} | membros: ${ws.activeMemberCount ?? '?'}`);
    console.log(`  owner: ${owner.name} [${ws.ownerUserId}]`);
    if (ws.type === 'couple') console.log(`  partner: ${partner.name} [${ws.partnerUserId || '(vazio)'}]`);
    console.log(`  status: ${status.join(' | ')}`);
    console.log();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
