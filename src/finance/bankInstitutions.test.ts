import { describe, expect, it } from 'vitest';
import { findBankInstitution, searchBankInstitutions } from './bankInstitutions';

describe('bankInstitutions', () => {
  it('matches institutions ignoring accents and aliases', () => {
    expect(findBankInstitution('itau')?.name).toBe('Itaú');
    expect(findBankInstitution('bb')?.name).toBe('Banco do Brasil');
    expect(findBankInstitution('nuconta')?.name).toBe('Nubank');
  });

  it('exposes local SVG logos when an institution has an official mark available', () => {
    expect(findBankInstitution('nuconta')?.logoPath).toBe('/bank-logos/nubank.svg');
    expect(findBankInstitution('mercado livre')?.logoPath).toBe('/bank-logos/mercado-pago.svg');
  });

  it('suggests institutions from partial names', () => {
    expect(searchBankInstitutions('mercado').map((item) => item.name)).toContain('Mercado Pago');
  });
});
