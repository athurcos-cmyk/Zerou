import { callDeepSeek } from '../ai/deepseekClient.js';
import { categoryIconKeys } from './categoryPalette.js';

export interface CategoryOption {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
}

export type MessageIntent =
  | 'expense'
  | 'income'
  | 'card_purchase'
  | 'advanced_card_action'
  | 'create_category'
  | 'question'
  | 'unclear';

export interface MessageInterpretation {
  intent: MessageIntent;
  amountCents: number;
  description: string;
  installments: number;
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
  "intent": "expense" | "income" | "card_purchase" | "advanced_card_action" | "create_category" | "question" | "unclear",
  "amountCents": inteiro em centavos (0 se nao aplicavel),
  "description": descricao curta (max 80 chars, "" se nao aplicavel),
  "installments": numero de parcelas (1 se nao mencionado ou compra a vista, so relevante pra card_purchase),
  "categoryId": id da categoria EXISTENTE mais especifica que combina, ou null,
  "newCategoryName": nome de categoria pedido pelo usuario que NAO existe na lista, ou null,
  "newCategoryType": "income" | "expense" | "both" (junto com newCategoryName), ou null,
  "newCategoryIcon": uma destas chaves EXATAS — [${categoryIconKeys.join(', ')}] — ou null,
  "confidence": "high" | "low"
}

Como classificar intent:
- expense: relata gasto/compra/pagamento feito SEM ser no cartao de credito (dinheiro, pix, debito, conta).
- income: relata recebimento (salario, freela, deposito, etc.).
- card_purchase: compra feita NO CARTAO DE CREDITO, a vista ou parcelada (menciona "no cartao", "cartao de
  credito", "parcelei", "em Nx", "N vezes"). Compra no cartao sem parcelamento mencionado tambem e
  card_purchase (installments=1, "a vista no cartao").
- advanced_card_action: pedido MAIS AVANCADO sobre cartao que o bot NAO executa — uma compra parcelada que
  JA ESTAVA EM ANDAMENTO antes de usar o WhatsApp ("ja estou pagando", "parcela X de Y", "proxima parcela e
  a Z"), antecipar parcela, antecipar fatura, renegociar fatura. Esses pedidos NUNCA devem ser executados
  como card_purchase — classifique como advanced_card_action pra serem redirecionados ao app.
- create_category: PEDIDO EXPLICITO para criar categoria (verbos "cria"/"criar"/"adiciona" + a palavra "categoria").
  NUNCA use create_category so porque a categoria ideal nao existe — nesse caso e expense/income/card_purchase
  com categoryId null.
- question: pergunta sobre a situacao financeira (saldo, gastos, metas, contas a pagar).
- unclear: nenhum valor/pedido claro.

Regras de valor: "10 reais"=1000, "R$ 5,50"=550, "cinco e cinquenta"=550, "dois conto"=200.
Se expense/income/card_purchase sem valor claro: amountCents=0, confidence="low".

Regras de parcelamento (so pra card_purchase): "em 10x", "10 vezes", "parcelado em 3" => installments=10/10/3.
Sem mencao de parcelamento => installments=1 (compra a vista no cartao, ainda e card_purchase).

Regras de categoria (expense/income/card_purchase): escolha a categoria EXISTENTE MAIS ESPECIFICA cujo tipo
bate com o intent detectado (expense e card_purchase usam tipo "expense" ou "both"; income usa "income" ou
"both"). Ex.: se existem "Farmacia" (expense) e "Saude" (expense) e a mensagem fala de remedio, prefira
"Farmacia". Retorne categoryId null SE E SOMENTE SE nenhuma categoria existente combinar — nunca sugira
criar uma.

Se o usuario mencionar EXPLICITAMENTE em qual categoria colocar o lancamento (ex.: "coloca na categoria
Mercado", "categoria: Lazer", "classifica como Transporte", "bota em Casa"):
- Se essa categoria EXISTIR na lista, use EXATAMENTE ela em categoryId — mesmo que outra categoria pareca
  semanticamente mais obvia pro assunto da mensagem. O pedido explicito do usuario sempre vence a escolha
  automatica por assunto.
- Se essa categoria NAO EXISTIR na lista, preencha newCategoryName (nome pedido, capitalizado),
  newCategoryType (mesmo tipo do intent: "expense" para expense/card_purchase, "income" para income) e
  newCategoryIcon (chave mais adequada da lista, ou null). Deixe categoryId null. O intent continua
  "expense"/"income"/"card_purchase" normalmente (NAO vire "create_category") — a categoria nova pedida
  explicitamente sera criada e usada no mesmo lancamento.

Regras de create_category (pedido AVULSO de categoria, sem lancamento junto): newCategoryName = nome
pedido, capitalizado. newCategoryType = "income" se mencionar receita/renda, senao "expense" (padrao
quando ambiguo). newCategoryIcon = chave mais adequada da lista, ou null. amountCents deve ser 0 e
categoryId null — esse intent NUNCA cria uma transacao junto, mesmo que a mensagem tambem cite um valor.`;
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
      installments?: number;
      categoryId?: string | null;
      newCategoryName?: string | null;
      newCategoryType?: string | null;
      newCategoryIcon?: string | null;
      confidence?: string;
    };

    const validIntents: MessageIntent[] = [
      'expense', 'income', 'card_purchase', 'advanced_card_action', 'create_category', 'question', 'unclear',
    ];
    const intent: MessageIntent = validIntents.includes(parsed.intent as MessageIntent)
      ? (parsed.intent as MessageIntent)
      : 'unclear';

    const amountCents = typeof parsed.amountCents === 'number' ? Math.round(parsed.amountCents) : 0;
    const description = typeof parsed.description === 'string'
      ? parsed.description.trim().slice(0, 80)
      : '';

    const installments = typeof parsed.installments === 'number' && Number.isInteger(parsed.installments)
      ? Math.min(Math.max(parsed.installments, 1), 24)
      : 1;

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
      installments,
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
