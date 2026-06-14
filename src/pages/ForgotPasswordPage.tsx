import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { AuthLayout } from '../components/AuthLayout';
import { FormMessage } from '../components/FormMessage';
import { getAuthErrorMessage } from '../auth/authErrors';
import { sendResetEmail } from '../auth/authService';

const resetSchema = z.object({
  email: z.string().email('Informe um email válido.')
});

type ResetForm = z.infer<typeof resetSchema>;

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: '' }
  });

  async function onSubmit(values: ResetForm) {
    setBusy(true);
    setMessage(null);
    setSuccess(null);

    try {
      await sendResetEmail(values.email);
      setSuccess('Enviamos um email para redefinir sua senha Zerou.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Recuperação"
      title="Recupere seu acesso."
      description="Informe o email usado na Zerou para receber o link de redefinição."
    >
      <form className="form-stack" onSubmit={form.handleSubmit(onSubmit)}>
        <FormMessage>{message}</FormMessage>
        <FormMessage type="success">{success}</FormMessage>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" type="email" autoComplete="email" {...form.register('email')} />
          <span className="text-muted">{form.formState.errors.email?.message}</span>
        </div>
        <button className="button button--primary" type="submit" disabled={busy}>
          Enviar link
        </button>
        <Link className="inline-link" to="/login">
          Voltar para login
        </Link>
      </form>
    </AuthLayout>
  );
}
