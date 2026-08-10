import { Link } from 'react-router-dom';
import { BrandLockup } from './BrandLogo';

const footerColumns = [
  {
    heading: 'Produto',
    links: [
      { to: '/features', label: 'Funcionalidades' },
      { to: '/security', label: 'Segurança' }
    ]
  },
  {
    heading: 'Suporte',
    links: [
      { to: '/help', label: 'Ajuda' },
      { to: '/contact', label: 'Contato' }
    ]
  },
  {
    heading: 'Legal',
    links: [
      { to: '/legal/privacy', label: 'Privacidade' },
      { to: '/legal/terms', label: 'Termos de uso' },
      { to: '/legal/data-deletion', label: 'Excluir meus dados' }
    ]
  }
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link className="site-footer-brand" to="/" aria-label="Ir para a página inicial da Granativa">
        <BrandLockup />
      </Link>
      {footerColumns.map((col) => (
        <nav key={col.heading} className="site-footer-col" aria-label={col.heading}>
          <p className="site-footer-heading">{col.heading}</p>
          {col.links.map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </nav>
      ))}
    </footer>
  );
}
