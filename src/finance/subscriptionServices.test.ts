import { describe, expect, it } from 'vitest';
import { defaultCategories } from './defaultCategories';
import {
  findSubscriptionService,
  searchSubscriptionServices,
  subscriptionServices
} from './subscriptionServices';

describe('catálogo de serviços', () => {
  it('has unique ids', () => {
    const ids = subscriptionServices.map((service) => service.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Um `suggestedCategoryId` que não existe preencheria o formulário com uma categoria
  // fantasma, e o gasto sumiria do "Resumo de gastos".
  it('only suggests categories that actually exist', () => {
    const validIds = new Set(defaultCategories.map((category) => category.id));
    const invalid = subscriptionServices
      .filter((service) => service.suggestedCategoryId && !validIds.has(service.suggestedCategoryId))
      .map((service) => service.id);

    expect(invalid).toEqual([]);
  });

  it('keeps initials short enough for the 2-letter tile', () => {
    const tooLong = subscriptionServices.filter((service) => service.initials.length > 2).map((s) => s.id);
    expect(tooLong).toEqual([]);
  });

  it('points every logoPath at the generated folder', () => {
    const wrong = subscriptionServices
      .filter((service) => service.logoPath && service.logoPath !== `/service-logos/${service.id}.svg`)
      .map((service) => service.id);

    expect(wrong).toEqual([]);
  });
});

describe('findSubscriptionService', () => {
  it('recognizes a brand inside a free-text description', () => {
    expect(findSubscriptionService('Netflix da família')?.id).toBe('netflix');
    expect(findSubscriptionService('assinatura spotify')?.id).toBe('spotify');
    expect(findSubscriptionService('Conta de luz')?.id).toBe('energia');
  });

  it('matches multi-word brands', () => {
    expect(findSubscriptionService('Amazon Prime Video')?.id).toBe('prime-video');
    expect(findSubscriptionService('Apple TV+ mensal')?.id).toBe('apple-tv');
    expect(findSubscriptionService('academia smart fit')?.id).toBe('smart-fit');
  });

  it('is case and accent insensitive', () => {
    expect(findSubscriptionService('CONDOMÍNIO')?.id).toBe('condominio');
    expect(findSubscriptionService('Água do prédio')?.id).toBe('agua');
  });

  // A razão de existir do casamento por palavra inteira. Um alias de duas letras como "oi"
  // ou "tim", casado por substring, grudaria o logo da operadora em dezenas de lançamentos
  // que não têm nada a ver — e logo errado ao lado de dinheiro é pior do que logo nenhum.
  describe('não casa alias curto dentro de outra palavra', () => {
    it.each([
      ['Oitava parcela do sofá', 'oi'],
      ['Time do coração', 'tim'],
      ['Curso de inglês', 'oi'],
      ['Manutenção do carro', 'oi'],
      ['Presente de aniversário', 'oi']
    ])('%s não vira %s', (descricao) => {
      expect(findSubscriptionService(descricao)).toBeNull();
    });
  });

  it('recognizes the short brands when they are whole words', () => {
    expect(findSubscriptionService('Conta do Oi')?.id).toBe('oi');
    expect(findSubscriptionService('TIM controle')?.id).toBe('tim');
  });

  // "Uber Eats" precisa ganhar de "Uber One" (alias 'uber'), e "Smart Fit" de "Academia".
  it('prefers the more specific brand over the generic one', () => {
    expect(findSubscriptionService('Uber Eats')?.id).toBe('uber-eats');
    expect(findSubscriptionService('Uber One')?.id).toBe('uber-one');
    expect(findSubscriptionService('Smart Fit')?.id).toBe('smart-fit');
    expect(findSubscriptionService('Academia do bairro')?.id).toBe('academia');
  });

  it('returns null for an unrelated description', () => {
    expect(findSubscriptionService('Padaria')).toBeNull();
    expect(findSubscriptionService('')).toBeNull();
    expect(findSubscriptionService('   ')).toBeNull();
  });

  it('handles the plus sign in brand names', () => {
    expect(findSubscriptionService('Disney+')?.id).toBe('disney-plus');
    expect(findSubscriptionService('Disney Plus')?.id).toBe('disney-plus');
    expect(findSubscriptionService('Paramount+')?.id).toBe('paramount-plus');
  });
});

describe('searchSubscriptionServices', () => {
  it('suggests popular services when the field is empty', () => {
    const suggestions = searchSubscriptionServices('');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].id).toBe('netflix');
  });

  it('matches partial typing, unlike the strict recognizer', () => {
    expect(searchSubscriptionServices('net').map((s) => s.id)).toContain('netflix');
    expect(searchSubscriptionServices('gym').map((s) => s.id)).toContain('wellhub');
    expect(searchSubscriptionServices('lu').map((s) => s.id)).toContain('energia');
  });

  it('respects the limit', () => {
    expect(searchSubscriptionServices('a', 3)).toHaveLength(3);
  });

  it('returns nothing for a query that matches no service', () => {
    expect(searchSubscriptionServices('zzzzz')).toEqual([]);
  });
});
