import { callDeepSeek } from '../ai/deepseekClient.js';
import { categoryIconKeys } from './categoryPalette.js';

export interface CategoryOption {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
}

export interface AccountOption {
  id: string;
  name: string;
}

export type MessageIntent =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'card_purchase'
  | 'advanced_card_action'
  | 'unsupported_action'
  | 'create_category'
  | 'question'
  | 'advisory_decision'
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
  /** expense/income: conta citada na mensagem pra debitar/creditar, se identificável. */
  accountId: string | null;
  /** transfer: conta de origem citada na mensagem, se identificável. */
  sourceAccountId: string | null;
  /** transfer: conta de destino citada na mensagem, se identificável. */
  destinationAccountId: string | null;
  confidence: 'high' | 'low';
}

function buildSystemPrompt(): string {
  return `Voce interpreta mensagens em portugues brasileiro enviadas ao bot financeiro Granativa via WhatsApp.
Retorne SOMENTE um JSON com este formato:
{
  "intent": "expense" | "income" | "transfer" | "card_purchase" | "advanced_card_action" | "unsupported_action" | "create_category" | "question" | "advisory_decision" | "unclear",
  "amountCents": inteiro em centavos (0 se nao aplicavel),
  "description": descricao curta (max 80 chars, "" se nao aplicavel),
  "installments": numero de parcelas (1 se nao mencionado ou compra a vista, so relevante pra card_purchase),
  "categoryId": id da categoria EXISTENTE mais especifica que combina, ou null,
  "newCategoryName": nome de categoria pedido pelo usuario que NAO existe na lista, ou null,
  "newCategoryType": "income" | "expense" | "both" (junto com newCategoryName), ou null,
  "newCategoryIcon": uma destas chaves EXATAS — [${categoryIconKeys.join(', ')}] — ou null,
  "accountId": id da conta EXISTENTE mencionada na mensagem pra expense/income (de onde sai ou entra o
    dinheiro), ou null se a mensagem nao citar conta nenhuma ou nenhuma bater com confianca,
  "sourceAccountId": id da conta EXISTENTE de origem, so pra intent transfer, ou null se nao identificavel,
  "destinationAccountId": id da conta EXISTENTE de destino, so pra intent transfer, ou null se nao identificavel,
  "confidence": "high" | "low"
}

Como classificar intent:
- expense: relata gasto/compra/pagamento feito SEM ser no cartao de credito (dinheiro, pix, debito, conta).
- income: relata recebimento (salario, freela, deposito, etc.).
- transfer: move dinheiro de UMA conta do usuario pra OUTRA conta do usuario ("transfere 100 do nubank pro
  itau", "passa 50 da carteira pra poupanca", "movi 200 pro itau"). NUNCA use transfer pra pagamento de
  fatura de cartao ou pra um gasto/recebimento comum com uma unica conta envolvida.
- card_purchase: compra feita NO CARTAO DE CREDITO, a vista ou parcelada (menciona "no cartao", "cartao de
  credito", "parcelei", "em Nx", "N vezes"). Compra no cartao sem parcelamento mencionado tambem e
  card_purchase (installments=1, "a vista no cartao").
- advanced_card_action: pedido MAIS AVANCADO sobre cartao que o bot NAO executa — uma compra parcelada que
  JA ESTAVA EM ANDAMENTO antes de usar o WhatsApp ("ja estou pagando", "parcela X de Y", "proxima parcela e
  a Z"), antecipar parcela, antecipar fatura, renegociar fatura. Esses pedidos NUNCA devem ser executados
  como card_purchase — classifique como advanced_card_action pra serem redirecionados ao app.
- unsupported_action: pedido pra EDITAR, EXCLUIR, APAGAR ou CORRIGIR algo que ja foi lancado antes (uma
  transacao, conta a pagar, meta, recorrencia, cartao) — o bot NAO faz isso por mensagem, so cria
  lancamentos novos. Ex.: "exclui essa transacao", "apaga o gasto de mercado", "corrige o valor pra 50",
  "muda a categoria daquela despesa", "remove a conta de luz". Diferente de advanced_card_action (que e
  so sobre fatura/parcela de cartao) — este cobre qualquer edicao/exclusao de algo ja existente.
- create_category: PEDIDO EXPLICITO para criar categoria (verbos "cria"/"criar"/"adiciona" + a palavra "categoria").
  NUNCA use create_category so porque a categoria ideal nao existe — nesse caso e expense/income/card_purchase
  com categoryId null.
- question: pergunta sobre a situacao financeira (saldo, gastos, metas, contas a pagar) — CONSULTA de dado
  que ja existe, tipo "quanto gastei", "quanto tenho disponivel", "minhas contas venceram?".
- advisory_decision: pergunta pedindo OPINIAO sobre uma decisao financeira GRANDE ou de risco, OU qualquer
  pergunta sobre INVESTIMENTO — pegar emprestimo, financiamento, renegociar divida, tirar um cartao novo ou
  se vale a pena pagar/manter uma anuidade, ou investimento de qualquer tipo (onde investir, vale a pena
  investir em acoes/tesouro direto/fundos/criptomoeda/previdencia, etc.) — ou qualquer escolha que
  compromete o orcamento por varios meses ou e dificil de desfazer. Ex.: "devo pegar um emprestimo pra
  quitar a fatura?", "vale a pena investir em X?", "e melhor renegociar essa divida ou parcelar de novo?",
  "vale a pena tirar esse cartao, tem anuidade de 500?". NAO classifique como advisory_decision perguntas
  rotineiras (question) nem decisoes pequenas do dia a dia (tipo "posso comprar isso?", "vale a pena esse
  gasto?") — so decisoes realmente grandes/dificeis de desfazer e QUALQUER pergunta de investimento contam.
- unclear: nenhum valor/pedido claro.

Regras de valor: "10 reais"=1000, "R$ 5,50"=550, "cinco e cinquenta"=550, "dois conto"=200.
Se expense/income/transfer/card_purchase sem valor claro: amountCents=0, confidence="low".

Regras de parcelamento (so pra card_purchase): "em 10x", "10 vezes", "parcelado em 3" => installments=10/10/3.
Sem mencao de parcelamento => installments=1 (compra a vista no cartao, ainda e card_purchase).

Regras de categoria (expense/income/card_purchase): escolha a categoria EXISTENTE MAIS ESPECIFICA cujo tipo
bate com o intent detectado (expense e card_purchase usam tipo "expense" ou "both"; income usa "income" ou
"both"). Ex.: se existem "Farmacia" (expense) e "Saude" (expense) e a mensagem fala de remedio, prefira
"Farmacia". Retorne categoryId null SE E SOMENTE SE nenhuma categoria existente combinar — nunca sugira
criar uma. Transfer NUNCA tem categoria — deixe categoryId null.

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
categoryId null — esse intent NUNCA cria uma transacao junto, mesmo que a mensagem tambem cite um valor.

Regras de conta (accountId / sourceAccountId / destinationAccountId): a mensagem do usuario traz uma lista
de contas cadastradas (id: nome). Se a mensagem citar claramente o banco/conta de onde saiu ou pra onde foi
o dinheiro (ex.: "no nubank", "pelo itau", "da carteira", "pra poupanca"), combine com a conta EXISTENTE
mais parecida por nome, mesmo com apelidos/variacoes informais (ex.: "nubank" casa com uma conta chamada
"Nubank" ou "Nubank Conta"; "itau"/"itaú" casam entre si). Se a mensagem NAO citar conta nenhuma, ou
nenhuma conta bater com confianca, deixe o campo null — NUNCA adivinhe ou escolha uma conta so porque e a
unica ou a mais recente. Para expense/income, preencha accountId (source/destination ficam null). Para
transfer, preencha sourceAccountId e/ou destinationAccountId (accountId fica null) — se so uma das duas
pontas for identificavel na mensagem, preencha so essa e deixe a outra null.`;
}

