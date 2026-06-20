import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BellRing, CalendarRange, CheckCircle2, FolderOpen,
  LineChart, PiggyBank, PieChart, ShieldCheck, Sparkles, TrendingDown
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { readPendingInvite } from '../auth/pendingInvite';
import { FormMessage } from '../components/FormMessage';
import { useAppearanceStore } from '../theme/appearance.store';
import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { ensurePersonalFoundation } from '../workspaces/workspaceService';

interface Choice {
  id: string;
  label: string;
  icon: ReactNode;
}

const goals: Choice[] = [
  { id: 'organizar', label: 'Organizar todos os meus gastos em um só lugar', icon: <FolderOpen size={20} /> },
  { id: 'metas', label: 'Definir metas para guardar dinheiro', icon: <PiggyBank size={20} /> },
  { id: 'categorias', label: 'Controlar melhor quanto gasto por categoria', icon: <PieChart size={20} /> },
  { id: 'dividas', label: 'Criar um plano para sair das dívidas', icon: <ShieldCheck size={20} /> },
  { id: 'visao', label: 'Ter uma visão clara do meu mês financeiro', icon: <CalendarRange size={20} /> }
];

const challenges: Choice[] = [
  { id: 'para-onde', label: 'Quero entender para onde meu dinheiro está indo', icon: <LineChart size={20} /> },
  { id: 'gastar-menos', label: 'Eu sei com o que gasto, mas quero gastar menos', icon: <TrendingDown size={20} /> },
  { id: 'guardar', label: 'Não consigo criar o hábito de guardar dinheiro', icon: <PiggyBank size={20} /> },
  { id: 'prazos', label: 'Esqueço de pagar contas no prazo', icon: <BellRing size={20} /> }
];

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
        throw new Error('Entre no Granix para continuar.');
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
          <h1 className="onboard-title">Vamos preparar seu Granix.</h1>
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
          <div className="onboard-finish-hint">
            <Sparkles size={18} aria-hidden="true" />
            <span>Pronto! O Granix vai montar seu espaço com base nessas respostas.</span>
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
            {busy ? 'Preparando...' : <>Entrar no Granix <CheckCircle2 size={18} aria-hidden="true" /></>}
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
    <button type="button" className={`choice-card${selected ? ' choice-card--selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
      <span className="choice-card-icon">{choice.icon}</span>
      <span className="choice-card-label">{choice.label}</span>
      <span className={`choice-card-radio${selected ? ' choice-card-radio--on' : ''}`} aria-hidden="true">
        {selected && <CheckCircle2 size={20} />}
      </span>
    </button>
  );
}
