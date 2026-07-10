import { Repeat } from 'lucide-react';
import type { SubscriptionService } from '../finance/subscriptionServices';

interface ServiceMarkProps {
  service: SubscriptionService | null;
}

/**
 * Marca visual de um serviço (Netflix, Energia, Academia...). Três estados, na ordem:
 * logo SVG quando o `simple-icons` tem a marca, tile de iniciais quando o serviço é
 * conhecido mas não tem logo (Prime Video, Disney+, Wellhub, e as contas fixas genéricas),
 * e um ícone neutro quando não reconhecemos nada.
 *
 * Mesmo desenho do `BankMark` da tela de Contas, de propósito.
 */
export function ServiceMark({ service }: ServiceMarkProps) {
  const className = ['service-mark', service?.logoPath ? 'service-mark--has-logo' : ''].filter(Boolean).join(' ');

  return (
    <span className={className} aria-hidden="true">
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
