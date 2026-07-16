import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultKeyPath = path.join(__dirname, '..', 'serviceAccountKey.json');

/**
 * Inicializa o Admin SDK pra scripts de backfill (uso único, roda local). Usa uma service
 * account baixada em https://console.firebase.google.com/project/zerou-26757/settings/serviceaccounts/adminsdk
 * salva como `serviceAccountKey.json` na raiz do projeto (já está no `.gitignore` —
 * `serviceAccountKey.json` — nunca commitar), ou apontada via SERVICE_ACCOUNT_KEY_PATH.
 */
export function initAdminApp() {
  const keyPath = process.env.SERVICE_ACCOUNT_KEY_PATH || defaultKeyPath;
  let serviceAccount;

  try {
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    console.error(`Não foi possível ler a service account em ${keyPath}.`);
    console.error('Baixe uma em Configurações do projeto > Contas de serviço > Gerar nova chave privada,');
    console.error('salve como serviceAccountKey.json na raiz do projeto, ou aponte SERVICE_ACCOUNT_KEY_PATH.');
    process.exit(1);
  }

  initializeApp({ credential: cert(serviceAccount) });
  return getFirestore();
}
