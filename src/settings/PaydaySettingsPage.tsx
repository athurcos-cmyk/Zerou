import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarRange, Check, CheckCircle2, HelpCircle, Shuffle, Wallet } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { AvailableModeSheet } from '../finance/AvailableModeSheet';
import { availableModeLabels, availableModeSummaries, defaultAvailableMode } from '../finance/availableMode';
import { useFinanceContext } from '../finance/FinanceDataContext';
import { resolveCommittedCutoff } from '../finance/financeCalculations';
import { formatFriendlyDate } from '../finance/financeDates';
import {
  committedWindowDaysMax,
  committedWindowDaysMin,
  defaultCommittedWindowDays,
  paydayBusinessDayMax,
  paydayFixedDayMax
} from '../finance/payday';
import type { AvailableMode, PaydayRule } from '../types/contracts';
import { updateAvailableMode, updatePaydaySettings } from '../workspaces/workspaceService';

type PaydayChoice = PaydayRule['type'] | 'variable_income';

const paydayOptions: { id: PaydayChoice; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'fixed_day', label: 'Dia fixo do mês', hint: 'Ex.: todo dia 5', icon: <CalendarRange size={20} /> },
  { id: 'business_day', label: 'Xº dia útil', hint: 'Ex.: 5º dia útil', icon: <CalendarClock size={20} /> },
  { id: 'end_of_month', label: 'Último dia do mês', hint: 'Varia com o mês', icon: <Wallet size={20} /> },
  { id: 'variable_income', label: 'Renda variável', hint: 'Plantão, freela, autônomo — sem data fixa', icon: <Shuffle size={20} /> }
];

