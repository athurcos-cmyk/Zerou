import type { AccountType } from '../types/contracts';

export interface BankInstitution {
  id: string;
  name: string;
  aliases: string[];
  initials: string;
  suggestedType: AccountType;
  logoPath?: string;
}

export const bankInstitutions: BankInstitution[] = [
  { id: 'nubank', name: 'Nubank', aliases: ['nu', 'nuconta', 'roxinho'], initials: 'nu', suggestedType: 'digital_wallet', logoPath: '/bank-logos/nubank.svg' },
  { id: 'itau', name: 'Itaú', aliases: ['itau', 'itaú', 'iti'], initials: 'itaú', suggestedType: 'checking', logoPath: '/bank-logos/itau.svg' },
  { id: 'bradesco', name: 'Bradesco', aliases: ['next'], initials: 'bra', suggestedType: 'checking', logoPath: '/bank-logos/bradesco.svg' },
  { id: 'banco-do-brasil', name: 'Banco do Brasil', aliases: ['bb', 'banco brasil'], initials: 'BB', suggestedType: 'checking', logoPath: '/bank-logos/banco-do-brasil.svg' },
  { id: 'caixa', name: 'Caixa', aliases: ['cef', 'caixa economica', 'caixa econômica'], initials: 'cx', suggestedType: 'checking', logoPath: '/bank-logos/caixa.svg' },
  { id: 'santander', name: 'Santander', aliases: ['santander brasil'], initials: 'san', suggestedType: 'checking', logoPath: '/bank-logos/santander.svg' },
  { id: 'inter', name: 'Inter', aliases: ['banco inter'], initials: 'inter', suggestedType: 'digital_wallet', logoPath: '/bank-logos/inter.svg' },
  { id: 'c6', name: 'C6 Bank', aliases: ['c6', 'c6bank'], initials: 'C6', suggestedType: 'digital_wallet', logoPath: '/bank-logos/c6.svg' },
  { id: 'btg', name: 'BTG Pactual', aliases: ['btg', 'btg banking', 'btg investimentos'], initials: 'btg', suggestedType: 'investment', logoPath: '/bank-logos/btg.svg' },
  { id: 'xp', name: 'XP', aliases: ['xp investimentos'], initials: 'XP', suggestedType: 'investment', logoPath: '/bank-logos/xp.svg' },
  { id: 'picpay', name: 'PicPay', aliases: ['pic pay'], initials: 'pic', suggestedType: 'digital_wallet', logoPath: '/bank-logos/picpay.svg' },
  { id: 'mercado-pago', name: 'Mercado Pago', aliases: ['mercadopago', 'mercado livre'], initials: 'mp', suggestedType: 'digital_wallet', logoPath: '/bank-logos/mercado-pago.svg' },
  { id: 'pagbank', name: 'PagBank', aliases: ['pagseguro', 'pag seguro'], initials: 'pag', suggestedType: 'digital_wallet', logoPath: '/bank-logos/pagbank.svg' },
  { id: 'neon', name: 'Neon', aliases: ['banco neon'], initials: 'Ne', suggestedType: 'digital_wallet', logoPath: '/bank-logos/neon.svg' },
  { id: 'original', name: 'Banco Original', aliases: ['original'], initials: 'BO', suggestedType: 'checking', logoPath: '/bank-logos/original.svg' },
  { id: 'safra', name: 'Safra', aliases: ['banco safra'], initials: 'Sf', suggestedType: 'checking', logoPath: '/bank-logos/safra.svg' },
  { id: 'sicoob', name: 'Sicoob', aliases: ['sicoob cooperativa'], initials: 'Sc', suggestedType: 'checking', logoPath: '/bank-logos/sicoob.svg' },
  { id: 'sicredi', name: 'Sicredi', aliases: ['sicredi cooperativa'], initials: 'Si', suggestedType: 'checking', logoPath: '/bank-logos/sicredi.svg' },
  { id: 'banrisul', name: 'Banrisul', aliases: ['banco do estado do rio grande do sul'], initials: 'Ba', suggestedType: 'checking', logoPath: '/bank-logos/banrisul.svg' },
  { id: 'pan', name: 'Banco PAN', aliases: ['pan'], initials: 'PN', suggestedType: 'checking' },
  { id: 'bmg', name: 'Banco BMG', aliases: ['bmg'], initials: 'BM', suggestedType: 'checking', logoPath: '/bank-logos/bmg.svg' },
  { id: 'modal', name: 'Modal', aliases: ['modalmais', 'modal mais'], initials: 'Mo', suggestedType: 'investment' },
  { id: 'will', name: 'Will Bank', aliases: ['will'], initials: 'Wi', suggestedType: 'digital_wallet' },
  { id: 'bv', name: 'Banco BV', aliases: ['bv financeira'], initials: 'BV', suggestedType: 'checking', logoPath: '/bank-logos/bv.svg' },
  { id: 'agibank', name: 'Agibank', aliases: ['agi'], initials: 'Ag', suggestedType: 'checking' },
  { id: 'digio', name: 'Digio', aliases: ['banco digio'], initials: 'Dg', suggestedType: 'digital_wallet' },
  { id: 'sofisa', name: 'Sofisa Direto', aliases: ['sofisa'], initials: 'So', suggestedType: 'investment' },
  { id: 'daycoval', name: 'Banco Daycoval', aliases: ['daycoval'], initials: 'Dy', suggestedType: 'investment' },
  { id: 'master', name: 'Banco Master', aliases: ['master'], initials: 'Ma', suggestedType: 'investment' },
  { id: 'stone', name: 'Stone', aliases: ['stone conta'], initials: 'St', suggestedType: 'digital_wallet', logoPath: '/bank-logos/stone.svg' },
  { id: 'infinitepay', name: 'InfinitePay', aliases: ['infinite pay'], initials: 'IP', suggestedType: 'digital_wallet', logoPath: '/bank-logos/infinitepay.svg' },
  { id: 'wise', name: 'Wise', aliases: ['transferwise'], initials: 'Ws', suggestedType: 'digital_wallet' },
  { id: 'nomad', name: 'Nomad', aliases: ['nomad global'], initials: 'No', suggestedType: 'digital_wallet' },
  { id: 'avenue', name: 'Avenue', aliases: ['avenue securities'], initials: 'Av', suggestedType: 'investment' },
  { id: 'rico', name: 'Rico', aliases: ['rico investimentos'], initials: 'Rc', suggestedType: 'investment' },
  { id: 'clear', name: 'Clear', aliases: ['clear corretora'], initials: 'Cl', suggestedType: 'investment' },
  { id: 'bari', name: 'Banco Bari', aliases: ['bari'], initials: 'Bi', suggestedType: 'checking' },
  { id: 'unicred', name: 'Unicred', aliases: ['unicred cooperativa'], initials: 'Un', suggestedType: 'checking', logoPath: '/bank-logos/unicred.svg' },
  { id: 'cresol', name: 'Cresol', aliases: ['cresol cooperativa'], initials: 'Cr', suggestedType: 'checking', logoPath: '/bank-logos/cresol.svg' },
  { id: 'cooperforte', name: 'Cooperforte', aliases: ['cooper forte'], initials: 'CF', suggestedType: 'checking' },
  { id: 'carteira', name: 'Carteira', aliases: ['dinheiro', 'cash'], initials: 'R$', suggestedType: 'cash' }
];

export function normalizeInstitutionQuery(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function findBankInstitution(value: string) {
  const normalized = normalizeInstitutionQuery(value);
  if (!normalized) {
    return null;
  }

  return bankInstitutions.find((institution) => {
    const names = [institution.name, ...institution.aliases].map(normalizeInstitutionQuery);
    return names.some((name) => name === normalized || normalized.includes(name) || name.includes(normalized));
  }) ?? null;
}

export function searchBankInstitutions(value: string, limit = 8) {
  const normalized = normalizeInstitutionQuery(value);
  const source = normalized ? bankInstitutions.filter((institution) => {
    const names = [institution.name, ...institution.aliases].map(normalizeInstitutionQuery);
    return names.some((name) => name.includes(normalized) || normalized.includes(name));
  }) : bankInstitutions;

  return source.slice(0, limit);
}
