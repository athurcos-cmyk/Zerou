import { useEffect } from 'react';

interface SeoProps {
  title: string;
  description: string;
  path?: string;
  robots?: 'index,follow' | 'noindex,nofollow';
}

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value));
}

function upsertCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }

  element.href = url;
}

export function Seo({ title, description, path = '/', robots = 'index,follow' }: SeoProps) {
  useEffect(() => {
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${path}`;
    const fullTitle = title === 'Granix' ? 'Granix' : `${title} | Granix`;

    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: robots });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: `${origin}/brand/granix-logo-horizontal.png` });
    upsertCanonical(canonicalUrl);
  }, [description, path, robots, title]);

  return null;
}
