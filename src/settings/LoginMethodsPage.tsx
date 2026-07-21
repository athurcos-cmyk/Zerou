import { useMemo, useState } from 'react';
import { AlertTriangle, CircleUserRound, Info, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  addPasswordProvider,
  deleteAuthenticatedUser,
  linkGoogleProvider,
  logout,
  reauthenticateWithGoogle,
  reauthenticateWithPassword,
  unlinkProvider
} from '../auth/authService';
import { getAuthErrorMessage } from '../auth/authErrors';
import { FormMessage } from '../components/FormMessage';
import { deleteAccountData, runAccountDeletion, sendGoodbyeEmailCallable, forceLogoutAllDevicesCallable } from './accountDeletionService';
import { useAccountDeletion } from './accountDeletion.store';

const providerLabels: Record<string, string> = {
  password: 'Email e senha',
  'google.com': 'Google'
};

export function LoginMethodsPage() {
  const { user, profile, authFromCache } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const setAccountDeleting = useAccountDeletion((state) => state.setDeleting);
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
    }, 'Método removido da sua conta.');
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

      // Precisa estar ligado antes de deleteAccountData() apagar `users/{uid}` — sem isso,
      // o onSnapshot ao vivo em AuthContext.tsx zera o perfil e o guard de rota manda a
      // pessoa pro onboarding no meio da própria exclusão (ver accountDeletion.store.ts).
      // Não desliga no sucesso: window.location.assign('/') já recarrega a página inteira.
      setAccountDeleting(true);

      await runAccountDeletion({
        hasGoogle,
        hasPassword,
        currentPassword,
        userEmail: user.email ?? '',
        userName: user.displayName ?? '',
        reauthenticateWithGoogle: () => reauthenticateWithGoogle(user),
        reauthenticateWithPassword: (password) => reauthenticateWithPassword(user, password),
        sendGoodbyeEmail: () => sendGoodbyeEmailCallable(user.email ?? '', user.displayName ?? ''),
        forceLogoutAllDevices: () => forceLogoutAllDevicesCallable(),
        deleteAccountData: () => deleteAccountData(user.uid),
        deleteAuthenticatedUser: () => deleteAuthenticatedUser(user),
        // clearLocalCache: se deleteUser falhar depois dos dados já apagados, limpa
        // também cache de perfil + IndexedDB do Firestore (dados residuais da conta morta).
        logout: () => logout({ clearLocalCache: true })
      });
      window.location.assign('/');
    } catch (error) {
      setAccountDeleting(false);
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // Fechou a janela do Google sem confirmar: tranquiliza (nada foi excluído) e
        // explica exatamente como concluir, em vez de um erro técnico assustador.
        setMessage(
          'Você fechou a janela do Google, então nada foi excluído — sua conta continua ativa. Para concluir, toque em "Excluir minha conta" e escolha sua conta na janela do Google (não feche no X).'
        );
      } else {
        setMessage(getAuthErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-content">
      <p className="eyebrow">Segurança</p>
      <h1 className="page-title">Sua conta</h1>
      <p className="page-description">Como você entra na Granativa e o que fazer se quiser sair de vez.</p>

      <div className="settings-grid">
        <section className="surface surface-pad form-stack" aria-labelledby="profile-title">
          <h2 id="profile-title">Perfil</h2>
          <div className="provider-list">
            <div className="provider-item">
              <div>
                <strong>Nome</strong>
                <p className="text-secondary">{profile?.name ?? '—'}</p>
              </div>
            </div>
            <div className="provider-item">
              <div>
                <strong>Email</strong>
                <p className="text-secondary">{user?.email ?? '—'}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="surface surface-pad form-stack" aria-labelledby="login-methods-title">
          <h2 id="login-methods-title">Métodos de login</h2>
          <FormMessage>{message}</FormMessage>
          <FormMessage type="success">{success}</FormMessage>

          {hasGoogle && !hasPassword ? (
            <div className="notice">
              <Info size={18} aria-hidden="true" /> Você entra só com sua conta Google — não existe uma senha
              cadastrada aqui. Adicione uma senha se quiser poder entrar mesmo em situações em que o Google não
              funcione (computador de terceiros, sem acesso à conta Google, etc.).
            </div>
          ) : (
            <div className="notice">
              <Info size={18} aria-hidden="true" /> Você pode manter mais de um método ativo — todos continuam
              levando à mesma conta.
            </div>
          )}

          <div className="provider-list">
            {providers.map((providerId) => (
              <div className="provider-item" key={providerId}>
                <div>
                  <strong>{providerLabels[providerId] ?? providerId}</strong>
                  <p className="text-secondary">
                    <span className="status-pill status-pill--success">Ativo</span>
                  </p>
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

          {hasPassword ? (
            <div className="field">
              <label htmlFor="current-password">Senha atual (necessária para remover um método{!hasGoogle ? ' ou excluir a conta' : ''})</label>
              <input
                className="input"
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
          ) : null}

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
                }, 'Google vinculado à sua conta.')
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
                  }, 'Senha adicionada à sua conta.')
                }
              >
                <KeyRound size={18} aria-hidden="true" /> Adicionar senha
              </button>
            </div>
          ) : null}
        </section>

        <section className="surface surface-pad form-stack danger-zone" aria-labelledby="delete-account-title">
          <div className="notice notice--danger">
            <AlertTriangle size={18} aria-hidden="true" /> Esta ação apaga sua conta, seu espaço pessoal, contas,
            transações, cartões, faturas, metas, cofrinhos pessoais e espaços de casal criados por você.
          </div>

          <div>
            <h2 id="delete-account-title">Excluir conta definitivamente</h2>
            <p className="text-secondary">Essa exclusão não pode ser desfeita. Para confirmar, digite EXCLUIR abaixo.</p>
            {hasGoogle ? (
              <p className="text-secondary">
                Como você entra com o Google, vai abrir uma janela rápida do Google só pra confirmar que é
                você. <strong>Clique na sua conta</strong> pra concluir — se fechar no X, a exclusão é
                cancelada e nada é apagado.
              </p>
            ) : null}
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

          <button
            className="button button--danger"
            type="button"
            disabled={
              busy ||
              authFromCache ||
              deleteConfirmation.trim() !== 'EXCLUIR' ||
              (!hasGoogle && hasPassword && !currentPassword)
            }
            onClick={() => void onDeleteAccount()}
          >
            <Trash2 size={18} aria-hidden="true" /> {busy ? 'Excluindo...' : 'Excluir minha conta'}
          </button>
        </section>
      </div>
    </section>
  );
}