export function PaydaySettingsPage() {
  const { user, profile } = useAuth();
  const finance = useFinanceContext();
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  const [paydayType, setPaydayType] = useState<PaydayChoice | ''>(profile?.payday?.type ?? '');
  const [paydayDay, setPaydayDay] = useState(
    profile?.payday && (profile.payday.type === 'fixed_day' || profile.payday.type === 'business_day')
      ? String(profile.payday.day)
      : '5'
  );
  const [windowDaysInput, setWindowDaysInput] = useState(String(profile?.committedWindowDays ?? defaultCommittedWindowDays));
  const [saved, setSaved] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
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
    flashSaved();
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
  const availableMode = profile?.availableMode ?? defaultAvailableMode;
  // Só o modo `until_payday` usa data de recebimento / janela de dias. No conservador,
  // nada disso entra no cálculo — mostrar os controles como se entrassem seria mentira.
  const paydayAffectsSummary = availableMode === 'until_payday';

  // Mesma função que o Dashboard usa. Mostrar aqui a data-limite REAL responde de dentro
  // do produto a pergunta "o que essa data faz, afinal?" — antes a pessoa escolhia um dia
  // do mês sem nunca ver a consequência.
  const committed = resolveCommittedCutoff({
    transactions: finance.transactions,
    payday: profile?.payday,
    committedWindowDays: profile?.committedWindowDays,
    availableMode
  });
  const cutoffExplanation =
    committed.cutoff === null
      ? null
      : committed.source === 'income'
      ? `Hoje o corte é ${formatFriendlyDate(committed.cutoff)}, porque você lançou uma receita futura nessa data.`
      : committed.source === 'payday'
      ? `Hoje o corte é ${formatFriendlyDate(committed.cutoff)} — seu próximo recebimento pela regra acima.`
      : `Hoje o corte é ${formatFriendlyDate(committed.cutoff)}, o fim da janela de ${profile?.committedWindowDays ?? defaultCommittedWindowDays} dias.`;

  function chooseAvailableMode(mode: AvailableMode) {
    if (!user) return;
    updateAvailableMode(user.uid, mode);
    setTutorialOpen(false);
    flashSaved();
  }

  // Feedback visível e efêmero. Antes existia só um "Salvo." no rodapé da página, fora da
  // tela — clicar num modo parecia não fazer nada, e clicar no modo JÁ ativo então não
  // dava sinal nenhum de que o app tinha entendido.
  function flashSaved() {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <section className="page-content">
      <p className="eyebrow">Configurações</p>
      <h1 className="page-title">Recebimento e Disponível</h1>
      <p className="page-description">
        Escolha como o seu "Disponível" é calculado e, se ele depender do seu recebimento, quando o dinheiro entra.
      </p>

      <section className="surface surface-pad" aria-labelledby="available-mode-title">
        <div className="section-heading">
          <div>
            <h2 id="available-mode-title">Como calcular o "Disponível"</h2>
            <p className="text-secondary" style={{ margin: '0.25rem 0 0' }}>
              Atualmente: <strong>{availableModeLabels[availableMode]}</strong>
            </p>
          </div>
          <div className="settings-heading-actions">
            {saved && (
              <span className="saved-badge" role="status">
                <Check size={14} aria-hidden="true" /> Salvo
              </span>
            )}
            <button className="button button--subtle button--compact" type="button" onClick={() => setTutorialOpen(true)}>
              <HelpCircle size={16} aria-hidden="true" /> Ver explicação
            </button>
          </div>
        </div>

        <div className="choice-list" style={{ marginTop: '0.9rem' }}>
          {(Object.keys(availableModeLabels) as AvailableMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`choice-card${availableMode === mode ? ' choice-card--selected' : ''}`}
              aria-pressed={availableMode === mode}
              onClick={() => chooseAvailableMode(mode)}
            >
              <span className="choice-card-label">
                {availableModeLabels[mode]} · {availableModeSummaries[mode]}
              </span>
              <span className={`choice-card-radio${availableMode === mode ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
                {availableMode === mode && <CheckCircle2 size={20} />}
              </span>
            </button>
          ))}
        </div>

        {cutoffExplanation && <p className="settings-hint">{cutoffExplanation}</p>}
      </section>

      {!paydayAffectsSummary && (
        <div className="notice">
          No modo <strong>{availableModeLabels.conservative}</strong>, nada abaixo muda o seu resumo: tudo que você deve já
          conta como Comprometido, sem esperar data nenhuma. As opções continuam salvas caso você volte pro modo
          "{availableModeLabels.until_payday}".
        </div>
      )}

      <div className={`settings-grid${paydayAffectsSummary ? '' : ' settings-grid--inactive'}`}>
        <section className="surface surface-pad" aria-labelledby="payday-title">
          <h2 id="payday-title">Data de recebimento</h2>
          <p className="text-secondary">
            O app usa isso pra <strong>estimar quando o próximo dinheiro entra</strong> e parar de contar como
            "Comprometido" o que só vence depois disso. Nenhum valor é criado: é só uma data.
          </p>
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
          <h2 id="window-title">Quando não dá pra saber a data</h2>
          <p className="text-secondary">
            Se você marcou <strong>Renda variável</strong> (ou não escolheu data nenhuma), o app não tem como estimar seu
            próximo recebimento. Nesse caso ele olha só um <strong>período fixo à frente</strong>: tudo que vence dentro
            desse período conta como Comprometido; o que vence depois, ainda não.
          </p>
          <label className="field">
            <span>Olhar quantos dias à frente?</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={committedWindowDaysMin}
              max={committedWindowDaysMax}
              value={windowDaysInput}
              onChange={(event) => changeWindowDays(event.target.value)}
            />
            <span className="field-hint">
              Entre {committedWindowDaysMin} e {committedWindowDaysMax} dias. Se você recebe a cada 30 dias, 30 é um bom
              número. Quem recebe por semana costuma preferir 7.
            </span>
          </label>
          {hasFixedPayday && (
            <p className="settings-hint">
              Como você informou uma data de recebimento acima, este período <strong>não está em uso</strong> hoje — ele é
              a reserva pra quando não houver data.
            </p>
          )}
        </section>
      </div>

      <AvailableModeSheet
        open={tutorialOpen}
        currentMode={profile?.availableMode}
        onChoose={chooseAvailableMode}
        onClose={() => setTutorialOpen(false)}
      />
    </section>
  );
}
