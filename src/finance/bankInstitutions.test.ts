import { describe, expect, it } from 'vitest';
import { findBankInstitution, searchBankInstitutions } from './bankInstitutions';

describe('bankInstitutions', () => {
  it('matches institutions ignoring accents and aliases', () => {
    expect(findBankInstitution('itau')?.name).toBe('Itaú');
    expect(findBankInstitution('bb')?.name).toBe('Banco do Brasil');
    expect(findBankInstitution('nuconta')?.name).toBe('Nubank');
  });

  it('suggests institutions from partial names', () => {
    expect(searchBankInstitutions('mercado').map((item) => item.name)).toContain('Mercado Pago');
  });
});
