import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { CircleUserRound, Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', terms: false }
  });

  async function onSubmit(values: RegisterForm) {
    setBusy(true);
    setMessage(null);

    try {
      await registerWithEmail(values.name, values.email, values.password);
      navigate('/verify-email', { replace: true });
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
      title="Você está a 2 minutos de ver pra onde vai seu dinheiro."
      description="Tudo que você registrar aqui é só seu. Dá pra abrir um espaço do casal depois, se quiser."
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
          <div className="input-with-toggle">
            <input
              className="input"
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-describedby="password-error"
              {...form.register('password')}
            />
            <button
              type="button"
              className="input-toggle-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <span className="text-muted" id="password-error">{form.formState.errors.password?.message ?? 'Mínimo de 8 caracteres.'}</span>
        </div>
        <label className="checkbox-row">
          <input id="terms" type="checkbox" aria-describedby={form.formState.errors.terms ? 'terms-error' : undefined} {...form.register('terms')} />
          <span>
            Li e aceito os <Link className="inline-link" to="/legal/terms">termos</Link> e a{' '}
            <Link className="inline-link" to="/legal/privacy">política de privacidade</Link> da Granativa.
          </span>
        </label>
        <span className="text-muted" id="terms-error">{form.formState.errors.terms?.message}</span>
        <p className="text-secondary">Leva menos de 2 minutos · sem cartão de crédito.</p>
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
