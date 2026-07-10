import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarRange, CheckCircle2, Shuffle, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  committedWindowDaysMax,
  committedWindowDaysMin,
  defaultCommittedWindowDays,
  paydayBusinessDayMax,
  paydayFixedDayMax
} from '../finance/payday';
import type { PaydayRule } from '../types/contracts';
import { updatePaydaySettings } from '../workspaces/workspaceService';

type PaydayChoice = PaydayRule['type'] | 'variable_income';

const paydayOptions: { id: PaydayChoice; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'fixed_day', label: 'Dia fixo do mês', hint: 'Ex.: todo dia 5', icon: <CalendarRange size={20} /> },
  { id: 'business_day', label: 'Xº dia útil', hint: 'Ex.: 5º dia útil', icon: <CalendarClock size={20} /> },
  { id: 'end_of_month', label: 'Último dia do mês', hint: 'Varia com o mês', icon: <Wallet size={20} /> },
  { id: 'variable_income', label: 'Renda variável', hint: 'Plantão, freela, autônomo — sem data fixa', icon: <Shuffle size={20} /> }
];

export function PaydaySettingsPage() {
  const { user, profile } = useAuth();
  const [paydayType, setPaydayType] = useState<PaydayChoice | ''>(profile?.payday?.type ?? '');
  const [paydayDay, setPaydayDay] = useState(
    profile?.payday && (profile.payday.type === 'fixed_day' || profile.payday.type === 'business_day')
      ? String(profile.payday.day)
      : '5'
  );
  const [windowDaysInput, setWindowDaysInput] = useState(String(profile?.committedWindowDays ?? defaultCommittedWindowDays));
  const [saved, setSaved] = useState(false);
  // Hidrata do perfil só até a primeira escolha manual na sessão — mesmo padrão do
  // `hasLocalOverride` em appearance.store.ts. Sem isso, um snapshot do Firestore em
  // trânsito (ou ainda não carregado no primeiro render) sobrescreve a escolha que a
  // pessoa acabou de fazer, fazendo o rádio "descasar" na hora do clique.
  const [hasLocalOverride, setHasLocalOverride] = useState(false);

  useEffect(() => {
    if (hasLocalOverride) return;
    setPaydayType(profile?.payday?.type ?? '');
    setPaydayDay(
      profile?.payday && (profile.payday.type === 'fixed_day' || profile.payday.type === 'business_day')
        ? String(profile.payday.day)
        : '5'
    );
    setWindowDaysInput(String(profile?.committedWindowDays ?? defaultCommittedWindowDays));
  }, [profile?.payday, profile?.committedWindowDays, hasLocalOverride]);

  const paydayDayMax = paydayType === 'business_day' ? paydayBusinessDayMax : paydayFixedDayMax;

  function save(nextType: PaydayChoice | '', nextDay: string, nextWindowDays: string) {
    if (!user) return;
    setSaved(false);
    setHasLocalOverride(true);

    const payday: PaydayRule | null =
      nextType === 'end_of_month'
        ? { type: 'end_of_month' }
        : nextType === 'variable_income'
        ? { type: 'variable_income' }
        : nextType === 'fixed_day' || nextType === 'business_day'
        ? { type: nextType, day: Math.min(Math.max(Number(nextDay) || 1, 1), nextType === 'business_day' ? paydayBusinessDayMax : paydayFixedDayMax) }
        : null;
    const committedWindowDays = Math.min(
      Math.max(Number(nextWindowDays) || defaultCommittedWindowDays, committedWindowDaysMin),
      committedWindowDaysMax
    );

    updatePaydaySettings(user.uid, { payday, committedWindowDays });
    setSaved(true);
  }

  function selectType(nextType: PaydayChoice) {
    setPaydayType(nextType);
    save(nextType, paydayDay, windowDaysInput);
  }

  function changeDay(value: string) {
    setPaydayDay(value);
    if (paydayType === 'fixed_day' || paydayType === 'business_day') {
      save(paydayType, value, windowDaysInput);
    }
  }

  function changeWindowDays(value: string) {
    setWindowDaysInput(value);
    save(paydayType, paydayDay, value);
  }

  function clearPayday() {
    setPaydayType('');
    save('', paydayDay, windowDaysInput);
  }

  const hasFixedPayday = paydayType === 'fixed_day' || paydayType === 'business_day' || paydayType === 'end_of_month';
  const hasAnyPaydayChoice = paydayType !== '';

  return (
    <section className="page-content">
      <p className="eyebrow">Configurações</p>
      <h1 className="page-title">Quando você recebe</h1>
      <p className="page-description">
        Usamos isso pra saber até quando uma fatura ou conta a pagar pode esperar antes de contar como "Comprometido"
        no seu resumo — sem você precisar lançar seu salário na mão toda vez.
      </p>

      <div className="settings-grid">
        <section className="surface surface-pad" aria-labelledby="payday-title">
          <h2 id="payday-title">Data de recebimento</h2>
          <div className="choice-list">
            {paydayOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`choice-card${paydayType === option.id ? ' choice-card--selected' : ''}`}
                aria-pressed={paydayType === option.id}
                onClick={() => selectType(option.id)}
              >
                <span className="choice-card-icon">{option.icon}</span>
                <span className="choice-card-label">
                  {option.label} · {option.hint}
                </span>
                <span className={`choice-card-radio${paydayType === option.id ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
                  {paydayType === option.id && <CheckCircle2 size={20} />}
                </span>
              </button>
            ))}
          </div>

          {(paydayType === 'fixed_day' || paydayType === 'business_day') && (
            <label className="field">
              <span>{paydayType === 'fixed_day' ? 'Qual dia do mês?' : 'Qual dia útil?'}</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={paydayDayMax}
                value={paydayDay}
                onChange={(event) => changeDay(event.target.value)}
              />
            </label>
          )}

          {hasAnyPaydayChoice && (
            <button className="button button--ghost" type="button" onClick={clearPayday} style={{ marginTop: '0.75rem' }}>
              {hasFixedPayday ? 'Remover data de recebimento' : 'Limpar escolha'}
            </button>
          )}
        </section>

        <section className="surface surface-pad" aria-labelledby="window-title">
          <h2 id="window-title">Janela do "Comprometido"</h2>
          <p className="text-secondary">
            {hasFixedPayday
              ? 'Só usada se algum dia faltar a data de recebimento acima (ex.: enquanto uma fatura não tem vencimento calculado ainda).'
              : 'Sem data fixa, contamos como "Comprometido" tudo que vence dentro dessa janela — ajuste pro que fizer sentido pro seu ritmo de recebimento.'}
          </p>
          <label className="field">
            <span>Considerar comprometido o que vence nos próximos quantos dias?</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={committedWindowDaysMin}
              max={committedWindowDaysMax}
              value={windowDaysInput}
              onChange={(event) => changeWindowDays(event.target.value)}
            />
          </label>
        </section>
      </div>

      {saved && <p className="text-secondary">Salvo.</p>}
    </section>
  );
}
