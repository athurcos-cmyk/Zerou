import type { UserProfile } from '../types/contracts';

const PROFILE_CACHE_KEY = 'zerou.auth.profileCache.v1';

interface StoredProfileCache {
  profiles: Record<string, UserProfile>;
  lastUid?: string;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readCache(): StoredProfileCache {
  if (!canUseStorage()) {
    return { profiles: {} };
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
      return { profiles: {} };
    }

    const parsed = JSON.parse(raw) as Partial<StoredProfileCache>;
    if (!parsed || typeof parsed !== 'object' || !parsed.profiles || typeof parsed.profiles !== 'object') {
      return { profiles: {} };
    }

    return {
      profiles: parsed.profiles as Record<string, UserProfile>,
      lastUid: typeof parsed.lastUid === 'string' ? parsed.lastUid : undefined
    };
  } catch {
    return { profiles: {} };
  }
}

function writeCache(cache: StoredProfileCache) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache local e apenas um acelerador de boot. Se falhar, o Firestore continua sendo a fonte.
  }
}

export function readCachedProfile(uid?: string | null) {
  if (!uid) {
    return null;
  }

  return readCache().profiles[uid] ?? null;
}

export function saveCachedProfile(profile: UserProfile) {
  const cache = readCache();
  cache.profiles[profile.id] = profile;
  cache.lastUid = profile.id;
  writeCache(cache);
}

export function readLastCachedProfile() {
  const cache = readCache();
  return cache.lastUid ? cache.profiles[cache.lastUid] ?? null : null;
}

export function clearCachedProfiles() {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // Best-effort.
  }
}
