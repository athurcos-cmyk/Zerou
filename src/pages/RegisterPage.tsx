import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { CircleUserRound } from 'lucide-react';
import { z } from 'zod';
import { AuthLayout } from '../components/AuthLayout';
import { FormMessage } from '../components/FormMessage';
import { useAuth } from '../auth/AuthContext';
import { getAuthErrorMessage } from '../auth/authErrors';
import { loginWithGoogle, registerWithEmail } from '../auth/authService';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Informe seu nome.').max(80, 'Use até 80 caracteres.'),
    email: z.string().email('Informe um email válido.'),
    password: z.string().min(8, 'Use pelo menos 8 caracteres.'),
    terms: z.boolean().refine((value) => value, 'Aceite os termos para continuar.')
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { firebaseError } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', terms: false }
  });

  async function onSubmit(values: RegisterForm) {
    setBusy(true);
    setMessage(null);

    try {
      await registerWithEmail(values.name, values.email, values.password);
      navigate('/app/onboarding', { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setMessage(null);

    try {
      await loginWithGoogle();
      navigate('/app/onboarding', { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Criar conta"
      title="Comece com seu espaço pessoal."
      description="a Granativa separa o que é individual do que pode ser compartilhado depois."
    >
      <form className="form-stack" onSubmit={form.handleSubmit(onSubmit)}>
        <FormMessage>{firebaseError}</FormMessage>
        <FormMessage>{message}</FormMessage>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input className="input" id="name" autoComplete="name" aria-describedby={form.formState.errors.name ? 'name-error' : undefined} {...form.register('name')} />
          <span className="text-muted" id="name-error">{form.formState.errors.name?.message}</span>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" type="email" autoComplete="email" aria-describedby={form.formState.errors.email ? 'email-error' : undefined} {...form.register('email')} />
          <span className="text-muted" id="email-error">{form.formState.errors.email?.message}</span>
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            className="input"
            id="password"
            type="password"
            autoComplete="new-password"
            aria-describedby={form.formState.errors.password ? 'password-error' : undefined}
            {...form.register('password')}
          />
          <span className="text-muted" id="password-error">{form.formState.errors.password?.message}</span>
        </div>
        <label className="checkbox-row">
          <input id="terms" type="checkbox" aria-describedby={form.formState.errors.terms ? 'terms-error' : undefined} {...form.register('terms')} />
          <span>
            Li e aceito os <Link className="inline-link" to="/legal/terms">termos</Link> e a{' '}
            <Link className="inline-link" to="/legal/privacy">política de privacidade</Link> da Granativa.
          </span>
        </label>
        <span className="text-muted" id="terms-error">{form.formState.errors.terms?.message}</span>
        <button className="button button--primary" type="submit" disabled={busy || Boolean(firebaseError)}>
          Criar conta Granativa
        </button>
        <button className="button button--secondary" type="button" onClick={onGoogle} disabled={busy || Boolean(firebaseError)}>
          <CircleUserRound size={18} aria-hidden="true" /> Continuar com Google
        </button>
        <p className="text-secondary">
          Já tem conta?{' '}
          <Link className="inline-link" to="/login">
            Entrar
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
