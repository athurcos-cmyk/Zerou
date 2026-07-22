/**
 * Templates das mensagens que o bot manda pelo WhatsApp — confirmações de lançamento e
 * perguntas de escolha (cartão/conta/transferência). Lógica pura, sem Firestore, pra poder
 * testar sem emulador (mesmo padrão de `accountResolution.ts`/`pendingAction.ts`).
 *
 * Convenção de emoji fixada aqui, não espalhar variação em outros arquivos:
 * 💸 despesa · 💰 receita · 🔄 transferência · 💳 cartão · 🏷️ categoria · 🏦 conta/banco
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
