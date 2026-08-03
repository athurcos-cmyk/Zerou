import { useState, type FormEvent } from 'react';
import { ArrowLeftRight, Check, HandCoins } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import { CategoryField } from '../../components/CategoryField';
import { confirmSettlementReceipt, registerSettlementPayment } from '../../shared/sharedService';
import { useCategoryActions } from '../../finance/useCategoryActions';
import { formatMoney, parseMoneyToCents } from '../../finance/money';
import { getUserFacingErrorMessage } from '../../utils/userFacingError';
import { memberLabel } from './memberLabel';
import type { useCoupleWriteGate } from '../../shared/coupleWriteGate';
import type { useFinanceContext } from '../../finance/FinanceDataContext';
import type { MemberBalance } from '../../domain/shared/calculateSharedBalances';
import type { Settlement, WorkspaceMembership } from '../../types/contracts';

interface CoupleSettlementSectionProps {
  workspaceId: string;
  userId: string;
  activeMembers: WorkspaceMembership[];
  partnerMember: WorkspaceMembership | undefined;
  balances: MemberBalance[];
  settlements: Settlement[];
  personalWorkspaceId: string | undefined;
  personalFinance: ReturnType<typeof useFinanceContext>;
  gate: ReturnType<typeof useCoupleWriteGate>;
  onMessage: (message: string | null) => void;
}

/**
 * "Quem deve quanto a quem" + quitar — a ponta que fechava o ciclo das despesas divididas e
 * **nunca teve tela** até 2026-08-03.
 *
 * `calculateSharedBalances` e `suggestSettlement` já eram calculados em
 * `useSharedWorkspaceData`, a coleção `settlements` já era assinada (custando leitura em cada
 * abertura) e nada disso aparecia em lugar nenhum: o app mostrava a divisão e nunca dizia quem
 * devia quanto, nem deixava acertar.
 *
 * Cada pessoa lança só o SEU lado, nunca o da outra: quem pagou registra a saída da conta dele,
 * quem recebeu confirma a entrada na conta dela. Não é cerimônia — a transação do parceiro vive
 * no workspace pessoal dele, que as regras do Firestore não deixam ninguém tocar. E casa com a
 * regra de voz do app: o Granativa não move dinheiro, a pessoa confirma um fato passado.
 */
