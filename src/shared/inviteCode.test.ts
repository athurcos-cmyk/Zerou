import { describe, expect, it } from 'vitest';
import {
  generateInviteCode,
  hashInviteCode,
  inviteCodeAlphabetForTests,
  inviteIdFromCode,
  normalizeInviteCode
} from './inviteCode';

describe('couple invite codes', () => {
  it('generates friendly Duo codes without ambiguous characters', () => {
    const code = generateInviteCode();
    const body = code.replace(/^DUO-/, '').replace('-', '');

    expect(code).toMatch(/^DUO-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{2}$/);
    expect([...body].every((char) => inviteCodeAlphabetForTests.includes(char))).toBe(true);
    expect(body).not.toMatch(/[0O1IL]/);
  });

  it('normalizes typed invite codes', () => {
    expect(normalizeInviteCode('duo-7x4k-92')).toBe('DUO-7X4K-92');
    expect(normalizeInviteCode('7x4k92')).toBe('DUO-7X4K-92');
  });

  it('hashes invite codes without preserving the raw code in the hash or id', async () => {
    const hash = await hashInviteCode('DUO-7X4K-92');
    const id = await inviteIdFromCode('DUO-7X4K-92');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('7X4K92');
    expect(id).toMatch(/^invite_[a-f0-9]{32}$/);
    expect(id).not.toContain('7X4K92');
  });
});
