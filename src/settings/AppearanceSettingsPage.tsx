import { MonitorSmartphone } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useAppearanceStore } from '../theme/appearance.store';
import { THEME_DEFINITIONS } from '../theme/theme.registry';
import { AvatarPicker } from '../profile/AvatarPicker';
import { updateAvatarStyle } from '../profile/updateAvatarStyle';
import { FormMessage } from '../components/FormMessage';
import { useState, useCallback, useMemo } from 'react';

export function AppearanceSettingsPage() {
  const { user, profile } = useAuth();
  const preferences = useAppearanceStore((state) => state.preferences);
  const resolvedThemeId = useAppearanceStore((state) => state.resolvedThemeId);
  const setThemeMode = useAppearanceStore((state) => state.setThemeMode);
  const setThemeId = useAppearanceStore((state) => state.setThemeId);
  // Estado otimista: reflete a escolha imediatamente, mesmo antes do Firestore
  // confirmar. O onSnapshot do perfil eventualmente sincroniza e sobrescreve.
  const [optimisticAvatarId, setOptimisticAvatarId] = useState<string | undefined>(undefined);
  const hasOptimistic = optimisticAvatarId !== undefined && optimisticAvatarId !== profile?.avatarStyle;
  const effectiveAvatarStyle = hasOptimistic ? optimisticAvatarId : profile?.avatarStyle;
  // Quando o perfil real chega com o mesmo valor, limpa o otimista
  if (hasOptimistic && optimisticAvatarId === profile?.avatarStyle) {
    queueMicrotask(() => setOptimisticAvatarId(undefined));
  }

  const pickerProfile = effectiveAvatarStyle !== profile?.avatarStyle
    ? { name: profile?.name ?? '', avatarStyle: effectiveAvatarStyle }
    : profile;

  const handleAvatarChange = useCallback((avatarId: string | undefined) => {
    if (!user) return;
    setOptimisticAvatarId(avatarId);
    updateAvatarStyle(user.uid, avatarId);
  }, [user]);

  const { lightThemes, darkThemes } = useMemo(() => ({
    lightThemes: THEME_DEFINITIONS.filter((t) => t.tone === 'light'),
    darkThemes: THEME_DEFINITIONS.filter((t) => t.tone === 'dark'),
  }), []);

  return (
    <section className="page-content">
      <p className="eyebrow">Configurações</p>
      <h1 className="page-title">Aparência</h1>
      <p className="page-description">
        Escolha como a Granativa aparece para você. A preferência é individual e não altera a interface de outra pessoa.
      </p>

      <div className="settings-grid">
        <section className="surface surface-pad" aria-labelledby="avatar-title">
          <h2 id="avatar-title">Avatar</h2>
          <AvatarPicker profile={pickerProfile} onSelect={handleAvatarChange} />
          <FormMessage />
        </section>

        <section className="surface surface-pad" aria-labelledby="theme-mode-title">
          <div className="option-row">
            <div>
              <h2 id="theme-mode-title">Seguir aparência do dispositivo</h2>
              <p className="text-secondary">
                No modo sistema, claro usa Paper e escuro usa Obsidian.
              </p>
            </div>
            <button
              className="button button--secondary"
              type="button"
              aria-pressed={preferences.themeMode === 'system'}
              onClick={() => setThemeMode(preferences.themeMode === 'system' ? 'manual' : 'system')}
            >
              <MonitorSmartphone size={18} aria-hidden="true" />
              {preferences.themeMode === 'system' ? 'Ativo' : 'Ativar'}
            </button>
          </div>
        </section>

        <section className="surface surface-pad" aria-labelledby="themes-title">
          <h2 id="themes-title">Temas</h2>

          <h3 className="theme-group-label">Claros</h3>
          <div className="theme-grid">
            {lightThemes.map((theme) => (
              <button
                className="theme-card"
                type="button"
                key={theme.id}
                aria-pressed={preferences.themeMode === 'manual' && preferences.themeId === theme.id}
                onClick={() => setThemeId(theme.id)}
              >
                <span className="theme-preview" data-preview-theme={theme.id} aria-hidden="true">
                  <span className="theme-preview-main" />
                  <span className="theme-preview-side">
                    <span className="theme-preview-pill" />
                    <span className="theme-preview-line" />
                    <span className="theme-preview-line" />
                  </span>
                </span>
                <strong>{theme.name}</strong>
              </button>
            ))}
          </div>

          <h3 className="theme-group-label">Escuros</h3>
          <div className="theme-grid">
            {darkThemes.map((theme) => (
              <button
                className="theme-card"
                type="button"
                key={theme.id}
                aria-pressed={preferences.themeMode === 'manual' && preferences.themeId === theme.id}
                onClick={() => setThemeId(theme.id)}
              >
                <span className="theme-preview" data-preview-theme={theme.id} aria-hidden="true">
                  <span className="theme-preview-main" />
                  <span className="theme-preview-side">
                    <span className="theme-preview-pill" />
                    <span className="theme-preview-line" />
                    <span className="theme-preview-line" />
                  </span>
                </span>
                <strong>{theme.name}</strong>
              </button>
            ))}
          </div>
          <p className="text-muted">Tema aplicado agora: {resolvedThemeId}</p>
        </section>
      </div>
    </section>
  );
}