export function CoupleSettlementSection({
  workspaceId,
  userId,
  activeMembers,
  partnerMember,
  balances,
  settlements,
  personalWorkspaceId,
  personalFinance,
  gate,
  onMessage
}: CoupleSettlementSectionProps) {
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payCategoryId, setPayCategoryId] = useState('');
  const [receiptTarget, setReceiptTarget] = useState<Settlement | null>(null);
  const [receiptAccountId, setReceiptAccountId] = useState('');
  const payCategoryActions = useCategoryActions(setPayCategoryId);

  const myBalance = balances.find((item) => item.userId === userId)?.balanceCents ?? 0;
  const partnerLabel = memberLabel(partnerMember, userId);
  // Saldo positivo = a outra pessoa te deve; negativo = você deve. Zero = quites.
  const iOwe = myBalance < 0 ? Math.abs(myBalance) : 0;
  const owedToMe = myBalance > 0 ? myBalance : 0;

  /** Pagamento que a outra pessoa registrou e que ainda espera meu "recebi". */
  const pendingReceipt = settlements.find(
    (settlement) => settlement.toUserId === userId && settlement.paidAmountCents > 0 && !settlement.receiptConfirmedAt
  );

  function openPaySheet() {
    setPayAmount((iOwe / 100).toFixed(2).replace('.', ','));
    setPayAccountId('');
    setPayCategoryId('');
    setPayOpen(true);
  }

  function handleRegisterPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.blocked) {
      onMessage(gate.message);
      return;
    }
    if (!partnerMember) return;
    const amountCents = parseMoneyToCents(payAmount);
    if (amountCents <= 0) {
      onMessage('Informe quanto você pagou.');
      return;
    }
    if (amountCents > iOwe) {
      onMessage(`Você deve ${formatMoney(iOwe)} — não dá pra registrar um pagamento maior que isso.`);
      return;
    }

    onMessage(null);
    setPayOpen(false);
    registerSettlementPayment(
      workspaceId,
      userId,
      { toUserId: partnerMember.userId, amountCents, totalOwedCents: iOwe },
      { personalWorkspaceId, accountId: payAccountId || undefined, categoryId: payCategoryId || undefined },
      { partnerLabel }
    ).catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível registrar o pagamento agora.')));
  }

  function handleConfirmReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gate.blocked) {
      onMessage(gate.message);
      return;
    }
    if (!receiptTarget) return;
    const settlement = receiptTarget;
    onMessage(null);
    setReceiptTarget(null);
    confirmSettlementReceipt(
      workspaceId,
      userId,
      settlement,
      { personalWorkspaceId, accountId: receiptAccountId || undefined },
      { partnerLabel }
    ).catch((err) => onMessage(getUserFacingErrorMessage(err, 'Não foi possível confirmar o recebimento agora.')));
  }

  return (
    <>
      <article className="surface surface-pad form-stack">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Acerto</p>
            <h2>Quem deve quanto</h2>
          </div>
          <ArrowLeftRight size={20} aria-hidden="true" />
        </div>

        {iOwe > 0 ? (
          <>
            <p className="text-secondary" style={{ margin: 0 }}>
              Você deve <strong>{formatMoney(iOwe)}</strong> pra {partnerLabel}.
            </p>
            <button className="button button--primary button--block" type="button" disabled={gate.blocked} onClick={openPaySheet}>
              <HandCoins size={17} aria-hidden="true" /> Já paguei minha parte
            </button>
          </>
        ) : owedToMe > 0 ? (
          <p className="text-secondary" style={{ margin: 0 }}>
            {partnerLabel} te deve <strong>{formatMoney(owedToMe)}</strong>. Quando pagar, ela registra aqui e você confirma o
            recebimento.
          </p>
        ) : (
          <p className="text-secondary" style={{ margin: 0 }}>Vocês estão quites.</p>
        )}

        {pendingReceipt && (
          <div className="notice notice--success">
            <strong>{partnerLabel} registrou um pagamento de {formatMoney(pendingReceipt.paidAmountCents)}</strong>
            <br />
            <span>Confirme quando o dinheiro tiver caído — a entrada vai pra conta que você escolher.</span>
            <div className="sheet-actions">
              <button
                className="button button--primary button--compact"
                type="button"
                disabled={gate.blocked}
                onClick={() => { setReceiptAccountId(''); setReceiptTarget(pendingReceipt); }}
              >
                <Check size={16} aria-hidden="true" /> Recebi
              </button>
            </div>
          </div>
        )}
      </article>

      <BottomSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Acerto com ${partnerLabel}`}
        subtitle="Registre o que você já pagou — o app não transfere nada."
      >
        <form className="form-stack" onSubmit={handleRegisterPayment}>
          <label className="field">
            <span>Quanto você pagou</span>
            <input className="input input--money" inputMode="decimal" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} placeholder="0,00" autoFocus />
          </label>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
            Sua dívida hoje é {formatMoney(iOwe)}. Pagar menos deixa o acerto parcial, com o resto ainda em aberto.
          </p>
          <div className="field">
            <span className="field-label">De qual conta saiu?</span>
            <div className="chip-row chip-row--scroll">
              {personalFinance.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`chip${payAccountId === account.id ? ' chip--active' : ''}`}
                  onClick={() => setPayAccountId(account.id)}
                >
                  {account.name}
                </button>
              ))}
              <button type="button" className={`chip${!payAccountId ? ' chip--active' : ''}`} onClick={() => setPayAccountId('')}>
                Só anotar
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {payAccountId
                ? 'Vira uma despesa de acerto na sua conta e entra no seu Extrato.'
                : 'Só quita a dívida no espaço de vocês, sem mexer no saldo das suas contas.'}
            </p>
          </div>
          {payAccountId && (
            <CategoryField
              label="Categoria (opcional)"
              value={payCategoryId}
              onChange={setPayCategoryId}
              categories={personalFinance.categories}
              filterType="expense"
              {...payCategoryActions}
            />
          )}
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={gate.blocked}>Registrar pagamento</button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={Boolean(receiptTarget)}
        onClose={() => setReceiptTarget(null)}
        title="Confirmar recebimento"
        subtitle={receiptTarget ? `${partnerLabel} registrou ${formatMoney(receiptTarget.paidAmountCents)}` : ''}
      >
        <form className="form-stack" onSubmit={handleConfirmReceipt}>
          <div className="field">
            <span className="field-label">Em qual conta caiu?</span>
            <div className="chip-row chip-row--scroll">
              {personalFinance.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`chip${receiptAccountId === account.id ? ' chip--active' : ''}`}
                  onClick={() => setReceiptAccountId(account.id)}
                >
                  {account.name}
                </button>
              ))}
              <button type="button" className={`chip${!receiptAccountId ? ' chip--active' : ''}`} onClick={() => setReceiptAccountId('')}>
                Só anotar
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              {receiptAccountId
                ? 'Vira uma entrada de acerto na sua conta e some da dívida de vocês.'
                : 'Só some da dívida de vocês, sem mexer no saldo das suas contas.'}
            </p>
          </div>
          {/* Confirmar é gravável UMA vez só (a regra do Firestore recusa a segunda) — é isso
              que impede a mesma entrada de cair duas vezes na conta de quem recebeu. */}
          <div className="sheet-actions">
            <button className="button button--primary" type="submit" disabled={gate.blocked}>Confirmar recebimento</button>
          </div>
        </form>
      </BottomSheet>
    </>
  );
}
