import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import type { PrivacyRequestType } from '../types/contracts';

function createPrivacyRequestId(userId: string, type: PrivacyRequestType) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}`;
  return `privacy_${userId}_${type}_${random}`;
}

export async function createPrivacyRequest(input: {
  userId: string;
  email: string | null;
  type: PrivacyRequestType;
  notes: string;
}) {
  const requestId = createPrivacyRequestId(input.userId, input.type);
  const now = serverTimestamp();

  await setDoc(doc(getFirebaseDb(), 'privacyRequests', requestId), {
    id: requestId,
    userId: input.userId,
    email: input.email ?? '',
    type: input.type,
    status: 'open',
    notes: input.notes,
    version: 'zerou-v12.2-privacy-request',
    createdAt: now,
    updatedAt: now
  });

  return requestId;
}
