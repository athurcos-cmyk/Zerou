import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CircleUserRound } from 'lucide-react';
import { z } from 'zod';
import { AuthLayout } from '../components/AuthLayout';
import { FormMessage } from '../components/FormMessage';
import { useAuth } from '../auth/AuthContext';
import { getAuthErrorMessage } from '../auth/authErrors';
import { loginWithEmail, loginWithGoogle } from '../auth/authService';

const loginSchema = z.object({
  email: z.string().email('Informe um email válido.'),
  password: z.string().min(1, 'Informe sua senha.')
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { firebaseError } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/app';
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  async function onSubmit(values: LoginForm) {
    setBusy(true);
    setMessage(null);

    try {
      await loginWithEmail(values.email, values.password);
      navigate(returnTo, { replace: true });
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
      navigate(returnTo, { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Entrar"
      title="Volte para o seu espaço Granativa."
      description="Acesse seu espaço pessoal e continue do ponto em que parou."
    >
      <form className="form-stack" onSubmit={form.handleSubmit(onSubmit)}>
        <FormMessage>{firebaseError}</FormMessage>
        <FormMessage>{message}</FormMessage>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" type="email" autoComplete="email" {...form.register('email')} />
          <span className="text-muted">{form.formState.errors.email?.message}</span>
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            className="input"
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
          <span className="text-muted">{form.formState.errors.password?.message}</span>
        </div>
        <button className="button button--primary" type="submit" disabled={busy || Boolean(firebaseError)}>
          Entrar na Granativa
        </button>
        <button className="button button--secondary" type="button" onClick={onGoogle} disabled={busy || Boolean(firebaseError)}>
          <CircleUserRound size={18} aria-hidden="true" /> Entrar com Google
        </button>
        <div className="button-row">
          <Link className="inline-link" to="/forgot-password">
            Esqueci minha senha
          </Link>
          <Link className="inline-link" to="/register">
            Criar conta
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