export async function interpretMessage(
  text: string,
  categories: CategoryOption[],
  accounts: AccountOption[],
): Promise<MessageInterpretation | null> {
  const categoryList = categories.length > 0
    ? categories.map((c) => `  ${c.id}: ${c.name} (${c.type})`).join('\n')
    : 'Nenhuma categoria cadastrada.';

  const accountList = accounts.length > 0
    ? accounts.map((a) => `  ${a.id}: ${a.name}`).join('\n')
    : 'Nenhuma conta cadastrada.';

  const userMessage = `Mensagem: "${text}"\n\nCategorias disponiveis (id: nome (tipo)):\n${categoryList}\n\nContas disponiveis (id: nome):\n${accountList}`;

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
      accountId?: string | null;
      sourceAccountId?: string | null;
      destinationAccountId?: string | null;
      confidence?: string;
    };

    const validIntents: MessageIntent[] = [
      'expense', 'income', 'transfer', 'card_purchase', 'advanced_card_action', 'unsupported_action', 'create_category', 'question', 'advisory_decision', 'unclear',
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

    const validAccountId = (id: unknown): string | null =>
      typeof id === 'string' && accounts.some((a) => a.id === id) ? id : null;

    const accountId = validAccountId(parsed.accountId);
    let sourceAccountId = validAccountId(parsed.sourceAccountId);
    let destinationAccountId = validAccountId(parsed.destinationAccountId);
    // Transfer pra si mesma nao faz sentido — descarta os dois em vez de criar um lancamento inconsistente.
    if (sourceAccountId && sourceAccountId === destinationAccountId) {
      sourceAccountId = null;
      destinationAccountId = null;
    }

    return {
      intent,
      amountCents,
      description,
      installments,
      categoryId,
      newCategoryName,
      newCategoryType,
      newCategoryIcon,
      accountId,
      sourceAccountId,
      destinationAccountId,
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    };
  } catch {
    return null;
  }
}
