import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const REGION = 'southamerica-east1';

// Força logout imediato em TODOS os dispositivos do usuário autenticado,
// revogando todos os refresh tokens. Usado durante a auto-exclusão de conta
// para impedir que outros dispositivos com sessão ativa continuem escrevendo
// dados depois que o Firestore já foi limpo.
export const forceLogoutAllDevices = onCall(
  { region: REGION, maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Entre na Granativa para continuar.');
    }

    const auth = getAuth();
    await auth.revokeRefreshTokens(uid);

    logger.info('forceLogoutAllDevices', { uid });

    return { success: true };
  }
);
