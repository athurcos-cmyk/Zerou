import { MonitorSmartphone } from 'lucide-react';
import { useAppearanceStore } from '../theme/appearance.store';
import { THEME_DEFINITIONS } from '../theme/theme.registry';

export function AppearanceSettingsPage() {
  const preferences = useAppearanceStore((state) => state.preferences);
  const resolvedThemeId = useAppearanceStore((state) => state.resolvedThemeId);
  const setThemeMode = useAppearanceStore((state) => state.setThemeMode);
  const setThemeId = useAppearanceStore((state) => state.setThemeId);

  return (
    <section className="page-content">
      <p className="eyebrow">Configurações</p>
      <h1 className="page-title">Aparência</h1>
      <p className="page-description">
        Escolha como a Granativa aparece para você. A preferência é individual e não altera a interface de outra pessoa.
      </p>

      <div className="settings-grid">
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
          <h2 id="themes-title">Temas oficiais</h2>
          <div className="theme-grid">
            {THEME_DEFINITIONS.map((theme) => (
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
