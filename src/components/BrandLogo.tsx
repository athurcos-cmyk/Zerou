interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  if (compact) {
    return (
      <img
        className="brand-mark brand-mark--compact"
        src="/brand/granativa-icon-master-1024.png"
        alt="Granativa"
        width="48"
        height="48"
      />
    );
  }

  return (
    <img
      className="brand-mark"
      src="/brand/granativa-logo-primary.png"
      alt="Granativa - Controle individual. Organização a dois."
    />
  );
}

export function BrandLockup() {
  return (
    <div className="brand-lockup" aria-label="Granativa">
      <img src="/brand/granativa-icon-master-1024.png" alt="" width="48" height="48" aria-hidden="true" />
      <div>
        <strong>Granativa</strong>
        <span>Controle individual. Organização a dois.</span>
      </div>
    </div>
  );
}
