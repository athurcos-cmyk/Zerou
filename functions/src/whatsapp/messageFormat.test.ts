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
  outOfScopeMessage,
  questionRedirectMessage,
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

describe('outOfScopeMessage', () => {
  // ⚠️ A fonte da verdade destes nomes é a navegação do app (`src/layout/AppShell.tsx`), que este
  // pacote não consegue importar (codebases separados). Renomeou aba lá? Atualize aqui também.
  // Foi o que faltou em 02/08/2026, quando "Contas a Pagar" virou "Contas e assinaturas" e
  // "Contas a Receber" virou "Dinheiro a receber": a mensagem foi atualizada, o teste não, e ele
  // ficou vermelho até 08/08 — o teste estava errado, não o produto.
  it('aponta a aba certa por tela', () => {
    expect(outOfScopeMessage('transacoes')).toContain('*Transações*');
    expect(outOfScopeMessage('categorias')).toContain('*Editar categorias*');
    expect(outOfScopeMessage('contas')).toContain('*Contas*');
    expect(outOfScopeMessage('contas_a_pagar')).toContain('*Contas e assinaturas*');
    expect(outOfScopeMessage('contas_a_receber')).toContain('*Dinheiro a receber*');
    expect(outOfScopeMessage('cartoes')).toContain('*Cartões*');
    expect(outOfScopeMessage('metas')).toContain('*Metas*');
    expect(outOfScopeMessage('analise')).toContain('*Análise*');
    expect(outOfScopeMessage('assistente')).toContain('*Assistente*');
  });

  it('assistente convida pra conversa, não só recusa', () => {
    expect(outOfScopeMessage('assistente')).toContain('pensar nela com calma');
  });

  it('geral cobre o fallback sem tela específica', () => {
    expect(outOfScopeMessage('geral')).not.toContain('*');
  });
});

describe('questionRedirectMessage', () => {
  it('redireciona pergunta pra Vic do app (aba Assistente), sem tom de "decisão grande"', () => {
    const msg = questionRedirectMessage();
    expect(msg).toContain('*Assistente*');
    expect(msg).toContain('histórico');
    // Não é o texto de decisão grande — é o redirect geral de qualquer pergunta.
    expect(msg).not.toContain('decisão grande');
  });
});
