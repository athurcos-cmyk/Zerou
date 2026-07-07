const PUSH_TOKEN_CACHE_KEY = 'zerou.pushToken.v1';

interface StoredPushTokenCache {
  tokensByUid: Record<string, string>;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readCache(): StoredPushTokenCache {
  if (!canUseStorage()) {
    return { tokensByUid: {} };
  }

  try {
    const raw = window.localStorage.getItem(PUSH_TOKEN_CACHE_KEY);
    if (!raw) {
      return { tokensByUid: {} };
    }

    const parsed = JSON.parse(raw) as Partial<StoredPushTokenCache>;
    return { tokensByUid: parsed?.tokensByUid && typeof parsed.tokensByUid === 'object' ? parsed.tokensByUid : {} };
  } catch {
    return { tokensByUid: {} };
  }
}

export function readCachedPushToken(uid: string): string | null {
  return readCache().tokensByUid[uid] ?? null;
}

export function saveCachedPushToken(uid: string, token: string) {
  if (!canUseStorage()) {
    return;
  }

  try {
    const cache = readCache();
    cache.tokensByUid[uid] = token;
    window.localStorage.setItem(PUSH_TOKEN_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache é só um acelerador — se falhar, o próximo boot volta a gravar no Firestore.
  }
}
