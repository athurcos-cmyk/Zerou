import { useMemo, useState } from 'react';
import { addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BottomSheet } from '../components/BottomSheet';
import { FormMessage } from '../components/FormMessage';
import { registerOngoingInstallments } from './cardService';
import { formatMoney, parseMoneyToCents } from '../finance/money';
import { getUserFacingErrorMessage } from '../utils/userFacingError';

interface OngoingInstallmentsSheetProps {
  open: boolean;
  workspaceId?: string;
  userId?: string;
  cardId: string;
  onClose: () => void;
}

function currentMonthValue() {
  return format(new Date(), 'yyyy-MM');
}

/**
 * Lança uma compra parcelada que já estava rolando (ex.: óculos 10x, já na parcela 7).
 * A pessoa informa o valor da parcela, em qual está (7 de 10) e em que mês cai a próxima;
 * o app cria só as que faltam, nas faturas certas, rotuladas 7/10…10/10.
 */
export function OngoingInstallmentsSheet({ open, workspaceId, userId, cardId, onClose }: OngoingInstallmentsSheetProps) {
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [current, setCurrent] = useState('1');
  const [total, setTotal] = useState('2');
  const [month, setMonth] = useState(currentMonthValue());
  const [message, setMessage] = useState<string | null>(null);

  const currentNum = Number(current) || 0;
  const totalNum = Number(total) || 0;
  const valueCents = value.trim() ? parseMoneyToCents(value) : 0;
  const remaining = totalNum >= currentNum && currentNum >= 1 ? totalNum - currentNum + 1 : 0;

  const preview = useMemo(() => {
    if (remaining <= 0 || !valueCents) return null;
    const [year, m] = month.split('-').map(Number);
    const firstMonth = new Date(year, (m || 1) - 1, 1);
    const lastMonth = addMonths(firstMonth, remaining - 1);
    return {
      count: remaining,
      totalCents: valueCents * remaining,
      firstLabel: format(firstMonth, 'MMM yyyy', { locale: ptBR }),
      lastLabel: format(lastMonth, 'MMM yyyy', { locale: ptBR })
    };
  }, [remaining, valueCents, month]);

  const canSubmit =
    Boolean(workspaceId && userId) &&
    description.trim().length >= 2 &&
    valueCents > 0 &&
    currentNum >= 1 &&
    totalNum >= 2 &&
    currentNum <= totalNum;

  function reset() {
    setDescription('');
    setValue('');
    setCurrent('1');
    setTotal('2');
    setMonth(currentMonthValue());
  }

  function handleSubmit() {
    if (!workspaceId || !userId || !canSubmit) return;
    const [year, m] = month.split('-').map(Number);
    setMessage(null);
    onClose();
    registerOngoingInstallments(workspaceId, userId, {
      cardId,
      description: description.trim(),
      installmentValueCents: valueCents,
      currentInstallment: currentNum,
      totalInstallments: totalNum,
      nextDueMonth: new Date(year, (m || 1) - 1, 1, 12, 0, 0)
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

          <div className="form-grid-2">
            <label className="field">
              <span>Está na parcela</span>
              <input className="input" type="number" inputMode="numeric" min={1} max={totalNum || 72} value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="field">
              <span>De um total de</span>
              <input className="input" type="number" inputMode="numeric" min={2} max={72} value={total} onChange={(e) => setTotal(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>A próxima parcela cai em qual mês?</span>
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <span className="field-hint">O mês da fatura onde a próxima parcela aparece.</span>
          </label>

          {preview ? (
            <div className="notice">
              Vamos lançar <strong>{preview.count} {preview.count === 1 ? 'parcela' : 'parcelas'}</strong> de{' '}
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
