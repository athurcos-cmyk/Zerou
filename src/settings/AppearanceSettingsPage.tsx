import { MonitorSmartphone } from 'lucide-react';
import { useAppearanceStore } from '../theme/appearance.store';
import { THEME_DEFINITIONS } from '../theme/theme.registry';
import type { Density, FontScale } from '../theme/theme.types';

export function AppearanceSettingsPage() {
  const preferences = useAppearanceStore((state) => state.preferences);
  const resolvedThemeId = useAppearanceStore((state) => state.resolvedThemeId);
  const setThemeMode = useAppearanceStore((state) => state.setThemeMode);
  const setThemeId = useAppearanceStore((state) => state.setThemeId);
  const setDensity = useAppearanceStore((state) => state.setDensity);
  const setFontScale = useAppearanceStore((state) => state.setFontScale);
  const setReduceMotion = useAppearanceStore((state) => state.setReduceMotion);

  return (
    <section className="page-content">
      <p className="eyebrow">Configurações</p>
      <h1 className="page-title">Aparência</h1>
      <p className="page-description">
        Escolha como o Granix aparece para você. A preferência é individual e não altera a interface de outra pessoa.
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
                <span className="text-secondary">{theme.description}</span>
              </button>
            ))}
          </div>
          <p className="text-muted">Tema aplicado agora: {resolvedThemeId}</p>
        </section>

        <section className="surface surface-pad" aria-labelledby="comfort-title">
          <h2 id="comfort-title">Conforto de leitura</h2>
          <div className="option-row">
            <div>
              <strong>Densidade</strong>
              <p className="text-secondary">Controle o respiro da interface autenticada.</p>
            </div>
            <Segmented<Density>
              value={preferences.density}
              options={[
                ['comfortable', 'Confortável'],
                ['compact', 'Compacta']
              ]}
              onChange={setDensity}
            />
          </div>
          <div className="option-row">
            <div>
              <strong>Tamanho da fonte</strong>
              <p className="text-secondary">Ajuste sem quebrar os tokens do tema.</p>
            </div>
            <Segmented<FontScale>
              value={preferences.fontScale}
              options={[
                ['sm', 'P'],
                ['md', 'M'],
                ['lg', 'G']
              ]}
              onChange={setFontScale}
            />
          </div>
          <div className="option-row">
            <div>
              <strong>Reduzir animações</strong>
              <p className="text-secondary">Preferência individual para interações mais discretas.</p>
            </div>
            <button
              className="button button--secondary"
              type="button"
              aria-pressed={preferences.reduceMotion}
              onClick={() => setReduceMotion(!preferences.reduceMotion)}
            >
              {preferences.reduceMotion ? 'Ativo' : 'Inativo'}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented">
      {options.map(([option, label]) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {label}
        </button>
      ))}
    </div>
  );
}
