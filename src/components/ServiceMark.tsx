import { Repeat } from 'lucide-react';
import { serviceBrandColors } from '../theme/palette';
import type { SubscriptionService } from '../finance/subscriptionServices';

interface ServiceMarkProps {
  service: SubscriptionService | null;
}

/**
 * Marca visual de um serviço (Netflix, Energia, Academia...). Estados, na ordem:
 * logo SVG quando existe (`logoPath`); tile "ícone de app" na cor da marca com iniciais
 * brancas quando o logo real é só wordmark (`serviceBrandColors`); tile de iniciais neutro
 * pros genéricos (Aluguel, Água...); e um ícone quando não reconhecemos nada.
 *
 * Mesmo desenho do `BankMark` da tela de Contas, de propósito.
 */
export function ServiceMark({ service }: ServiceMarkProps) {
  const brandColor = service && !service.logoPath ? serviceBrandColors[service.id] : undefined;
  const className = [
    'service-mark',
    service?.logoPath ? 'service-mark--has-logo' : '',
    brandColor ? 'service-mark--brand' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className} style={brandColor ? { background: brandColor } : undefined} aria-hidden="true">
      {service?.logoPath ? (
        <img className="service-mark__logo" src={service.logoPath} alt="" loading="lazy" />
      ) : service ? (
        <span className="service-mark__text">{service.initials}</span>
      ) : (
        <Repeat size={16} />
      )}
    </span>
  );
}
