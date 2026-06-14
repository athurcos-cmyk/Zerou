interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  if (compact) {
    return (
      <img
        className="brand-mark brand-mark--compact"
        src="/brand/zerou-symbol.png"
        alt="Zerou"
        width="48"
        height="48"
      />
    );
  }

  return (
    <>
      <img
        className="brand-mark brand-logo-light"
        src="/brand/zerou-logo-primary.png"
        alt="Zerou - Controle individual. Organização a dois."
      />
      <img
        className="brand-mark brand-logo-dark"
        src="/brand/zerou-logo-negative.png"
        alt="Zerou - Controle individual. Organização a dois."
      />
    </>
  );
}

export function BrandLockup() {
  return (
    <div className="brand-lockup" aria-label="Zerou">
      <img src="/brand/zerou-symbol.png" alt="" width="48" height="48" aria-hidden="true" />
      <div>
        <strong>Zerou</strong>
        <span>Controle individual. Organização a dois.</span>
      </div>
    </div>
  );
}
