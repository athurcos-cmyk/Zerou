const PENDING_INVITE_KEY = 'zerou.pendingInviteCode';

export function savePendingInvite(code: string) {
  window.localStorage.setItem(PENDING_INVITE_KEY, code);
}

export function readPendingInvite() {
  return window.localStorage.getItem(PENDING_INVITE_KEY);
}

export function clearPendingInvite() {
  window.localStorage.removeItem(PENDING_INVITE_KEY);
}
