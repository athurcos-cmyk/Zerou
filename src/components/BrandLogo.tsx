interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  if (compact) {
    return (
      <img
        className="brand-mark brand-mark--compact"
        src="/brand/granix-icon-master-1024.png"
        alt="Granix"
        width="48"
        height="48"
      />
    );
  }

  return (
    <img
      className="brand-mark"
      src="/brand/granix-logo-primary.png"
      alt="Granix - Controle individual. Organização a dois."
    />
  );
}

export function BrandLockup() {
  return (
    <div className="brand-lockup" aria-label="Granix">
      <img src="/brand/granix-icon-master-1024.png" alt="" width="48" height="48" aria-hidden="true" />
      <div>
        <strong>Granix</strong>
        <span>Controle individual. Organização a dois.</span>
      </div>
    </div>
  );
}
