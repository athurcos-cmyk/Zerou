import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CalendarRange, CalendarClock, CheckCircle2,
  Shuffle, Sparkles, Wallet
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { readPendingInvite } from '../auth/pendingInvite';
import { FormMessage } from '../components/FormMessage';
import { useAppearanceStore } from '../theme/appearance.store';
import {
  committedWindowDaysMax,
  committedWindowDaysMin,
  defaultCommittedWindowDays,
  paydayBusinessDayMax,
  paydayFixedDayMax
} from '../finance/payday';
import type { PaydayRule } from '../types/contracts';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { ensurePersonalFoundation } from '../workspaces/workspaceService';
import { onboardingGoals as goals, onboardingChallenges as challenges, type OnboardingChoice as Choice } from './onboardingOptions';

const TOTAL_STEPS = 4;

// 'variable_income' não é um PaydayRule de verdade — representa "não tenho data fixa"
// (plantão, freela, autônomo). Nesse caso `payday` fica undefined e só a janela de
// dias (`committedWindowDays`) é usada.
type PaydayChoice = PaydayRule['type'] | 'variable_income';

const paydayOptions: { id: PaydayChoice; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'fixed_day', label: 'Dia fixo do mês', hint: 'Ex.: todo dia 5', icon: <CalendarRange size={20} /> },
  { id: 'business_day', label: 'Xº dia útil', hint: 'Ex.: 5º dia útil', icon: <CalendarClock size={20} /> },
  { id: 'end_of_month', label: 'Último dia do mês', hint: 'Varia com o mês', icon: <Wallet size={20} /> },
  { id: 'variable_income', label: 'Renda variável', hint: 'Plantão, freela, autônomo — sem data fixa', icon: <Shuffle size={20} /> }
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { firebaseError, user, profile } = useAuth();
  const preferences = useAppearanceStore((state) => state.preferences);
  const pendingInvite = readPendingInvite();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.name ?? user?.displayName ?? '');
  const [terms, setTerms] = useState(false);
  const [goal, setGoal] = useState('');
  const [challenge, setChallenge] = useState('');
  const [paydayType, setPaydayType] = useState<PaydayChoice | ''>('');
  const [paydayDay, setPaydayDay] = useState('5');
  const [committedWindowDaysInput, setCommittedWindowDaysInput] = useState(String(defaultCommittedWindowDays));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const paydayDayMax = paydayType === 'business_day' ? paydayBusinessDayMax : paydayFixedDayMax;
  const payday: PaydayRule | undefined =
    paydayType === 'end_of_month'
      ? { type: 'end_of_month' }
      : paydayType === 'variable_income'
      ? { type: 'variable_income' }
      : paydayType === 'fixed_day' || paydayType === 'business_day'
      ? { type: paydayType, day: Math.min(Math.max(Number(paydayDay) || 1, 1), paydayDayMax) }
      : undefined;
  const committedWindowDays =
    paydayType === 'variable_income'
      ? Math.min(Math.max(Number(committedWindowDaysInput) || defaultCommittedWindowDays, committedWindowDaysMin), committedWindowDaysMax)
      : undefined;

  useEffect(() => {
    if (profile?.defaultWorkspaceId) {
      navigate(pendingInvite ? `/join/${pendingInvite}` : '/app', { replace: true });
    }
  }, [navigate, pendingInvite, profile?.defaultWorkspaceId]);

  useEffect(() => {
    const nextName = profile?.name ?? user?.displayName ?? '';
    if (nextName) setName((current) => current || nextName);
  }, [profile?.name, user?.displayName]);

  const canAdvanceStep0 = name.trim().length >= 2 && terms;

  function next() {
    setMessage(null);
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }
  function back() {
    setMessage(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function finish() {
    setBusy(true);
    setMessage(null);
    try {
      if (!user) {
        throw new Error('Entre na Granativa para continuar.');
      }
      await ensurePersonalFoundation({
        user,
        name: name.trim(),
        termsVersion: 'zerou-v12.2-foundation',
        appearance: preferences,
        goal: goal || undefined,
        challenge: challenge || undefined,
        payday,
        committedWindowDays
      });
      navigate(pendingInvite ? `/join/${pendingInvite}` : '/app', { replace: true });
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível preparar seu espaço agora. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboard">
      <div className="onboard-progress" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <span key={index} className={`onboard-progress-bar${index <= step ? ' onboard-progress-bar--done' : ''}`} />
        ))}
      </div>

      <FormMessage>{message}</FormMessage>
      <FormMessage>{firebaseError}</FormMessage>

      {step === 0 && (
        <div className="onboard-step">
          <h1 className="onboard-title">Vamos preparar sua Granativa.</h1>
          <p className="onboard-subtitle">Seu espaço pessoal começa privado. Conte como você se chama para começar.</p>

          {pendingInvite ? (
            <p className="notice">Convite preservado: {pendingInvite}. O vínculo compartilhado será tratado depois.</p>
          ) : null}

          <label className="field">
            <span>Como podemos te chamar?</span>
            <input className="input" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome ou apelido" autoFocus />
          </label>

          <label className="checkbox-row">
            <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
            <span>
              Aceito os <Link className="inline-link" to="/legal/terms">termos</Link> e a{' '}
              <Link className="inline-link" to="/legal/privacy">política de privacidade</Link>.
            </span>
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="onboard-step">
          <h1 className="onboard-title">Qual é seu principal objetivo ao usar o app?</h1>
          <p className="onboard-subtitle">Escolha a opção que mais combina com o que você procura.</p>
          <div className="choice-list">
            {goals.map((choice) => (
              <ChoiceCard key={choice.id} choice={choice} selected={goal === choice.id} onSelect={() => setGoal(choice.id)} />
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onboard-step">
          <h1 className="onboard-title">Qual desafio mais te atrapalha no dia a dia?</h1>
          <p className="onboard-subtitle">Vamos ajustar as sugestões com base no que mais te atrapalha.</p>
          <div className="choice-list">
            {challenges.map((choice) => (
              <ChoiceCard key={choice.id} choice={choice} selected={challenge === choice.id} onSelect={() => setChallenge(choice.id)} />
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onboard-step">
          <h1 className="onboard-title">Quando cai seu dinheiro?</h1>
          <p className="onboard-subtitle">
            Assim a Granativa sabe até quando uma fatura ou conta pode esperar antes de contar como "Comprometido" — sem
            você precisar lançar seu salário na mão toda vez.
          </p>
          <div className="choice-list">
            {paydayOptions.map((option) => (
              <ChoiceCard
                key={option.id}
                choice={{ id: option.id, label: `${option.label} · ${option.hint}`, icon: option.icon }}
                selected={paydayType === option.id}
                onSelect={() => setPaydayType(option.id)}
              />
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
                onChange={(event) => setPaydayDay(event.target.value)}
              />
            </label>
          )}
          {paydayType === 'variable_income' && (
            <label className="field">
              <span>Contar como comprometido o que vence nos próximos quantos dias?</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={committedWindowDaysMin}
                max={committedWindowDaysMax}
                value={committedWindowDaysInput}
                onChange={(event) => setCommittedWindowDaysInput(event.target.value)}
              />
              <span className="field-hint">Dá pra ajustar isso depois em Configurações.</span>
            </label>
          )}
          <div className="onboard-finish-hint">
            <Sparkles size={18} aria-hidden="true" />
            <span>Pronto! a Granativa vai montar seu espaço com base nessas respostas.</span>
          </div>
        </div>
      )}

      <div className="onboard-nav">
        {step > 0 ? (
          <button className="onboard-back" type="button" onClick={back} aria-label="Voltar">
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : <span />}

        {step === 0 && (
          <button className="button button--primary onboard-cta" type="button" disabled={!canAdvanceStep0} onClick={next}>
            Continuar <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {(step === 1 || step === 2) && (
          <button className="button button--primary onboard-cta" type="button" onClick={next}>
            Continuar <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {step === 3 && (
          <button className="button button--primary onboard-cta" type="button" disabled={busy || Boolean(firebaseError)} onClick={() => void finish()}>
            {busy ? 'Preparando...' : <>Entrar na Granativa <CheckCircle2 size={18} aria-hidden="true" /></>}
          </button>
        )}
      </div>

      {step >= 1 && (
        <button className="onboard-skip" type="button" onClick={step === 3 ? () => void finish() : next} disabled={busy}>
          Pular por enquanto
        </button>
      )}
    </div>
  );
}

function ChoiceCard({ choice, selected, onSelect }: { choice: Choice; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`choice-card${selected ? ' choice-card--selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <span className="choice-card-icon">{choice.icon}</span>
      <span className="choice-card-label">{choice.label}</span>
      <span className={`choice-card-radio${selected ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
        {selected && <CheckCircle2 size={20} />}
      </span>
    </button>
  );
}
