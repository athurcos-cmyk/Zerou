import { HttpsError } from 'firebase-functions/v2/https';

export function safeReturnUrl(input: unknown, appBaseUrl: string, fallbackPath: string) {
  const fallback = new URL(fallbackPath, appBaseUrl);

  if (typeof input !== 'string' || input.trim().length === 0) {
    return fallback.toString();
  }

  try {
    const parsed = new URL(input);
    const base = new URL(appBaseUrl);

    if (parsed.origin !== base.origin) {
      throw new Error('unsafe-origin');
    }

    return parsed.toString();
  } catch {
    throw new HttpsError('invalid-argument', 'URL de retorno invalida para a Zerou.');
  }
}
