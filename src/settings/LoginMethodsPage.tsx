import { useMemo, useState } from 'react';
import { AlertTriangle, CircleUserRound, KeyRound, Link2, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  addPasswordProvider,
  deleteAuthenticatedUser,
  linkGoogleProvider,
  reauthenticateWithGoogle,
  reauthenticateWithPassword,
  unlinkProvider
} from '../auth/authService';
import { getAuthErrorMessage } from '../auth/authErrors';
import { FormMessage } from '../components/FormMessage';
import { deleteAccountData } from './accountDeletionService';

const providerLabels: Record<string, string> = {
  password: 'Email e senha',
  'google.com': 'Google'
};

export function LoginMethodsPage() {
  const { user, authFromCache } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
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
      if (!user || authFromCache) {
        throw new Error('Entre na Granativa para alterar métodos de acesso.');
      }

      if (user.providerData.length <= 1) {
        throw new Error('Mantenha pelo menos um método de acesso ativo.');
      }

      if (currentPassword && hasPassword) {
        await reauthenticateWithPassword(user, currentPassword);
      }

      await unlinkProvider(user, providerId);
    }, 'Método removido da sua conta Granativa.');
  }

  async function onDeleteAccount() {
    setBusy(true);
    setMessage(null);
    setSuccess(null);

    try {
      if (!user || authFromCache) {
        throw new Error('Entre novamente na Granativa antes de excluir a conta.');
      }

      if (deleteConfirmation.trim() !== 'EXCLUIR') {
        throw new Error('Digite EXCLUIR para confirmar.');
      }

      if (hasPassword) {
        if (!deletePassword) {
          throw new Error('Informe sua senha atual para confirmar a exclusão.');
        }

        await reauthenticateWithPassword(user, deletePassword);
      } else if (hasGoogle) {
        await reauthenticateWithGoogle(user);
      } else {
        throw new Error('Adicione um método de login antes de excluir a conta.');
      }

      await deleteAccountData(user.uid);
      await deleteAuthenticatedUser(user);
      window.location.assign('/');
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-content">
      <p className="eyebrow">Segurança</p>
      <h1 className="page-title">Métodos de login</h1>
      <p className="page-description">
        Gerencie como você entra na Granativa. A conta mantém o mesmo UID ao vincular Google ou adicionar senha.
      </p>

      <div className="settings-grid">
        <section className="surface surface-pad form-stack">
          <FormMessage>{message}</FormMessage>
          <FormMessage type="success">{success}</FormMessage>
          <div className="notice">
            <ShieldAlert size={18} aria-hidden="true" /> a Granativa bloqueia desvincular o último método ativo e não faz
            merge automático entre UIDs diferentes.
          </div>

          <div className="provider-list">
            {providers.map((providerId) => (
              <div className="provider-item" key={providerId}>
                <div>
                  <strong>{providerLabels[providerId] ?? providerId}</strong>
                  <p className="text-secondary">Vinculado à sua conta Granativa.</p>
                </div>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy || providers.length <= 1 || authFromCache}
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
              disabled={busy || !user || authFromCache}
              onClick={() =>
                run(async () => {
                  if (!user || authFromCache) {
                    throw new Error('Entre na Granativa para alterar métodos de acesso.');
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
                disabled={busy || newPassword.length < 8 || !user || authFromCache}
                onClick={() =>
                  run(async () => {
                    if (!user || authFromCache) {
                      throw new Error('Entre na Granativa para alterar métodos de acesso.');
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

        <section className="surface surface-pad form-stack danger-zone" aria-labelledby="delete-account-title">
          <div className="notice notice--danger">
            <AlertTriangle size={18} aria-hidden="true" /> Esta ação apaga sua conta, seu workspace pessoal, contas,
            transações, cartões, faturas, metas, cofrinhos pessoais e espaços de casal criados por você.
          </div>

          <div>
            <h2 id="delete-account-title">Excluir conta definitivamente</h2>
            <p className="text-secondary">
              Essa exclusão não pode ser desfeita. Para confirmar, digite EXCLUIR e valide seu login.
            </p>
          </div>

          <div className="field">
            <label htmlFor="delete-confirmation">Digite EXCLUIR</label>
            <input
              className="input"
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>

          {hasPassword ? (
            <div className="field">
              <label htmlFor="delete-password">Senha atual</label>
              <input
                className="input"
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          ) : null}

          <button
            className="button button--danger"
            type="button"
            disabled={busy || authFromCache || deleteConfirmation.trim() !== 'EXCLUIR' || (hasPassword && !deletePassword)}
            onClick={() => void onDeleteAccount()}
          >
            <Trash2 size={18} aria-hidden="true" /> {busy ? 'Excluindo...' : 'Excluir minha conta'}
          </button>
        </section>
      </div>
    </section>
  );
}
