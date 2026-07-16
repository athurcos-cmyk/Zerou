import { callDeepSeek } from '../ai/deepseekClient.js';
import { categoryIconKeys } from './categoryPalette.js';

export interface CategoryOption {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
}

export type MessageIntent = 'expense' | 'income' | 'create_category' | 'question' | 'unclear';

export interface MessageInterpretation {
  intent: MessageIntent;
  amountCents: number;
  description: string;
  categoryId: string | null;
  newCategoryName: string | null;
  newCategoryType: 'income' | 'expense' | 'both' | null;
  newCategoryIcon: string | null;
  confidence: 'high' | 'low';
}

function buildSystemPrompt(): string {
  return `Voce interpreta mensagens em portugues brasileiro enviadas ao bot financeiro Granativa via WhatsApp.
Retorne SOMENTE um JSON com este formato:
{
  "intent": "expense" | "income" | "create_category" | "question" | "unclear",
  "amountCents": inteiro em centavos (0 se nao aplicavel),
  "description": descricao curta (max 80 chars, "" se nao aplicavel),
  "categoryId": id da categoria EXISTENTE mais especifica que combina, ou null,
  "newCategoryName": nome pedido pelo usuario (so para create_category), ou null,
  "newCategoryType": "income" | "expense" | "both" (so para create_category), ou null,
  "newCategoryIcon": uma destas chaves EXATAS — [${categoryIconKeys.join(', ')}] — ou null,
  "confidence": "high" | "low"
}

Como classificar intent:
- expense: relata gasto/compra/pagamento feito.
- income: relata recebimento (salario, freela, deposito, etc.).
- create_category: PEDIDO EXPLICITO para criar categoria (verbos "cria"/"criar"/"adiciona" + a palavra "categoria").
  NUNCA use create_category so porque a categoria ideal nao existe — nesse caso e expense/income com categoryId null.
- question: pergunta sobre a situacao financeira (saldo, gastos, metas, contas a pagar).
- unclear: nenhum valor/pedido claro.

Regras de valor: "10 reais"=1000, "R$ 5,50"=550, "cinco e cinquenta"=550, "dois conto"=200.
Se expense/income sem valor claro: amountCents=0, confidence="low".

Regras de categoria (expense/income): escolha a categoria EXISTENTE MAIS ESPECIFICA cujo tipo bate
com o intent detectado (expense usa tipo "expense" ou "both"; income usa "income" ou "both").
Ex.: se existem "Farmacia" (expense) e "Saude" (expense) e a mensagem fala de remedio, prefira "Farmacia".
Retorne categoryId null SE E SOMENTE SE nenhuma categoria existente combinar — nunca sugira criar uma.

Regras de create_category: newCategoryName = nome pedido, capitalizado. newCategoryType = "income" se
mencionar receita/renda, senao "expense" (padrao quando ambiguo). newCategoryIcon = chave mais adequada
da lista, ou null. amountCents deve ser 0 e categoryId null — criar categoria NUNCA cria uma transacao
junto, mesmo que a mensagem tambem cite um valor.`;
}

export async function interpretMessage(
  text: string,
  categories: CategoryOption[],
): Promise<MessageInterpretation | null> {
  const categoryList = categories.length > 0
    ? categories.map((c) => `  ${c.id}: ${c.name} (${c.type})`).join('\n')
    : 'Nenhuma categoria cadastrada.';

  const userMessage = `Mensagem: "${text}"\n\nCategorias disponiveis (id: nome (tipo)):\n${categoryList}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userMessage },
    ],
    { jsonMode: true },
  );

  try {
    const parsed = JSON.parse(raw) as {
      intent?: string;
      amountCents?: number;
      description?: string;
      categoryId?: string | null;
      newCategoryName?: string | null;
      newCategoryType?: string | null;
      newCategoryIcon?: string | null;
      confidence?: string;
    };

    const validIntents: MessageIntent[] = ['expense', 'income', 'create_category', 'question', 'unclear'];
    const intent: MessageIntent = validIntents.includes(parsed.intent as MessageIntent)
      ? (parsed.intent as MessageIntent)
      : 'unclear';

    const amountCents = typeof parsed.amountCents === 'number' ? Math.round(parsed.amountCents) : 0;
    const description = typeof parsed.description === 'string'
      ? parsed.description.trim().slice(0, 80)
      : '';

    let categoryId: string | null = null;
    if (typeof parsed.categoryId === 'string' && categories.some((c) => c.id === parsed.categoryId)) {
      categoryId = parsed.categoryId;
    }

    const newCategoryName = typeof parsed.newCategoryName === 'string' && parsed.newCategoryName.trim()
      ? parsed.newCategoryName.trim().slice(0, 80)
      : null;

    const validCategoryTypes = ['income', 'expense', 'both'];
    const newCategoryType = validCategoryTypes.includes(parsed.newCategoryType as string)
      ? (parsed.newCategoryType as 'income' | 'expense' | 'both')
      : null;

    const newCategoryIcon = typeof parsed.newCategoryIcon === 'string' && categoryIconKeys.includes(parsed.newCategoryIcon)
      ? parsed.newCategoryIcon
      : null;

    return {
      intent,
      amountCents,
      description,
      categoryId,
      newCategoryName,
      newCategoryType,
      newCategoryIcon,
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    };
  } catch {
    return null;
  }
}
