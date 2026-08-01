// Seta custom claim admin:true no UID informado.
// Uso: node scripts/setAdminClaim.mjs "<UID>"
// Precisa de serviceAccountKey.json na raiz (gerar em Firebase Console > Contas de serviço).
// Roda UMA vez antes de deployar regras que exigem o claim.

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const uid = process.argv[2];
if (!uid) {
  console.error('Uso: node scripts/setAdminClaim.mjs "<UID>"');
  process.exit(1);
}

const keyPath = resolve(import.meta.dirname || '.', '../serviceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error('serviceAccountKey.json não encontrado na raiz. Gere em Firebase Console > Contas de serviço.');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });

const auth = getAuth();
await auth.setCustomUserClaims(uid, { admin: true });
console.log(`Claim admin:true setado no uid ${uid}`);

// Verifica
const user = await auth.getUser(uid);
console.log('Claims atuais:', JSON.stringify(user.customClaims));
