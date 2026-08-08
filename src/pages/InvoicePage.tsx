import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../auth/AuthContext';
import { useCardsContext, useFinanceContext } from '../finance/FinanceDataContext';
import { BottomSheet } from '../components/BottomSheet';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { SelectField } from '../components/SelectField';
import { useConfirm } from '../components/ConfirmDialog';
import { FormMessage } from '../components/FormMessage';
import { invoiceStatusLabels, ledgerTypeLabels } from '../cards/cardLabels';
import { anticipatedAwayEntryIds, groupAnticipatablePurchases, invoiceHasVisibleActivity } from '../cards/anticipation';
import {
  anticipateInstallments,
  recordInvoiceCredit,
  recordInvoiceFee,
  recordInvoicePayment
} from '../cards/cardService';
import { invoiceLedgerKey, mergeInvoicesWithLedger, useInvoiceLedger } from '../cards/useInvoiceLedger';
import { InvoiceStrip } from '../cards/InvoiceStrip';
import { invoiceValueCents } from '../domain/invoices/calculateInvoice';

import { formatFriendlyDate, formatFriendlyMonth, fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';

import type { InvoiceLedgerEntryType, InvoiceStatus } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

/** "fev", "fev e mar", "fev, mar e abr" */
function formatList(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Mapeia os 7 status de fatura pras 3 variantes semânticas que `.sync-badge` já tem. */
function statusBadgeVariant(status: InvoiceStatus): 'synced' | 'pending' | 'failed' {
  if (status === 'paid' || status === 'overpaid') return 'synced';
  if (status === 'overdue') return 'failed';
  return 'pending';
}

export function InvoicePage() {
  const { cardId, invoiceId } = useParams();
  const { user, profile } = useAuth();
  const workspaceId = profile?.defaultWorkspaceId;
  const cardsData = useCardsContext();
  const finance = useFinanceContext();
  const card = cardsData.cards.find((item) => item.id === cardId);
  const cardInvoices = useMemo(() => cardsData.invoices.filter((item) => item.cardId === cardId), [cardsData.invoices, cardId]);
  const invoiceRefs = useMemo(() => cardInvoices.map((item) => ({ id: item.id, cardId: item.cardId })), [cardInvoices]);
  const { entries: ledgerEntries, loading: ledgerLoading, error: ledgerError, loadedInvoiceKeys } =
    useInvoiceLedger(workspaceId, invoiceRefs, finance.transactionIndex);
  const cardInvoicesWithLedger = useMemo(
    () => mergeInvoicesWithLedger(cardInvoices, ledgerEntries, loadedInvoiceKeys),
    [cardInvoices, ledgerEntries, loadedInvoiceKeys]
  );
  const invoice = cardInvoicesWithLedger.find((item) => item.id === invoiceId);
  const { confirm, dialog: confirmDialog } = useConfirm();

  /**
   * Faturas que viram coluna na faixa do topo (`.invoice-strip`) — o gráfico É o seletor de mês.
   *
   * ⚠️ Mesma regra de visibilidade da lista em `CardDetailPage.tsx` — fatura futura que ficou vazia
   * (única parcela antecipada pra cá) some de lá de propósito, e a coluna não pode ser um atalho
   * pra uma tela que a lista esconde. `!loadedInvoiceKeys.has(...)` mantém no caminho a fatura cujo
   * ledger ainda não chegou: sem isso, no cache frio TODAS somem e a faixa fica vazia (foi o "só
   * aparece a fatura atual" de 07/08/2026).
   *
   * `cardsData.invoices` já vem ordenado por `referenceMonth asc` (`useCardsData.ts:184`) e o
   * filtro preserva a ordem, então a faixa sai do mês mais velho pro mais novo sem reordenar nada.
   */
  const stripInvoices = useMemo(
    () =>
      cardInvoicesWithLedger.filter(
        (item) =>
          !loadedInvoiceKeys.has(invoiceLedgerKey(item.cardId, item.id)) ||
          invoiceHasVisibleActivity(item.ledgerEntries)
      ),
    [cardInvoicesWithLedger, loadedInvoiceKeys]
  );


  const [paySheetOpen, setPaySheetOpen] = useState(false);
  /** Explicação do "antecipar" — vive numa folha, não no corpo da tela. Ver `.invoice-explain-link`. */
  const [explainSheetOpen, setExplainSheetOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(todayInputValue());
  const [paySubmitting, setPaySubmitting] = useState(false);
  /** Mensagem DENTRO do sheet de pagamento — separada de `message` (que fica na página) porque o
   *  motivo de não dar pra pagar tem que aparecer onde a pessoa está olhando, com o sheet aberto. */
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const paidAtRef = useRef(new Date());

  const [creditAmount, setCreditAmount] = useState('');
  const [creditType, setCreditType] = useState<'refund_credit' | 'chargeback_credit' | 'manual_credit'>('refund_credit');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeType, setFeeType] = useState<'interest' | 'fine' | 'iof' | 'fee' | 'manual_debit'>('fee');
  // Quantas das ÚLTIMAS parcelas antecipar, por compra (sourceTransactionId → N).
  const [anticipateCounts, setAnticipateCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  /** `danger` por padrão (todo o resto da tela só reporta erro); vira `success` na confirmação de
   *  pagamento — que antes não existia, e cuja ausência fazia a pessoa achar que não tinha ido. */
  const [messageType, setMessageType] = useState<'success' | 'danger'>('danger');

  // Lista de Compras: colapsada além de 5 linhas, com busca por nome só quando há
  // muitas compras diferentes na fatura (não ajuda quando é a mesma compra parcelada
  // repetida — nesse caso o "ver todas" já resolve).
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [purchaseSearchOpen, setPurchaseSearchOpen] = useState(false);
  const [purchaseQuery, setPurchaseQuery] = useState('');
  const PURCHASES_COLLAPSE_THRESHOLD = 5;
  const PURCHASES_SEARCH_THRESHOLD = 8;

  const txnDescriptions = new Map(
    finance.transactions
      .filter((t) => t.type === 'card_purchase' && t.cardId === cardId && !t.deletedAt)
      .map((t) => [t.id, t.description])
  );

  const anticipatableGroups = invoice
    ? groupAnticipatablePurchases(cardInvoicesWithLedger, invoice).map((group) => ({
        ...group,
        description: txnDescriptions.get(group.sourceTransactionId) ?? 'Compra parcelada'
      }))
    : [];

  const anticipateTotalCents = anticipatableGroups.reduce((total, group) => {
    const count = anticipateCounts[group.sourceTransactionId] ?? 0;
    return total + group.installments.slice(0, count).reduce((sum, inst) => sum + inst.amountCents, 0);
  }, 0);

  function handleOpenPaySheet() {
    setPayAmount('');
    setPayAccountId('');
    setPayDate(todayInputValue());
    setPaySubmitting(false);
    setPayMessage(null);
    // Instante congelado na ABERTURA do sheet, e é ele que entra no id idempotente do pagamento
    // (`recordInvoicePayment`). Duplo clique dentro do mesmo sheet reusa o mesmo id — a proteção
    // do FIN-03 continua valendo. Reabrir o sheet gera id novo, o que **destrava a retentativa**:
    // antes o id vinha de `fromDateInputValue`, que devolve meio-dia com 0 ms, então tentar de
    // novo no mesmo dia com os mesmos valores gerava id idêntico, o ledger recusava (`allow
    // update: if false`) e o erro era engolido — nenhuma retentativa jamais funcionava.
    paidAtRef.current = new Date();
    setPaySheetOpen(true);
  }

  function handlePay() {
    if (!workspaceId || !user || !cardId || !invoiceId || paySubmitting) return;
    // ⚠️ Estas guardas MOSTRAM o motivo e mantêm o sheet aberto. Antes eram `return` mudos: com o
    // saldo em aberto igual a 0 (ou com o ledger ainda carregando, que faz `calculateInvoice([])`
    // devolver 0), o clique não escrevia nada, não fechava o sheet e não dizia nada — foi o
    // "cliquei pra pagar e simplesmente não vai" relatado em 06/08/2026.
    if (!payAccountId) {
      setPayMessage('Escolha a conta de onde vai sair o pagamento.');
      return;
    }
    if (ledgerLoading) {
      setPayMessage('Ainda carregando os lançamentos da fatura — aguarde um instante.');
      return;
    }
    // `parseMoneyToCents` LANÇA com texto não-numérico (`money.ts`), e exceção dentro de handler de
    // clique não mostra nada pro usuário — mais um caminho de falha muda deste fluxo, achado
    // escrevendo o teste desta correção.
    let amount: number;
    try {
      amount = payAmount.trim() ? parseMoneyToCents(payAmount) : (invoice?.outstandingBalanceCents ?? 0);
    } catch (err) {
      setPayMessage(getUserFacingErrorMessage(err, 'Informe um valor em reais válido.'));
      return;
    }
    if (!amount) {
      setPayMessage(
        payAmount.trim()
          ? 'Informe um valor maior que zero.'
          : 'Esta fatura não tem saldo em aberto. Se quiser registrar outro pagamento, digite o valor.'
      );
      return;
    }

    setPaySubmitting(true);
    setPaySheetOpen(false);
    setPayMessage(null);
    setMessage(null);
    const paidAt = payDate === todayInputValue() ? paidAtRef.current : fromDateInputValue(payDate);
    recordInvoicePayment(workspaceId, user.uid, {
      cardId,
      invoiceId,
      accountId: payAccountId,
      amountCents: amount,
      paidAt,
      advance: invoice?.status === 'open'
    })
      // `recordInvoicePayment` agora DEVOLVE a promise do commit (antes usava `fireWrite`, que tem
      // catch vazio em produção — este `.catch` era código morto e nenhuma rejeição das regras
      // aparecia pra ninguém). O sheet já fechou acima, então offline-first segue intacto: ninguém
      // espera o servidor pra liberar a UI.
      .then(() => {
        setMessageType('success');
        setMessage(`Pagamento de ${formatMoney(amount)} registrado.`);
      })
      .catch((err) => {
        setMessageType('danger');
        setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o pagamento.'));
      })
      .finally(() => setPaySubmitting(false));
  }

  async function handleAnticipation() {
    if (!workspaceId || !user || !cardId || !invoiceId) return;
    // Por compra, as N ÚLTIMAS parcelas (o grupo já vem ordenado da última pra primeira).
    // `installmentTotal` vem do grupo (não de cada parcela) — leva junto pra poder rotular
    // "parcela 8/10 antecipada" na fatura de origem, em vez de um genérico sem número.
    const selected = anticipatableGroups.flatMap((group) =>
      group.installments
        .slice(0, anticipateCounts[group.sourceTransactionId] ?? 0)
        .map((inst) => ({ ...inst, installmentTotal: group.installmentTotal }))
    );
    if (selected.length === 0) return;

    // Explica o que se move (decisão #4 da spec) + avisa que é irreversível.
    const leavingMonths = [...new Set(selected.map((inst) => inst.referenceMonth))]
      .sort()
      .map((rm) => format(new Date(Number(rm.slice(0, 4)), Number(rm.slice(5, 7)) - 1, 1), 'MMM/yyyy', { locale: ptBR }));
    const monthsLabel = formatList(leavingMonths);
    const ok = await confirm({
      title: `Antecipar ${selected.length} ${selected.length === 1 ? 'parcela' : 'parcelas'}?`,
      message: `${selected.length === 1 ? 'Ela sai' : 'Elas saem'} das faturas de ${monthsLabel} e ${selected.length === 1 ? 'passa' : 'passam'} a contar nesta fatura agora — total ${formatMoney(anticipateTotalCents)}. Seu limite não muda; só o mês em que cada parcela pesa. Isso não pode ser desfeito.`,
      confirmLabel: 'Antecipar',
      danger: false
    });
    if (!ok) return;

    const credits = selected.map((inst) => ({
      invoiceId: inst.invoiceId,
      amountCents: inst.amountCents,
      sourceTransactionId: inst.sourceTransactionId,
      installmentNumber: inst.installmentNumber,
      installmentTotal: inst.installmentTotal
    }));
    setAnticipateCounts({});
    setMessage(null);
    anticipateInstallments(workspaceId, user.uid, {
      cardId,
      currentInvoiceId: invoiceId,
      credits,
      effectiveAt: new Date()
    }).catch((err) => {
      setMessageType('danger');
      setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a antecipação.'));
    });
  }

  function handleCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user || !cardId || !invoiceId) return;
    const amount = parseMoneyToCents(creditAmount);
    if (!amount) return;
    setMessage(null);
    setCreditAmount('');
    recordInvoiceCredit(workspaceId, user.uid, {
      cardId,
      invoiceId,
      type: creditType,
      amountCents: amount,
      effectiveAt: new Date(),
      description: ledgerTypeLabels[creditType]
    }).catch((err) => {
      setMessageType('danger');
      setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o crédito.'));
    });
  }

  function handleFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !user || !cardId || !invoiceId) return;
    const amount = parseMoneyToCents(feeAmount);
    if (!amount) return;
    setMessage(null);
    setFeeAmount('');
    recordInvoiceFee(workspaceId, user.uid, {
      cardId,
      invoiceId,
      type: feeType,
      amountCents: amount,
      effectiveAt: new Date(),
      description: ledgerTypeLabels[feeType]
    }).catch((err) => {
      setMessageType('danger');
      setMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar a tarifa.'));
    });
  }

  if (!invoice && !cardsData.loading) {
    return (
      <section className="page-content page-content--narrow">
        <p className="eyebrow">Fatura</p>
        <h1 className="page-title">Fatura não encontrada.</h1>
        <Link className="button button--secondary" to={`/app/cards/${cardId ?? ''}`}>
          Voltar ao cartão
        </Link>
      </section>
    );
  }

  const isPaid = invoice?.status === 'paid' || invoice?.status === 'overpaid';
  const isOpen = invoice?.status === 'open';
  // Parcela que foi antecipada PRA FORA desta fatura: o crédito que a cancela nasce aqui
  // mesmo (na fatura de origem), e mostrar "compra R$300 / crédito -R$300" lado a lado é ruído
  // — no cartão de verdade a parcela antecipada só SOME da fatura futura. `anticipatedAwayEntryIds`
  // casa cada parcela com o crédito que a anula (mesma compra, mesmo valor).
  const hiddenEntryIds = invoice ? anticipatedAwayEntryIds(invoice.ledgerEntries) : new Set<string>();
  // 'installment_anticipation' entra aqui de propósito: é um débito real que soma no
  // `purchasesTotalCents` do hero (calculateInvoice), então precisa aparecer na lista —
  // senão o total "Compras" não bate com a soma das linhas mostradas. Diferente do caso
  // acima: essa é a parcela pousando AGORA nesta fatura, sempre visível.
  const purchases = (invoice?.ledgerEntries.filter((e) => e.type === 'purchase' || e.type === 'installment_anticipation') ?? []).filter(
    (e) => !hiddenEntryIds.has(e.id)
  );
  const payments = invoice?.ledgerEntries.filter((e) => e.type === 'payment' || e.type === 'advance_payment') ?? [];

  // Label + prefixo ("parcela 8/10 antecipada") resolvidos uma vez só, pra poder
  // filtrar por nome e colapsar sem duplicar essa lógica no JSX.
  const purchaseRows = purchases.map((entry) => {
    const label = txnDescriptions.get(entry.sourceTransactionId ?? '') ?? ledgerTypeLabels[entry.type as InvoiceLedgerEntryType];
    const isAnticipated = entry.type === 'installment_anticipation';
    const installment =
      entry.installmentNumber && entry.installmentTotal ? `parcela ${entry.installmentNumber}/${entry.installmentTotal}` : null;
    const prefix = isAnticipated ? (installment ? `${installment} antecipada` : 'Parcela antecipada') : installment;
    return { entry, label, prefix };
  });
  const normalizedPurchaseQuery = purchaseQuery.trim().toLocaleLowerCase('pt-BR');
  const isSearchingPurchases = purchaseSearchOpen && normalizedPurchaseQuery.length > 0;
  const filteredPurchaseRows = isSearchingPurchases
    ? purchaseRows.filter((row) => row.label.toLocaleLowerCase('pt-BR').includes(normalizedPurchaseQuery))
    : purchaseRows;
  // Buscando, mostra todo mundo que bateu (a pessoa já filtrou pelo que queria ver).
  // Sem busca, respeita o colapso — "ver todas" existe justamente pra não repetir isso.
  const visiblePurchaseRows =
    isSearchingPurchases || showAllPurchases ? filteredPurchaseRows : filteredPurchaseRows.slice(0, PURCHASES_COLLAPSE_THRESHOLD);

  // Números do resumo (hero) descontando o par antecipado/anulado — senão "Compras: R$300"
  // ficaria contradizendo a lista logo abaixo, que não mostra mais essa parcela.
  const hiddenPurchaseCents =
    invoice?.ledgerEntries.filter((e) => e.type === 'purchase' && hiddenEntryIds.has(e.id)).reduce((s, e) => s + e.amountCents, 0) ?? 0;
  // 'purchase_reversal' entra aqui de propósito: é o estorno de uma compra excluída no
  // Extrato (reverseCardPurchaseOnDelete) — soma em `creditsTotalCents` igual a uma
  // antecipação, e sem contar aqui o par escondido ficava com "Créditos" inflado pra sempre.
  const hiddenCreditCents =
    invoice?.ledgerEntries
      .filter(
        (e) => (e.type === 'installment_anticipation_credit' || e.type === 'purchase_reversal') && hiddenEntryIds.has(e.id)
      )
      .reduce((s, e) => s + e.amountCents, 0) ?? 0;
  const displayPurchasesTotalCents = (invoice?.purchasesTotalCents ?? 0) - hiddenPurchaseCents;
  const displayCreditsTotalCents = (invoice?.creditsTotalCents ?? 0) - hiddenCreditCents;
  const hasVisibleBreakdown =
    displayPurchasesTotalCents > 0 ||
    displayCreditsTotalCents > 0 ||
    (invoice?.feesTotalCents ?? 0) > 0 ||
    (invoice?.paymentsTotalCents ?? 0) > 0;

  /**
   * Numa fatura já quitada o hero mostra **quanto foi gasto**, não o saldo.
   *
   * Pedido do dono (08/08/2026): abrir a fatura de agosto e ver "Fatura paga · R$ 0,00" com o valor
   * real escondido na linha "Compras" logo abaixo — *"clico em agosto e quero ver de cara quanto
   * gastei"*. "Quanto ainda devo" é uma pergunta que só existe enquanto há dívida; respondê-la com
   * zero num mês encerrado gasta o maior número da tela pra não dizer nada.
   *
   * Usa os totais de EXIBIÇÃO (já sem o par parcela↔crédito antecipado) e não os crus: o hero fica
   * em cima da lista de Compras, e os dois têm que fechar a conta na mesma tela. Mesma fórmula da
   * altura da coluna no gráfico — o número do hero é literalmente o tamanho da coluna acesa.
   */
  const heroAmountCents =
    isPaid && invoice
      ? invoiceValueCents({
          purchasesTotalCents: displayPurchasesTotalCents,
          feesTotalCents: invoice.feesTotalCents,
          creditsTotalCents: displayCreditsTotalCents
        })
      : (invoice?.outstandingBalanceCents ?? 0);

  return (
    <section className="page-content page-content--narrow invoice-page">
      <div className="page-heading-row page-heading-row--icon-trailing">
        <div>
          <p className="eyebrow">Fatura · {card?.name ?? ''}</p>
          <h1 className="page-title">{invoice ? formatFriendlyMonth(invoice.referenceMonth) : 'Carregando…'}</h1>
        </div>
        <Link className="icon-button" to={`/app/cards/${cardId ?? ''}`} aria-label="Voltar ao cartão">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
      </div>

      <FormMessage type={messageType}>{message}</FormMessage>
      {ledgerError && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: '0.75rem' }}>{ledgerError}</div>
      )}

      {/* Fica ANTES do hero de propósito: primeiro a pessoa escolhe de que mês está falando, aí lê
          o valor. Ver `InvoiceStrip.tsx` — o componente é compartilhado com a tela do Cartão. */}
      <InvoiceStrip invoices={stripInvoices} activeInvoiceId={invoiceId} cardId={cardId ?? ''} />

      {invoice ? (
        <>
          {/* Hero — SÓ DADO. Decisão do dono (07/08/2026): o gradiente da marca é pra número e
              fato, nunca pra ação nem pra texto explicativo. Antes ele também abrigava o botão de
              pagar e um parágrafo de 4 linhas, e com isso ocupava 396px — 49% da primeira tela num
              iPhone —, com a explicação em branco-sobre-laranja, o texto menos legível da tela. O
              botão desceu pro fundo claro (`.invoice-actions`) e a explicação virou folha
              (`explainSheetOpen`). Vale igual pro hero de limite em `CardDetailPage.tsx`, que já
              seguia a regra por acaso: tudo dentro dele é dado, e a barra precisa do fundo colorido. */}
          <div className="invoice-hero">
            <div className="invoice-hero-top">
              <div className="invoice-hero-main">
                <p className="eyebrow">
                  {isPaid ? 'Total gasto' : 'Valor a pagar'}
                </p>
                <span className="invoice-hero-amount">
                  {formatMoney(heroAmountCents)}
                </span>
                <p className="text-secondary invoice-hero-due">
                  Vence {formatFriendlyDate(invoice.dueDate)}
                  {isOpen ? ' · fatura ainda aberta' : ''}
                </p>
              </div>
              <span className={`sync-badge sync-badge--${statusBadgeVariant(invoice.status)}`}>{invoiceStatusLabels[invoice.status]}</span>
            </div>

            {hasVisibleBreakdown && (
            <div className="invoice-breakdown">
              {displayPurchasesTotalCents > 0 && (
                <span>Compras<strong>{formatMoney(displayPurchasesTotalCents)}</strong></span>
              )}
              {displayCreditsTotalCents > 0 && (
                <span>Créditos<strong className="amount--income">− {formatMoney(displayCreditsTotalCents)}</strong></span>
              )}
              {invoice.feesTotalCents > 0 && (
                <span>Juros/tarifas<strong className="amount--expense">+ {formatMoney(invoice.feesTotalCents)}</strong></span>
              )}
              {invoice.paymentsTotalCents > 0 && (
                <span>Pagamentos<strong className="amount--income">− {formatMoney(invoice.paymentsTotalCents)}</strong></span>
              )}
            </div>
            )}
          </div>

          {/* Ação no fundo claro, fora do gradiente. O rótulo perdeu o parêntese explicativo
              ("Antecipar fatura (pagar antes de fechar)") — ele quebrava em duas linhas e ainda
              assim repetia o parágrafo que vinha logo abaixo. Rótulo curto + um link que abre a
              explicação inteira numa folha. */}
          {!isPaid && (
            <div className="invoice-actions">
              <button className="button button--primary button--block" type="button" onClick={handleOpenPaySheet}>
                {isOpen ? 'Antecipar fatura' : 'Pagar fatura'}
              </button>
              {isOpen && (
                <button className="invoice-explain-link" type="button" onClick={() => setExplainSheetOpen(true)}>
                  Entenda o que muda <ChevronRight size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {/* Compras desta fatura */}
          <article className="surface surface-pad">
            <div className="section-heading">
              <p className="eyebrow" style={{ margin: 0 }}>Compras</p>
              {purchases.length > PURCHASES_SEARCH_THRESHOLD && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={purchaseSearchOpen ? 'Fechar busca' : 'Buscar compra por nome'}
                  onClick={() => {
                    setPurchaseSearchOpen((v) => !v);
                    setPurchaseQuery('');
                  }}
                >
                  <Search size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            {purchaseSearchOpen && (
              <input
                className="input"
                type="text"
                value={purchaseQuery}
                onChange={(e) => setPurchaseQuery(e.target.value)}
                placeholder="Buscar por nome..."
                autoFocus
                style={{ marginBottom: '0.75rem' }}
              />
            )}
            {/* `.entry-row` no lugar de `.list-row`: aquele é flex sem `min-width: 0` na coluna de
                texto, então a 375px o valor era empurrado pra uma linha própria embaixo — o
                dinheiro, que o design system elege como herói, virava rodapé da linha. E o vermelho
                saiu: TODA compra é despesa, então vermelho em 11 de 11 linhas não distinguia nada
                (mesma regra do `.day-group-total`, DESIGN.md). */}
            {visiblePurchaseRows.length > 0 ? (
              <div className="item-list item-list--entries">
                {visiblePurchaseRows.map(({ entry, label, prefix }) => (
                  <div className="entry-row" key={entry.id}>
                    <div className="entry-row-main">
                      <strong className="entry-row-label">{label}</strong>
                      <span className="entry-row-meta">
                        {prefix ? `${prefix} · ` : ''}
                        {formatFriendlyDate(entry.effectiveAt)}
                      </span>
                    </div>
                    <span className="entry-row-amount">{formatMoney(entry.amountCents)}</span>
                  </div>
                ))}
              </div>
            ) : isSearchingPurchases ? (
              <p className="text-secondary">Nenhuma compra encontrada para "{purchaseQuery.trim()}".</p>
            ) : hiddenEntryIds.size > 0 ? (
              <p className="text-secondary">A parcela que caía aqui foi antecipada pra uma fatura anterior.</p>
            ) : ledgerLoading ? (
              <LoadingState compact />
            ) : (
              <EmptyState illustration="cards" title="Nenhuma compra nesta fatura ainda." compact />
            )}
            {!isSearchingPurchases && filteredPurchaseRows.length > PURCHASES_COLLAPSE_THRESHOLD && (
              <button type="button" className="list-toggle" onClick={() => setShowAllPurchases((v) => !v)}>
                {showAllPurchases ? (
                  <>Ver menos <ChevronUp size={14} aria-hidden="true" /></>
                ) : (
                  <>Ver todas as {filteredPurchaseRows.length} compras <ChevronDown size={14} aria-hidden="true" /></>
                )}
              </button>
            )}
          </article>

          {/* Pagamentos registrados */}
          {payments.length > 0 && (
            <article className="surface surface-pad">
              <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Pagamentos</p>
              {/* Aqui o verde FICA: numa tela onde tudo é dívida, pagamento é a única linha que
                  anda no sentido contrário — e o `−` sozinho é fácil demais de não ver. */}
              <div className="item-list item-list--entries">
                {payments.map((entry) => (
                  <div className="entry-row" key={entry.id}>
                    <div className="entry-row-main">
                      <strong className="entry-row-label">{ledgerTypeLabels[entry.type as InvoiceLedgerEntryType]}</strong>
                      <span className="entry-row-meta">{formatFriendlyDate(entry.effectiveAt)}</span>
                    </div>
                    <span className="entry-row-amount amount--income">− {formatMoney(entry.amountCents)}</span>
                  </div>
                ))}
              </div>
            </article>
          )}

          {/* Ações avançadas — antecipar só faz sentido na fatura que ainda acumula
              compras. Numa fatura fechada ou paga, o débito da antecipação entraria
              num ciclo que já terminou. */}
          {isOpen && (
          <details className="advanced-panel">
            <summary>Antecipar parcelas de faturas futuras</summary>
            <div className="form-stack" style={{ marginTop: '0.75rem' }}>
              {/* O corpo precisa vir dentro de um <p>: `.anticipation-explain` é `display: grid`, e
                  num contêiner de grid cada trecho de texto solto entre elementos vira um item
                  anônimo — "Traz as", "últimas" e o resto da frase quebravam em três linhas
                  separadas. Bug que ninguém via porque o painel nasce fechado. */}
              <div className="anticipation-explain">
                <strong>O que é antecipar?</strong>
                <p>
                  Traz as <strong>últimas</strong> parcelas de uma compra para esta fatura — pagando adiantado da última
                  pra trás, como no cartão. O valor entra aqui e sai das faturas futuras; o total devido não muda.
                </p>
              </div>
              {anticipatableGroups.length === 0 ? (
                <p className="text-secondary" style={{ fontSize: '0.86rem' }}>Nenhuma parcela futura disponível.</p>
              ) : (
                <>
                  {anticipatableGroups.map((group) => {
                    const available = group.installments.length;
                    const count = anticipateCounts[group.sourceTransactionId] ?? 0;
                    const selected = group.installments.slice(0, count);
                    const groupTotal = selected.reduce((s, inst) => s + inst.amountCents, 0);
                    // A "próxima a antecipar" é a última ainda não marcada.
                    const nextToAnticipate = group.installments[count];
                    const parcelaLabel = (n?: number) =>
                      n && group.installmentTotal ? `parcela ${n}/${group.installmentTotal}` : null;

                    return (
                      <div key={group.sourceTransactionId} className="anticipation-group">
                        <div className="anticipation-group-head">
                          <strong className="anticipation-group-name">{group.description}</strong>
                          <span className="text-secondary" style={{ fontSize: '0.82rem' }}>
                            {available} {available === 1 ? 'parcela futura' : 'parcelas futuras'}
                          </span>
                        </div>
                        <div className="anticipation-stepper">
                          <button
                            className="anticipation-step-btn"
                            type="button"
                            aria-label="Antecipar menos"
                            disabled={count === 0}
                            onClick={() =>
                              setAnticipateCounts((prev) => ({
                                ...prev,
                                [group.sourceTransactionId]: Math.max(0, (prev[group.sourceTransactionId] ?? 0) - 1)
                              }))
                            }
                          >
                            −
                          </button>
                          <span className="anticipation-step-value">
                            {count === 0
                              ? 'Nenhuma'
                              : `${count} ${count === 1 ? 'última' : 'últimas'}`}
                          </span>
                          <button
                            className="anticipation-step-btn"
                            type="button"
                            aria-label="Antecipar mais"
                            disabled={count >= available}
                            onClick={() =>
                              setAnticipateCounts((prev) => ({
                                ...prev,
                                [group.sourceTransactionId]: Math.min(available, (prev[group.sourceTransactionId] ?? 0) + 1)
                              }))
                            }
                          >
                            +
                          </button>
                        </div>
                        <span className="text-muted anticipation-group-hint">
                          {count === 0
                            ? nextToAnticipate
                              ? `Próxima a antecipar: ${parcelaLabel(nextToAnticipate.installmentNumber) ?? `fatura ${formatFriendlyMonth(nextToAnticipate.referenceMonth)}`}`
                              : ''
                            : `${parcelaLabel(selected[selected.length - 1].installmentNumber) ?? `fatura ${formatFriendlyMonth(selected[selected.length - 1].referenceMonth)}`} até ${parcelaLabel(selected[0].installmentNumber) ?? `fatura ${formatFriendlyMonth(selected[0].referenceMonth)}`} · ${formatMoney(groupTotal)}`}
                        </span>
                      </div>
                    );
                  })}
                  {anticipateTotalCents > 0 && (
                    <div className="anticipation-confirm-row">
                      <span className="text-secondary" style={{ fontSize: '0.86rem' }}>
                        Total: <strong>{formatMoney(anticipateTotalCents)}</strong>
                      </span>
                      <button className="button button--secondary" type="button" onClick={() => void handleAnticipation()}>
                        Confirmar antecipação
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </details>
          )}

          <details className="advanced-panel">
            <summary>Estornos, créditos e tarifas</summary>
            <div className="form-stack" style={{ marginTop: '0.75rem' }}>
              <form className="form-stack" onSubmit={handleCredit}>
                <p className="eyebrow">Crédito / estorno</p>
                <SelectField
                  label="Tipo"
                  value={creditType}
                  onChange={(v) => setCreditType(v as typeof creditType)}
                  options={[
                    { value: 'refund_credit', label: 'Estorno de compra' },
                    { value: 'chargeback_credit', label: 'Chargeback' },
                    { value: 'manual_credit', label: 'Crédito manual' }
                  ]}
                />
                <input className="input" inputMode="decimal" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">Registrar crédito</button>
              </form>
              <form className="form-stack" onSubmit={handleFee} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                <p className="eyebrow">Tarifa / juros</p>
                <SelectField
                  label="Tipo"
                  value={feeType}
                  onChange={(v) => setFeeType(v as typeof feeType)}
                  options={[
                    { value: 'fee', label: 'Tarifa da operadora' },
                    { value: 'interest', label: 'Juros por atraso' },
                    { value: 'fine', label: 'Multa' },
                    { value: 'iof', label: 'IOF' },
                    { value: 'manual_debit', label: 'Débito manual' }
                  ]}
                />
                <input className="input" inputMode="decimal" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="0,00" />
                <button className="button button--secondary" type="submit">Registrar tarifa</button>
              </form>
            </div>
          </details>
        </>
      ) : null}

      {/* BottomSheet de pagamento */}
      <BottomSheet
        open={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        title={isOpen ? 'Antecipar fatura' : 'Pagar fatura'}
        // Enquanto o ledger carrega, `mergeInvoicesWithLedger` recalcula os totais a partir de uma
        // lista vazia e o saldo em aberto sai como R$ 0,00 — anunciar isso como fato era o que
        // levava a pessoa a confirmar um pagamento de zero.
        subtitle={
          invoice
            ? `${formatFriendlyMonth(invoice.referenceMonth)} · ${ledgerLoading ? 'carregando o saldo…' : `${formatMoney(invoice.outstandingBalanceCents)} em aberto`}`
            : undefined
        }
      >
        <div className="form-stack">
          {/* `.pay-preview` no TOPO da folha, não uma nota solta no rodapé: o efeito tem que ser
              lido antes de preencher, não depois. Com a explicação longa fora da tela (virou
              folha), esta frase é o que garante que ninguém antecipa sem saber o que acontece. */}
          {invoice && (
            <p className="pay-preview">
              {isOpen
                ? `Vamos registrar este pagamento na fatura de ${formatFriendlyMonth(invoice.referenceMonth)}, que ainda está aberta — o limite volta na hora.`
                : `Vamos registrar este pagamento na fatura de ${formatFriendlyMonth(invoice.referenceMonth)}.`}
            </p>
          )}
          <label className="field">
            <span>Valor a pagar</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={ledgerLoading ? 'carregando…' : invoice ? formatMoney(invoice.outstandingBalanceCents) : '0,00'}
              autoFocus
            />
            <span className="field-hint">Deixe em branco para pagar o total.</span>
          </label>
          <div className="field">
            <span className="field-label">De qual conta sai?</span>
            <div className="chip-row">
              {finance.accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${payAccountId === a.id ? ' chip--active' : ''}`}
                  onClick={() => setPayAccountId(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
            {finance.accounts.length === 0 && (
              <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                Cadastre uma conta em <Link to="/app/accounts" className="inline-link">Contas</Link> para registrar o pagamento.
              </p>
            )}
          </div>
          <label className="field">
            <span>Data do pagamento</span>
            <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </label>
          <FormMessage>{payMessage}</FormMessage>
          <div className="sheet-actions">
            {/* Só `paySubmitting` desabilita. Conta não escolhida, saldo zero e ledger carregando
                agora viram MENSAGEM no `handlePay` — botão desabilitado sem dizer por quê é o
                mesmo "estado morto" que a tela de Contas e assinaturas já corrigiu em 02/08. */}
            <button className="button button--primary" type="button" disabled={paySubmitting} onClick={handlePay}>
              Confirmar pagamento
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* A explicação que morava no hero em branco-sobre-laranja. Numa folha ela ganha contraste
          normal, espaço pra separar os DOIS conceitos que as pessoas confundem (antecipar a
          fatura × antecipar uma parcela) e sai do caminho de quem já sabe o que está fazendo. */}
      <BottomSheet
        open={explainSheetOpen}
        onClose={() => setExplainSheetOpen(false)}
        title="Antecipar fatura"
        subtitle="O que muda quando você antecipa"
      >
        <div className="form-stack">
          <div className="explain-item">
            <strong>Antecipar a fatura</strong>
            <p>
              É quitar este ciclo antes do fechamento. O valor sai da conta que você escolher e o limite volta na hora,
              sem esperar o vencimento.
            </p>
          </div>
          <div className="explain-item">
            <strong>Antecipar uma parcela</strong>
            <p>
              É outra coisa: traz uma parcela de um mês futuro pra esta fatura. O total que você deve não muda — ele só
              sai de lá e entra aqui. Fica em "Antecipar parcelas de faturas futuras", mais abaixo nesta tela.
            </p>
          </div>
        </div>
      </BottomSheet>
      {confirmDialog}
    </section>
  );
}
