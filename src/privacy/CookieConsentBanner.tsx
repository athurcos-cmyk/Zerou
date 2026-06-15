import { useEffect, useState } from 'react';
import { OPEN_COOKIE_PREFERENCES_EVENT, readCookieConsent, saveCookieConsent } from './cookieConsent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(() => readCookieConsent() === null);
  const [customizing, setCustomizing] = useState(false);
  const [preferences, setPreferences] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    function handleOpenPreferences() {
      const current = readCookieConsent();
      setPreferences(current?.preferences ?? true);
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setCustomizing(true);
      setVisible(true);
    }

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences);
  }, []);

  function acceptAll() {
    saveCookieConsent({ preferences: true, analytics: true, marketing: true });
    setVisible(false);
  }

  function refuseOptional() {
    saveCookieConsent({ preferences: false, analytics: false, marketing: false });
    setVisible(false);
  }

  function saveCustom() {
    saveCookieConsent({ preferences, analytics, marketing });
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <section className="cookie-banner" aria-label="Preferências de cookies">
      <div>
        <p className="eyebrow">Privacidade Zerou</p>
        <h2>Cookies opcionais ficam sob seu controle.</h2>
        <p className="text-secondary">
          Usamos cookies necessários para o app funcionar. Preferências, analytics e marketing só entram se você permitir.
        </p>
      </div>

      {customizing ? (
        <div className="cookie-options" aria-label="Opções de consentimento">
          <label className="checkbox-row">
            <input type="checkbox" checked disabled />
            Necessários, sempre ativos
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={preferences} onChange={(event) => setPreferences(event.target.checked)} />
            Preferências do produto
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
            Analytics opcional
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
            Marketing opcional
          </label>
        </div>
      ) : null}

      <div className="cookie-actions">
        {customizing ? (
          <button className="button button--primary" type="button" onClick={saveCustom}>
            Salvar escolhas
          </button>
        ) : (
          <button className="button button--secondary" type="button" onClick={acceptAll}>
            Aceitar opcionais
          </button>
        )}
        <button className="button button--secondary" type="button" onClick={refuseOptional}>
          Recusar opcionais
        </button>
        <button className="button button--ghost" type="button" onClick={() => setCustomizing((value) => !value)}>
          {customizing ? 'Fechar preferências' : 'Revisar preferências'}
        </button>
      </div>
    </section>
  );
}
