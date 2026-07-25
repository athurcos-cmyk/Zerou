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
  | 'create_category'
  | 'question'
  | 'out_of_scope'
  | 'unclear';

/**
 * Tela do app sugerida quando intent === 'out_of_scope' — substitui os antigos intents
 * `advanced_card_action`/`unsupported_action`/`bill_management_action`/`advisory_decision`
 * (cada um exigia sua própria explicação extensa no prompt pra IA discriminar). Agora a IA só
 * precisa saber a lista curta do que a Vic FAZ; qualquer outro pedido claro vira
 * `out_of_scope` + a tela mais provável — não precisa de um intent novo por caso novo.
 */
export type OutOfScopeScreen =
  | 'transacoes'
  | 'contas'
  | 'contas_a_pagar'
  | 'contas_a_receber'
  | 'cartoes'
  | 'metas'
  | 'analise'
  | 'assistente'
  | 'geral';

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
  /** Só preenchido quando intent === 'out_of_scope'; null nos outros casos. */
  suggestedScreen: OutOfScopeScreen | null;
  confidence: 'high' | 'low';
}

function buildSystemPrompt(): string {
  return `Voce interpreta mensagens em portugues brasileiro enviadas ao bot financeiro Granativa via WhatsApp.
Retorne SOMENTE um JSON com este formato:
{
  "intent": "expense" | "income" | "transfer" | "card_purchase" | "create_category" | "question" | "out_of_scope" | "unclear",
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
  "suggestedScreen": "transacoes" | "contas" | "contas_a_pagar" | "contas_a_receber" | "cartoes" | "metas" |
    "analise" | "assistente" | "geral" — SO preenchido quando intent="out_of_scope" (tela do app que resolve
    o pedido), null nos outros casos,
  "confidence": "high" | "low"
}

Como classificar intent — a Vic SO faz estas 6 coisas por mensagem. Qualquer pedido claro fora dessas 6 e
out_of_scope (ver abaixo), nunca force numa das 6 so porque a mensagem tem valor/descricao parecido:
- expense: relata gasto/compra/pagamento feito SEM ser no cartao de credito (dinheiro, pix, debito, conta).
- income: relata recebimento (salario, freela, deposito, etc.).
- transfer: move dinheiro de UMA conta do usuario pra OUTRA conta do usuario ("transfere 100 do nubank pro
  itau", "passa 50 da carteira pra poupanca", "movi 200 pro itau"). NUNCA use transfer pra pagamento de
  fatura de cartao ou pra um gasto/recebimento comum com uma unica conta envolvida.
- card_purchase: compra NOVA feita NO CARTAO DE CREDITO, a vista ou parcelada (menciona "no cartao", "cartao
  de credito", "parcelei", "em Nx", "N vezes"). Compra no cartao sem parcelamento mencionado tambem e
  card_purchase (installments=1, "a vista no cartao"). So compra nova — NUNCA uma parcela que ja estava em
  andamento antes de usar o WhatsApp (isso e out_of_scope, suggestedScreen "cartoes").
- create_category: PEDIDO EXPLICITO para criar categoria (verbos "cria"/"criar"/"adiciona" + a palavra "categoria").
  NUNCA use create_category so porque a categoria ideal nao existe — nesse caso e expense/income/card_purchase
  com categoryId null.
- question: pergunta sobre a situacao financeira que pede UM dado ESPECIFICO e AUTOCONTIDO — responde sozinha,
  sem precisar de contexto de mensagem anterior nenhuma. Ex.: "quanto gastei esse mes", "quanto tenho
  disponivel", "minhas contas venceram?", "quanto ja gastei em mercado". NAO classifique como question pedido
  de ANALISE mais aberta/comparativa (ver out_of_scope "analise" abaixo) — o WhatsApp responde cada mensagem
  isolada, sem guardar as anteriores, entao um pedido que normalmente puxa pergunta de acompanhamento
  ("e por categoria?", "e comparado a quando?") sempre sairia errado por aqui.
- out_of_scope: a mensagem tem um pedido ou intencao CLARA, mas de algo que o bot NAO executa por mensagem —
  qualquer coisa fora das 5 categorias de acao acima (expense/income/transfer/card_purchase/create_category)
  ou da question. Preencha "suggestedScreen" com a tela do app mais provavel pra resolver o pedido. Casos
  comuns (lista NAO exaustiva — use o espirito da regra pra casos parecidos que nao estao aqui):
  * Editar, excluir, apagar ou corrigir uma transacao ja lancada ("exclui essa transacao", "corrige o valor
    pra 50", "muda a categoria daquela despesa") -> suggestedScreen "transacoes".
  * Editar, excluir ou renomear uma conta bancaria/carteira ja cadastrada ("renomeia minha conta nubank",
    "apaga a conta poupanca que nao uso mais") -> suggestedScreen "contas".
  * Criar, editar ou excluir conta a pagar, recorrencia, conta fixa ou assinatura recorrente — compromisso
    FUTURO com vencimento/repeticao, NAO um gasto que ja aconteceu ("cria uma conta pra pagar o aluguel todo
    mes", "cadastra a Netflix como conta fixa", "poe minha academia como recorrencia mensal", "muda o
    vencimento daquela conta", "cancela essa recorrencia") -> suggestedScreen "contas_a_pagar". NUNCA
    confunda com expense/card_purchase (que registram um gasto JA FEITO agora).
  * O mesmo pra conta a RECEBER (criar/editar/excluir um valor a receber de terceiros) -> suggestedScreen
    "contas_a_receber".
  * Acao avancada de cartao que o bot nao executa: compra parcelada que JA ESTAVA EM ANDAMENTO antes de usar
    o WhatsApp ("ja estou pagando", "parcela X de Y", "proxima parcela e a Z"), antecipar parcela/fatura,
    renegociar fatura, ou editar/excluir um cartao cadastrado -> suggestedScreen "cartoes".
  * Criar, editar ou excluir uma meta -> suggestedScreen "metas".
  * Criar/editar limite de orcamento por categoria -> suggestedScreen "analise".
  * Pedido de ANALISE financeira mais ampla ou comparativa — nao um dado especifico isolado (ver "question"
    acima). Ex.: "como estao minhas financas esse mes", "faz uma analise dos meus gastos", "como foi
    comparado ao mes passado", "qual a tendencia dos meus gastos", "me da um resumo geral" -> suggestedScreen
    SEMPRE "assistente" (NUNCA "analise" aqui). Motivo: esse tipo de pergunta normalmente puxa pergunta de
    acompanhamento ("e por categoria?", "e comparado a quando?") e o WhatsApp nao guarda historico de
    conversa nenhum (cada mensagem e isolada) — o acompanhamento sempre sairia errado por aqui. No app, a
    aba Assistente guarda as ultimas mensagens e consegue continuar a conversa direito.
  * Decisao financeira GRANDE ou de risco (pegar emprestimo, financiamento, renegociar divida, tirar cartao
    novo ou vale a pena manter/pagar uma anuidade) OU qualquer pergunta sobre INVESTIMENTO (onde investir,
    vale a pena investir em acoes/tesouro direto/fundos/criptomoeda/previdencia etc.), ou qualquer escolha
    que compromete o orcamento por varios meses ou e dificil de desfazer -> suggestedScreen SEMPRE
    "assistente" (NUNCA "geral" aqui — decisao grande merece conversa de verdade com historico, nao um
    redirecionamento seco). Ex.: "devo pegar um emprestimo pra quitar a fatura?", "vale a pena investir em
    X?", "e melhor renegociar essa divida ou parcelar de novo?". NAO classifique como out_of_scope decisoes
    PEQUENAS do dia a dia ("posso comprar isso?", "vale a pena esse gasto?") — essas sao question (se
    pedirem um dado real) ou unclear (se nao houver pedido/valor claro nenhum).
  * Qualquer outro pedido de acao ou mudanca de configuracao que o bot nao faz e nao se encaixa em nenhuma
    tela acima -> suggestedScreen "geral".
- unclear: nenhum valor/pedido claro identificavel (cumprimento, mensagem vazia, texto sem sentido financeiro
  nenhum) — diferente de out_of_scope, que E um pedido claro, so que de algo que o bot nao executa por
  mensagem.

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
      suggestedScreen?: string | null;
      confidence?: string;
    };

    const validIntents: MessageIntent[] = [
      'expense', 'income', 'transfer', 'card_purchase', 'create_category', 'question', 'out_of_scope', 'unclear',
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

    const validScreens: OutOfScopeScreen[] = [
      'transacoes', 'contas', 'contas_a_pagar', 'contas_a_receber', 'cartoes', 'metas', 'analise', 'assistente', 'geral',
    ];
    const suggestedScreen: OutOfScopeScreen | null = intent === 'out_of_scope'
      ? (validScreens.includes(parsed.suggestedScreen as OutOfScopeScreen) ? (parsed.suggestedScreen as OutOfScopeScreen) : 'geral')
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
      accountId,
      sourceAccountId,
      destinationAccountId,
      suggestedScreen,
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
    };
  } catch {
    return null;
  }
}
