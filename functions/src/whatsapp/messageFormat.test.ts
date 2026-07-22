import { describe, expect, it } from 'vitest';
import {
  formatBRL,
  confirmExpense,
  confirmIncome,
  confirmTransfer,
  confirmCardPurchase,
  categoryCreatedMessage,
  categoryAlreadyExistsMessage,
  numberedList,
  pendingChoicePrompt,
} from './messageFormat.js';

describe('formatBRL', () => {
  it('formata centavos como reais no padrão pt-BR', () => {
    expect(formatBRL(1500)).toBe('R$ 15,00');
  });
});

describe('confirmExpense', () => {
  it('mostra categoria e conta quando presentes', () => {
    const msg = confirmExpense({ amountCents: 1500, description: 'Mercado', categoryName: 'Alimentação', accountName: 'Nubank' });
    expect(msg).toContain('💸 *Despesa registrada*');
    expect(msg).toContain('Mercado');
    expect(msg).toContain('🏷️ Alimentação');
    expect(msg).toContain('🏦 Nubank');
  });

  it('omite a linha de detalhe quando não há categoria nem conta', () => {
    const msg = confirmExpense({ amountCents: 1500, description: 'Mercado' });
    expect(msg).not.toContain('🏷️');
    expect(msg).not.toContain('🏦');
  });
});

describe('confirmIncome', () => {
  it('usa o emoji de receita', () => {
    expect(confirmIncome({ amountCents: 20000, description: 'Freela' })).toContain('💰 *Receita registrada*');
  });
});

describe('confirmTransfer', () => {
  it('mostra a rota quando os dois nomes de conta estão disponíveis', () => {
    const msg = confirmTransfer({
      amountCents: 10000,
      description: 'Transferência',
      sourceAccountName: 'Nubank',
      destinationAccountName: 'Itaú',
    });
    expect(msg).toContain('🏦 Nubank → Itaú');
  });

  it('omite a rota quando falta um dos nomes', () => {
    const msg = confirmTransfer({ amountCents: 10000, description: 'Transferência', sourceAccountName: 'Nubank' });
    expect(msg).not.toContain('→');
  });
});

describe('confirmCardPurchase', () => {
  it('mostra parcelas só quando maior que 1', () => {
    expect(confirmCardPurchase({ amountCents: 30000, description: 'Compra', cardName: 'Nubank Roxinho', installments: 1 })).not.toContain('x —');
    expect(confirmCardPurchase({ amountCents: 30000, description: 'Compra', cardName: 'Nubank Roxinho', installments: 3 })).toContain('em 3x —');
  });
});

describe('categoryCreatedMessage / categoryAlreadyExistsMessage', () => {
  it('diferencia criação de duplicata', () => {
    expect(categoryCreatedMessage('Pet')).toContain('criada com sucesso');
    expect(categoryAlreadyExistsMessage('Pet')).toContain('já tem uma categoria');
  });
});

describe('numberedList', () => {
  it('numera a partir de 1', () => {
    expect(numberedList(['Nubank', 'Itaú'])).toBe('1. Nubank\n2. Itaú');
  });
});

describe('pendingChoicePrompt', () => {
  it('monta emoji, pergunta em negrito, lista e instrução em itálico', () => {
    const msg = pendingChoicePrompt({ emoji: '💳', question: 'Qual cartão usar?', labels: ['Nubank', 'Itaú'], instructions: 'Responda com o número.' });
    expect(msg).toBe('💳 *Qual cartão usar?*\n\n1. Nubank\n2. Itaú\n\n_Responda com o número._');
  });
});
