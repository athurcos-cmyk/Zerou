import { useMemo, useState } from 'react';
import { CircleUserRound, KeyRound, Link2, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { addPasswordProvider, linkGoogleProvider, reauthenticateWithPassword, unlinkProvider } from '../auth/authService';
import { getAuthErrorMessage } from '../auth/authErrors';
import { FormMessage } from '../components/FormMessage';

const providerLabels: Record<string, string> = {
  password: 'Email e senha',
  'google.com': 'Google'
};

export function LoginMethodsPage() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const providers = useMemo(() => user?.providerData.map((provider) => provider.providerId) ?? [], [user]);
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');

  async function run(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setMessage(null);
    setSuccess(null);

    try {
      await action();
      await user?.reload();
      setSuccess(successMessage);
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function onUnlink(providerId: string) {
    void run(async () => {
      if (!user) {
        throw new Error('Entre na Zerou para alterar métodos de acesso.');
      }

      if (user.providerData.length <= 1) {
        throw new Error('Mantenha pelo menos um método de acesso ativo.');
      }

      if (currentPassword && hasPassword) {
        await reauthenticateWithPassword(user, currentPassword);
      }

      await unlinkProvider(user, providerId);
    }, 'Método removido da sua conta Zerou.');
  }

  return (
    <section className="page-content">
      <p className="eyebrow">Segurança</p>
      <h1 className="page-title">Métodos de login</h1>
      <p className="page-description">
        Gerencie como você entra na Zerou. A conta mantém o mesmo UID ao vincular Google ou adicionar senha.
      </p>

      <div className="settings-grid">
        <section className="surface surface-pad form-stack">
          <FormMessage>{message}</FormMessage>
          <FormMessage type="success">{success}</FormMessage>
          <div className="notice">
            <ShieldAlert size={18} aria-hidden="true" /> A Zerou bloqueia desvincular o último método ativo e não faz
            merge automático entre UIDs diferentes.
          </div>

          <div className="provider-list">
            {providers.map((providerId) => (
              <div className="provider-item" key={providerId}>
                <div>
                  <strong>{providerLabels[providerId] ?? providerId}</strong>
                  <p className="text-secondary">Vinculado à sua conta Zerou.</p>
                </div>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy || providers.length <= 1}
                  onClick={() => onUnlink(providerId)}
                >
                  <Trash2 size={17} aria-hidden="true" /> Remover
                </button>
              </div>
            ))}
          </div>

          <div className="field">
            <label htmlFor="current-password">Senha atual para reautenticação sensível</label>
            <input
              className="input"
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>

          {!hasGoogle ? (
            <button
              className="button button--secondary"
              type="button"
              disabled={busy || !user}
              onClick={() =>
                run(async () => {
                  if (!user) {
                    throw new Error('Entre na Zerou para alterar métodos de acesso.');
                  }
                  await linkGoogleProvider(user);
                }, 'Google vinculado mantendo o mesmo UID.')
              }
            >
              <CircleUserRound size={18} aria-hidden="true" /> Vincular Google
            </button>
          ) : null}

          {!hasPassword ? (
            <div className="form-stack">
              <div className="field">
                <label htmlFor="new-password">Nova senha</label>
                <input
                  className="input"
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <button
                className="button button--primary"
                type="button"
                disabled={busy || newPassword.length < 8 || !user}
                onClick={() =>
                  run(async () => {
                    if (!user) {
                      throw new Error('Entre na Zerou para alterar métodos de acesso.');
                    }
                    await addPasswordProvider(user, newPassword);
                  }, 'Senha adicionada mantendo o mesmo UID.')
                }
              >
                <KeyRound size={18} aria-hidden="true" /> Adicionar senha
              </button>
            </div>
          ) : null}

          <p className="text-muted">
            Provedor atual: <Link2 size={14} aria-hidden="true" /> {user?.uid}
          </p>
        </section>
      </div>
    </section>
  );
}
