import { callDeepSeek } from '../ai/deepseekClient.js';

interface CategoryInfo {
  id: string;
  name: string;
}

export interface ExpenseExtraction {
  amountCents: number;
  description: string;
  categoryId: string | null;
  confidence: 'high' | 'low';
}

const EXTRACTION_SYSTEM_PROMPT = `Voce extrai gastos de mensagens em portugues brasileiro. Retorne SOMENTE um JSON com este formato:
{
  "amountCents": numero inteiro em centavos (ex: "15 reais" = 1500, "2 conto" = 200, "cinquenta centavos" = 50),
  "description": descricao curta do gasto em português (max 80 caracteres),
  "categoryId": string da categoria correspondente ou null,
  "confidence": "high" se o valor esta claro, "low" se esta ambiguo
}

Regras:
- "10 reais" = 1000, "R$ 5,50" = 550, "cinco e cinquenta" = 550, "dois conto" = 200
- Se nao ha valor claro, amountCents = 0 e confidence = "low"
- description deve ser curto e util (ex: "Mercado", "Uber", "Almoco")
- Case a categoria informada nao esteja na lista, escolha a MAIS PROXIMA. So retorne null se nao houver NENHUMA proxima.`;

export async function extractExpense(
  text: string,
  categories: CategoryInfo[],
): Promise<ExpenseExtraction | null> {
  const categoryList = categories.length > 0
    ? categories.map((c) => `  ${c.id}: ${c.name}`).join('\n')
    : 'Nenhuma categoria cadastrada.';

  const userMessage = `Mensagem: "${text}"\n\nCategorias disponiveis:\n${categoryList}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    { jsonMode: true },
  );

  try {
    const parsed = JSON.parse(raw) as {
      amountCents?: number;
      description?: string;
      categoryId?: string | null;
      confidence?: string;
    };

    const amountCents = typeof parsed.amountCents === 'number' ? Math.round(parsed.amountCents) : 0;
    const description = typeof parsed.description === 'string'
      ? parsed.description.trim().slice(0, 80)
      : text.slice(0, 80);

    // Validate categoryId against the provided list
    let categoryId: string | null = null;
    if (typeof parsed.categoryId === 'string' && categories.some((c) => c.id === parsed.categoryId)) {
      categoryId = parsed.categoryId;
    }

    if (amountCents <= 0) return null;

    return {
      amountCents,
      description: description || text.slice(0, 80),
      categoryId,
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    };
  } catch {
    return null;
  }
}
