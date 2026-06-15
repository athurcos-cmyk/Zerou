import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { readPendingInvite } from '../auth/pendingInvite';
import { getAuthErrorMessage } from '../auth/authErrors';
import { FormMessage } from '../components/FormMessage';
import { useAppearanceStore } from '../theme/appearance.store';
import { ensurePersonalFoundation } from '../workspaces/workspaceService';

const onboardingSchema = z.object({
  name: z.string().min(2, 'Informe seu nome.').max(80, 'Use até 80 caracteres.'),
  terms: z.boolean().refine((value) => value, 'Aceite os termos versionados para continuar.')
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

export function OnboardingPage() {
  const navigate = useNavigate();
  const { firebaseError, user, profile } = useAuth();
  const preferences = useAppearanceStore((state) => state.preferences);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingInvite = readPendingInvite();
  const form = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: profile?.name ?? user?.displayName ?? '',
      terms: false
    }
  });

  useEffect(() => {
    if (profile?.defaultWorkspaceId) {
      navigate('/app', { replace: true });
    }
  }, [navigate, profile?.defaultWorkspaceId]);

  async function onSubmit(values: OnboardingForm) {
    setBusy(true);
    setMessage(null);

    try {
      if (!user) {
        throw new Error('Entre na Zerou para continuar.');
      }

      await ensurePersonalFoundation({
        user,
        name: values.name,
        termsVersion: 'zerou-v12.2-foundation',
        appearance: preferences
      });
      navigate('/app', { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-content">
      <p className="eyebrow">Onboarding Zerou</p>
      <h1 className="page-title">Vamos preparar seu Zerou.</h1>
      <p className="page-description">
        Seu espaço pessoal começa privado. Depois você pode cadastrar contas, cartões e convidar outra pessoa quando fizer
        sentido.
      </p>

      <div className="settings-grid">
        <form className="surface surface-pad form-stack" onSubmit={form.handleSubmit(onSubmit)}>
          <FormMessage>{message}</FormMessage>
          <FormMessage>{firebaseError}</FormMessage>
          {pendingInvite ? (
            <p className="notice">
              Convite preservado: {pendingInvite}. O vínculo de espaço compartilhado será tratado na fase própria.
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="name">Nome exibido</label>
            <input className="input" id="name" autoComplete="name" {...form.register('name')} />
            <span className="text-muted">{form.formState.errors.name?.message}</span>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" {...form.register('terms')} />
            <span>
              Aceito os <Link className="inline-link" to="/legal/terms">termos</Link> e a{' '}
              <Link className="inline-link" to="/legal/privacy">política de privacidade</Link> da Zerou.
            </span>
          </label>
          <span className="text-muted">{form.formState.errors.terms?.message}</span>
          <div className="notice">
            <strong>Próximo passo:</strong> depois de entrar, crie uma conta ou cartão para a Zerou montar seu primeiro resumo.
          </div>
          <button className="button button--primary" type="submit" disabled={busy || Boolean(firebaseError)}>
            <CheckCircle2 size={18} aria-hidden="true" /> Entrar no Zerou
          </button>
        </form>
      </div>
    </section>
  );
}
