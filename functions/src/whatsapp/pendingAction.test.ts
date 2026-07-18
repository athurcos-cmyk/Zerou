import { describe, expect, it } from 'vitest';
import { resolveDualSelection, resolveSingleSelection, type Candidate } from './pendingAction.js';

const candidates: Candidate[] = [
  { id: 'acc_nubank', label: 'Nubank' },
  { id: 'acc_itau', label: 'Itaú' },
  { id: 'acc_carteira', label: 'Carteira' },
];

describe('resolveSingleSelection', () => {
  it('resolves by list index', () => {
    expect(resolveSingleSelection('1', candidates)).toBe('acc_nubank');
    expect(resolveSingleSelection('3', candidates)).toBe('acc_carteira');
  });

  it('rejects an out-of-range index', () => {
    expect(resolveSingleSelection('0', candidates)).toBeNull();
    expect(resolveSingleSelection('4', candidates)).toBeNull();
  });

  it('resolves by exact or partial account name', () => {
    expect(resolveSingleSelection('Itaú', candidates)).toBe('acc_itau');
    expect(resolveSingleSelection('itau', candidates)).toBe('acc_itau');
    expect(resolveSingleSelection('nu', candidates)).toBe('acc_nubank');
  });

  it('returns null when the reply matches nothing', () => {
    expect(resolveSingleSelection('bradesco', candidates)).toBeNull();
    expect(resolveSingleSelection('', candidates)).toBeNull();
  });
});

describe('resolveDualSelection', () => {
  it('parses two space-separated indices as source then destination', () => {
    expect(resolveDualSelection('1 2', candidates)).toEqual({ sourceId: 'acc_nubank', destinationId: 'acc_itau' });
  });

  it('parses hyphen or comma separated indices', () => {
    expect(resolveDualSelection('2-3', candidates)).toEqual({ sourceId: 'acc_itau', destinationId: 'acc_carteira' });
    expect(resolveDualSelection('3,1', candidates)).toEqual({ sourceId: 'acc_carteira', destinationId: 'acc_nubank' });
  });

  it('rejects the same index twice', () => {
    expect(resolveDualSelection('2 2', candidates)).toBeNull();
  });

  it('rejects out-of-range indices', () => {
    expect(resolveDualSelection('1 9', candidates)).toBeNull();
    expect(resolveDualSelection('0 1', candidates)).toBeNull();
  });

  it('rejects replies without exactly two numbers', () => {
    expect(resolveDualSelection('1', candidates)).toBeNull();
    expect(resolveDualSelection('1 2 3', candidates)).toBeNull();
    expect(resolveDualSelection('nubank', candidates)).toBeNull();
  });
});
