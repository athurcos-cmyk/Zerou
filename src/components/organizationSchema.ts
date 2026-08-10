/* Schema.org: sinal explícito de identidade da marca pro Google/IA — "Granativa" é este site,
   este app, não uma variação de "Granactive Retinoide" (ativo de skincare que domina a busca
   desse nome). Sem isso não há garantia de desambiguação, mas é o sinal técnico mais forte
   que existe pra isso. Compartilhado por todas as páginas públicas (landing + `/security`,
   `/features`, `/help`, `/contact`, `/legal/*`) via `PublicLayout`, não só a home — um crawler
   pode entrar pela página interna sem nunca passar pela home antes. */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://granativa.com.br/#organization',
      name: 'Granativa',
      url: 'https://granativa.com.br/',
      logo: 'https://granativa.com.br/brand/granativa-logo-horizontal.png',
      description:
        'App financeiro pessoal e de casal. Registre gastos, contas e cartões em poucos toques e veja pra onde vai seu dinheiro — sozinho ou a dois.'
    },
    {
      '@type': 'WebSite',
      '@id': 'https://granativa.com.br/#website',
      url: 'https://granativa.com.br/',
      name: 'Granativa',
      inLanguage: 'pt-BR',
      publisher: { '@id': 'https://granativa.com.br/#organization' }
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Granativa',
      url: 'https://granativa.com.br/',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description:
        'Registre um gasto em 3 toques e veja pra onde vai seu dinheiro. Cartões, contas e metas num lugar só — com um espaço do casal onde o seu continua privado.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' }
    },
    /* SiteNavigationElement: sinal fraco pro Google sobre a navegação principal do site — não
       garante sitelinks (isso é 100% algorítmico, decidido pelo Google quando o site já é a
       resposta dominante pra uma busca), mas é o único sinal técnico que existe pra isso, e não
       custa nada. Reflete o menu real de `PublicLayout.tsx` + `SiteFooter.tsx`, nunca uma lista
       inventada. */
    {
      '@type': 'SiteNavigationElement',
      name: 'Funcionalidades',
      url: 'https://granativa.com.br/features'
    },
    {
      '@type': 'SiteNavigationElement',
      name: 'Segurança',
      url: 'https://granativa.com.br/security'
    },
    {
      '@type': 'SiteNavigationElement',
      name: 'Ajuda',
      url: 'https://granativa.com.br/help'
    },
    {
      '@type': 'SiteNavigationElement',
      name: 'Contato',
      url: 'https://granativa.com.br/contact'
    }
  ]
};
