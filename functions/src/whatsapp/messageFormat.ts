import type { OutOfScopeScreen } from './interpretMessage.js';

/**
 * Templates das mensagens que o bot manda pelo WhatsApp — confirmações de lançamento e
 * perguntas de escolha (cartão/conta/transferência). Lógica pura, sem Firestore, pra poder
 * testar sem emulador (mesmo padrão de `accountResolution.ts`/`pendingAction.ts`).
 *
 * Convenção de emoji fixada aqui, não espalhar variação em outros arquivos:
 * 💸 despesa · 💰 receita · 🔄 transferência · 💳 cartão · 🏷️ categoria · 🏦 conta/banco ·
 * 🧭 fora do escopo (genérico/cartão) · 📋 contas a pagar/receber · 🎯 metas · 📊 análise/orçamento
 */

export function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function detailLine(categoryName?: string | null, accountName?: string | null): string {
  const parts: string[] = [];
  if (categoryName) parts.push(`🏷️ ${categoryName}`);
  if (accountName) parts.push(`🏦 ${accountName}`);
  return parts.length ? `\n${parts.join(' · ')}` : '';
}

export function confirmExpense(input: {
  amountCents: number;
  description: string;
  categoryName?: string | null;
  accountName?: string | null;
}): string {
  return `💸 *Despesa registrada*\n${formatBRL(input.amountCents)} — ${input.description}${detailLine(input.categoryName, input.accountName)}`;
}

export function confirmIncome(input: {
  amountCents: number;
  description: string;
  categoryName?: string | null;
  accountName?: string | null;
}): string {
  return `💰 *Receita registrada*\n${formatBRL(input.amountCents)} — ${input.description}${detailLine(input.categoryName, input.accountName)}`;
}

/** Rota (origem → destino) só aparece quando os dois nomes estão disponíveis — ver
 * webhookHandler.ts pra quando isso acontece (nem sempre, pra não gastar leitura extra). */
export function confirmTransfer(input: {
  amountCents: number;
  description: string;
  sourceAccountName?: string | null;
  destinationAccountName?: string | null;
}): string {
  const route = input.sourceAccountName && input.destinationAccountName
    ? `\n🏦 ${input.sourceAccountName} → ${input.destinationAccountName}`
    : '';
  return `🔄 *Transferência registrada*\n${formatBRL(input.amountCents)} — ${input.description}${route}`;
}

export function confirmCardPurchase(input: {
  amountCents: number;
  description: string;
  categoryName?: string | null;
  cardName: string;
  installments: number;
}): string {
  const installmentSuffix = input.installments > 1 ? ` em ${input.installments}x` : '';
  const parts = [`🏦 ${input.cardName}`];
  if (input.categoryName) parts.push(`🏷️ ${input.categoryName}`);
  return `💳 *Compra no cartão registrada*\n${formatBRL(input.amountCents)}${installmentSuffix} — ${input.description}\n${parts.join(' · ')}`;
}

export function categoryCreatedMessage(name: string): string {
  return `🏷️ Categoria *${name}* criada com sucesso!`;
}

export function categoryAlreadyExistsMessage(name: string): string {
  return `🏷️ Você já tem uma categoria chamada *${name}*.`;
}

export function numberedList(labels: string[]): string {
  return labels.map((label, i) => `${i + 1}. ${label}`).join('\n');
}

/** Prompt de escolha (cartão/conta/lado de transferência) — mesmo formato nos três casos. */
export function pendingChoicePrompt(opts: {
  emoji: string;
  question: string;
  labels: string[];
  instructions: string;
}): string {
  return `${opts.emoji} *${opts.question}*\n\n${numberedList(opts.labels)}\n\n_${opts.instructions}_`;
}

/**
 * Mensagem de redirecionamento quando o pedido é claro mas o bot não executa isso por
 * mensagem (intent `out_of_scope` em `interpretMessage.ts`) — uma por tela sugerida.
 *
 * Sem `default:` de propósito: com o retorno tipado `: string`, o TypeScript já barra no
 * build se um valor novo de `OutOfScopeScreen` ficar sem mensagem — mesma garantia de "não
 * esquecer" que outras regras de sincronia deste projeto têm, só que via compilador.
 */
export function outOfScopeMessage(screen: OutOfScopeScreen): string {
  switch (screen) {
    case 'transacoes':
      return '✋ Editar, corrigir ou excluir um lançamento que você já registrou é melhor fazer direto pelo app, na aba *Transações* — evita eu mexer na coisa errada sem querer.\n\nPor aqui eu só crio lançamentos novos e respondo perguntas.';
    case 'contas':
      return '🏦 Criar, editar ou excluir uma conta (banco, carteira, dinheiro) é melhor fazer direto pelo app, na aba *Contas*.';
    case 'contas_a_pagar':
      return '📋 Criar, editar ou excluir conta a pagar ou recorrência é melhor fazer direto pelo app, na aba *Contas a Pagar* — lá dá pra definir vencimento, frequência e até pagar no cartão.\n\nPor aqui eu só registro lançamentos que já aconteceram (gasto, receita, compra no cartão).';
    case 'contas_a_receber':
      return '📋 Criar, editar ou excluir uma conta a receber é melhor fazer direto pelo app, na aba *Contas a Receber*.';
    case 'cartoes':
      return '🧭 Isso aqui é mais avançado — dá uma olhada em *Cartões* no app pra fazer isso (parcela que já estava em andamento, antecipar parcela/fatura, renegociar, editar ou excluir um cartão).';
    case 'metas':
      return '🎯 Criar, editar ou excluir uma meta é melhor fazer direto pelo app, na aba *Metas*.';
    case 'analise':
      return '📊 Orçamento por categoria e relatórios mais a fundo são melhores de configurar direto pelo app, na aba *Análise*.';
    case 'assistente':
      // Tom deliberadamente diferente dos outros casos: não é "eu não faço isso", é "vamos
      // continuar essa conversa com calma" — decisão grande merece convite, não rejeição seca.
      // Não alinhar esse texto ao padrão genérico dos outros screens no futuro.
      return '🧠 Essa é uma decisão grande — vale mais a pena pensar nela com calma comigo lá no app, na aba *Assistente*. Lá a gente consegue ir e voltar na conversa direito.\n\nPor aqui eu foco em lançamentos e perguntas rápidas do dia a dia. 💛';
    case 'geral':
      return '🧭 Isso por aqui eu ainda não faço — dá uma olhada no app pra fazer isso direito.\n\nPor aqui eu foco em lançar despesa/receita/transferência/compra no cartão, criar categoria e responder pergunta financeira rápida.';
  }
}
