import { useMemo, useState } from 'react';
import { addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BottomSheet } from '../components/BottomSheet';
import { FormMessage } from '../components/FormMessage';
import { registerOngoingInstallments } from './cardService';
import { resolveInstallmentCycle } from './cardDates';
import { fromDateInputValue, todayInputValue } from '../finance/financeDates';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import type { CreditCard } from '../types/contracts';

interface OngoingInstallmentsSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  card: Pick<CreditCard, 'id' | 'closingDay' | 'dueDay'>;
  onClose: () => void;
}

function firstDayOfReferenceMonth(referenceMonth: string) {
  const [year, month] = referenceMonth.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1, 12, 0, 0);
}

/**
 * Lança uma compra parcelada que já estava rolando (ex.: óculos 10x, já pagou 6).
 * A pessoa informa quando comprou, o total de parcelas e quantas já pagou — o app
 * calcula sozinho em qual fatura cai a próxima (mesma lógica de uma compra nova,
 * `resolveInstallmentCycle`, usando o fechamento/vencimento já cadastrados do cartão)
 * e cria só as parcelas que faltam, rotuladas corretamente (ex.: 7/10…10/10).
 */
export function OngoingInstallmentsSheet({ open, workspaceId, userId, card, onClose }: OngoingInstallmentsSheetProps) {
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [total, setTotal] = useState('2');
  const [alreadyPaid, setAlreadyPaid] = useState('0');
  const [message, setMessage] = useState<string | null>(null);

  const totalNum = Number(total) || 0;
  const alreadyPaidNum = Number(alreadyPaid) || 0;
  const currentNum = alreadyPaidNum + 1;
  const valueCents = value.trim() ? parseMoneyToCents(value) : 0;
  const remaining = totalNum >= 1 && alreadyPaidNum >= 0 && alreadyPaidNum < totalNum ? totalNum - alreadyPaidNum : 0;

  const nextCycle = useMemo(() => {
    if (remaining <= 0) return null;
    try {
      return resolveInstallmentCycle(fromDateInputValue(purchaseDate), card.closingDay, card.dueDay, alreadyPaidNum);
    } catch {
      return null;
    }
  }, [remaining, purchaseDate, card.closingDay, card.dueDay, alreadyPaidNum]);

  const preview = useMemo(() => {
    if (!nextCycle || !valueCents) return null;
    const firstMonth = firstDayOfReferenceMonth(nextCycle.referenceMonth);
    const lastMonth = addMonths(firstMonth, remaining - 1);
    return {
      count: remaining,
      totalCents: valueCents * remaining,
      firstLabel: format(firstMonth, 'MMM yyyy', { locale: ptBR }),
      lastLabel: format(lastMonth, 'MMM yyyy', { locale: ptBR })
    };
  }, [nextCycle, remaining, valueCents]);

  const canSubmit =
    Boolean(workspaceId && userId) &&
    description.trim().length >= 2 &&
    valueCents > 0 &&
    totalNum >= 2 &&
    alreadyPaidNum >= 0 &&
    alreadyPaidNum < totalNum &&
    Boolean(nextCycle);

  function reset() {
    setDescription('');
    setValue('');
    setPurchaseDate(todayInputValue());
    setTotal('2');
    setAlreadyPaid('0');
  }

  function handleSubmit() {
    if (!workspaceId || !userId || !canSubmit || !nextCycle) return;
    setMessage(null);
    onClose();
    registerOngoingInstallments(workspaceId, userId, {
      cardId: card.id,
      description: description.trim(),
      installmentValueCents: valueCents,
      currentInstallment: currentNum,
      totalInstallments: totalNum,
      nextDueMonth: firstDayOfReferenceMonth(nextCycle.referenceMonth)
    }).catch((error) => setMessage(getUserFacingErrorMessage(error, 'Não foi possível lançar a compra agora.')));
    reset();
  }

  return (
    <>
      <FormMessage>{message}</FormMessage>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Compra parcelada que já começou"
        subtitle="Pra trazer pro app uma compra que você já vinha pagando"
      >
        <div className="form-stack">
          <label className="field">
            <span>O que foi a compra?</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Óculos, notebook…" />
          </label>

          <label className="field">
            <span>Valor de cada parcela</span>
            <input
              className="input input--money"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </label>

          <label className="field">
            <span>Quando você comprou?</span>
            <input className="input" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </label>

          <div className="form-grid-2">
            <label className="field">
              <span>Total de parcelas</span>
              <input className="input" type="number" inputMode="numeric" min={2} max={72} value={total} onChange={(e) => setTotal(e.target.value)} />
            </label>
            <label className="field">
              <span>Quantas já pagou</span>
              <input className="input" type="number" inputMode="numeric" min={0} max={Math.max(0, totalNum - 1)} value={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.value)} />
            </label>
          </div>
          <span className="field-hint" style={{ marginTop: '-0.4rem' }}>
            Deixe 0 se a compra é futura e ainda não começou a ser cobrada.
          </span>

          {preview && nextCycle ? (
            <div className="notice">
              A próxima parcela ({currentNum}/{totalNum}) cai na fatura de{' '}
              <strong>{format(firstDayOfReferenceMonth(nextCycle.referenceMonth), 'MMM yyyy', { locale: ptBR })}</strong>. Vamos lançar{' '}
              <strong>{preview.count} {preview.count === 1 ? 'parcela' : 'parcelas'}</strong> de{' '}
              <strong>{formatMoney(valueCents)}</strong> ({currentNum}/{totalNum} até {totalNum}/{totalNum}), de{' '}
              <strong>{preview.firstLabel}</strong> a <strong>{preview.lastLabel}</strong>. Total que falta:{' '}
              <strong>{formatMoney(preview.totalCents)}</strong>. As parcelas já pagas não são recriadas.
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
              Preencha o valor e as parcelas pra ver o resumo.
            </p>
          )}

          <div className="sheet-actions">
            <button className="button button--primary" type="button" disabled={!canSubmit} onClick={handleSubmit}>
              Lançar parcelas que faltam
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
