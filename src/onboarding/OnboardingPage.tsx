import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { readPendingInvite } from '../auth/pendingInvite';
import { FormMessage } from '../components/FormMessage';
import { useAppearanceStore } from '../theme/appearance.store';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { ensurePersonalFoundation } from '../workspaces/workspaceService';
import { onboardingGoals as goals, onboardingChallenges as challenges, type OnboardingChoice as Choice } from './onboardingOptions';

const TOTAL_STEPS = 3;

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
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        challenge: challenge || undefined
      });
      navigate(pendingInvite ? `/join/${pendingInvite}` : '/app', { replace: true });
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'Não foi possível preparar sua conta agora. Tente novamente.'));
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
          <p className="onboard-subtitle">Tudo que você registrar aqui é só seu. Conte como você se chama pra começar.</p>

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
          <div className="choice-list" role="radiogroup" aria-label="Qual e seu principal objetivo?">
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
          <div className="choice-list" role="radiogroup" aria-label="Qual desafio mais te atrapalha?">
            {challenges.map((choice) => (
              <ChoiceCard key={choice.id} choice={choice} selected={challenge === choice.id} onSelect={() => setChallenge(choice.id)} />
            ))}
          </div>
          <div className="onboard-finish-hint">
            <Sparkles size={18} aria-hidden="true" />
            <span>Pronto! Sua tela já abre pronta pra você começar a registrar.</span>
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
        {step === 1 && (
          <button className="button button--primary onboard-cta" type="button" onClick={next}>
            Continuar <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {step === 2 && (
          <button className="button button--primary onboard-cta" type="button" disabled={busy || Boolean(firebaseError)} onClick={() => void finish()}>
            {busy ? 'Preparando...' : <>Entrar na Granativa <CheckCircle2 size={18} aria-hidden="true" /></>}
          </button>
        )}
      </div>

      {step >= 1 && (
        <button className="onboard-skip" type="button" onClick={step === 2 ? () => void finish() : next} disabled={busy}>
          Pular por enquanto
        </button>
      )}
    </div>
  );
}

function ChoiceCard({ choice, selected, onSelect }: { choice: Choice; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`choice-card${selected ? ' choice-card--selected' : ''}`} role="radio" aria-checked={selected} onClick={onSelect}>
      <span className="choice-card-icon">{choice.icon}</span>
      <span className="choice-card-label">{choice.label}</span>
      <span className={`choice-card-radio${selected ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
        {selected && <CheckCircle2 size={20} />}
      </span>
    </button>
  );
}
