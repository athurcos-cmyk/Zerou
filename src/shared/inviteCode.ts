const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const INVITE_PREFIX = 'DUO';

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getRandomIndex(max: number) {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return random[0] % max;
}

export function generateInviteCode() {
  const body = Array.from({ length: 6 }, () => INVITE_ALPHABET[getRandomIndex(INVITE_ALPHABET.length)]).join('');
  return `${INVITE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function normalizeInviteCode(code: string) {
  const normalized = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^DUO/, '');

  if (normalized.length !== 6 || [...normalized].some((char) => !INVITE_ALPHABET.includes(char))) {
    throw new Error('Informe um código Granix válido.');
  }

  return `${INVITE_PREFIX}-${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export async function hashInviteCode(code: string) {
  const normalized = normalizeInviteCode(code);
  const payload = new TextEncoder().encode(`Granix-couple-invite:${normalized}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);

  return bytesToHex(digest);
}

export function inviteIdFromHash(hash: string) {
  return `invite_${hash.slice(0, 32)}`;
}

export async function inviteIdFromCode(code: string) {
  return inviteIdFromHash(await hashInviteCode(code));
}

export function inviteCodeHint(code: string) {
  const normalized = normalizeInviteCode(code);
  return normalized.slice(-2);
}

export function buildJoinUrl(code: string) {
  const normalized = normalizeInviteCode(code);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join/${encodeURIComponent(normalized)}`;
}

export const inviteCodeAlphabetForTests = INVITE_ALPHABET;
