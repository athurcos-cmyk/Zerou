import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/config';
import type { AppearancePreferences } from '../theme/theme.types';

interface EnsureUserProfileInput {
  name: string;
  termsVersion: string;
  appearance: AppearancePreferences;
}

interface EnsurePersonalWorkspaceResponse {
  workspaceId: string;
  created: boolean;
}

export async function ensureUserProfile(input: EnsureUserProfileInput) {
  const callable = httpsCallable<EnsureUserProfileInput, { ok: true }>(getFirebaseFunctions(), 'ensureUserProfile');
  return callable(input);
}

export async function ensurePersonalWorkspace() {
  const callable = httpsCallable<Record<string, never>, EnsurePersonalWorkspaceResponse>(
    getFirebaseFunctions(),
    'ensurePersonalWorkspace'
  );
  const response = await callable({});
  return response.data;
}
