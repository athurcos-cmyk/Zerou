import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { onboardingChallenges, onboardingGoals } from '../onboarding/onboardingOptions';
import { updateOnboardingAnswers } from '../workspaces/workspaceService';

export function OnboardingAnswersSettingsPage() {
  const { user, profile } = useAuth();
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const [goal, setGoal] = useState(profile?.onboardingGoal ?? '');
  const [challenge, setChallenge] = useState(profile?.onboardingChallenge ?? '');
  const [saved, setSaved] = useState(false);
  // Mesmo padrão de PaydaySettingsPage.tsx: hidrata do perfil só até a primeira escolha
  // manual na sessão, senão um snapshot em trânsito descasa o rádio recém-clicado.
  const [hasLocalOverride, setHasLocalOverride] = useState(false);

  useEffect(() => {
    if (hasLocalOverride) return;
    setGoal(profile?.onboardingGoal ?? '');
    setChallenge(profile?.onboardingChallenge ?? '');
  }, [profile?.onboardingGoal, profile?.onboardingChallenge, hasLocalOverride]);

  function flashSaved() {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2200);
  }

  function save(nextGoal: string, nextChallenge: string) {
    if (!user) return;
    setHasLocalOverride(true);
    updateOnboardingAnswers(user.uid, { goal: nextGoal || null, challenge: nextChallenge || null });
    flashSaved();
  }

  function selectGoal(id: string) {
    const next = goal === id ? '' : id;
    setGoal(next);
    save(next, challenge);
  }

  function selectChallenge(id: string) {
    const next = challenge === id ? '' : id;
    setChallenge(next);
    save(goal, next);
  }

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1 className="page-title">Objetivo e desafio</h1>
        </div>
        {saved && (
          <span className="saved-badge" role="status">
            <Check size={14} aria-hidden="true" /> Salvo
          </span>
        )}
      </div>
      <p className="page-description">
        As respostas que você deu no cadastro. A Grazi usa isso pra deixar o tom das respostas mais próximo da sua
        situação — dá pra mudar quando quiser, sua prioridade pode não ser mais a mesma de quando você começou.
      </p>

      <section className="surface surface-pad" aria-labelledby="goal-title">
        <h2 id="goal-title">Qual é seu principal objetivo?</h2>
        <div className="choice-list">
          {onboardingGoals.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`choice-card${goal === choice.id ? ' choice-card--selected' : ''}`}
              aria-pressed={goal === choice.id}
              onClick={() => selectGoal(choice.id)}
            >
              <span className="choice-card-icon">{choice.icon}</span>
              <span className="choice-card-label">{choice.label}</span>
              <span className={`choice-card-radio${goal === choice.id ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
                {goal === choice.id && <CheckCircle2 size={20} />}
              </span>
            </button>
          ))}
        </div>
        <p className="field-hint">Clique de novo na opção marcada pra limpar.</p>
      </section>

      <section className="surface surface-pad" aria-labelledby="challenge-title" style={{ marginTop: '1rem' }}>
        <h2 id="challenge-title">Qual desafio mais te atrapalha?</h2>
        <div className="choice-list">
          {onboardingChallenges.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`choice-card${challenge === choice.id ? ' choice-card--selected' : ''}`}
              aria-pressed={challenge === choice.id}
              onClick={() => selectChallenge(choice.id)}
            >
              <span className="choice-card-icon">{choice.icon}</span>
              <span className="choice-card-label">{choice.label}</span>
              <span className={`choice-card-radio${challenge === choice.id ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
                {challenge === choice.id && <CheckCircle2 size={20} />}
              </span>
            </button>
          ))}
        </div>
        <p className="field-hint">Clique de novo na opção marcada pra limpar.</p>
      </section>
    </section>
  );
}
