import { defaultCategories } from './defaultCategories';

type DefaultCategoryId = (typeof defaultCategories)[number]['id'];

export interface SubscriptionService {
  id: string;
  /** Nome canônico. Preenche a descrição quando a pessoa escolhe a sugestão. */
  name: string;
  /** Como as pessoas de fato escrevem: apelidos, marca antiga, empresa por trás. */
  aliases: string[];
  /** Fallback quando não há SVG. Duas letras cabem no tile de 2.15rem. */
  initials: string;
  /** Categoria padrão sugerida. Ausente quando nenhuma das 5 padrão serve (ex.: escola, seguro). */
  suggestedCategoryId?: DefaultCategoryId;
  /** Gerado por `npm run generate:service-logos`. Ausente = marca fora do simple-icons. */
  logoPath?: string;
}

/**
 * Catálogo de assinaturas e contas fixas comuns no Brasil.
 *
 * Três níveis de marca (ver `ServiceMark`): `logoPath` (SVG oficial quadrado — Netflix,
 * Spotify, ChatGPT, Microsoft 365, Oi...); tile "ícone de app" na cor da marca com iniciais
 * brancas pra quem só tem wordmark, que fica ilegível espremido num tile de 36px (Prime Video,
 * Disney+, Wellhub, Vivo... via `serviceBrandColors` em `theme/palette.ts`); e tile de iniciais
 * neutro pros genéricos (Aluguel, Água, Energia). Ver `public/service-logos/SOURCES.md`.
 */
export const subscriptionServices: SubscriptionService[] = [
  // ── Streaming de vídeo ──────────────────────────────────────────────────────
  { id: 'netflix', name: 'Netflix', aliases: [], initials: 'NF', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/netflix.svg' },
  { id: 'prime-video', name: 'Prime Video', aliases: ['amazon prime', 'prime'], initials: 'PV', suggestedCategoryId: 'expense_leisure' },
  { id: 'disney-plus', name: 'Disney+', aliases: ['disney plus', 'disney'], initials: 'D+', suggestedCategoryId: 'expense_leisure' },
  { id: 'max', name: 'Max', aliases: ['hbo max', 'hbo'], initials: 'MX', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/max.svg' },
  { id: 'paramount-plus', name: 'Paramount+', aliases: ['paramount plus', 'paramount'], initials: 'P+', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/paramount-plus.svg' },
  { id: 'apple-tv', name: 'Apple TV+', aliases: ['apple tv plus', 'apple tv'], initials: 'TV', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/apple-tv.svg' },
  { id: 'globoplay', name: 'Globoplay', aliases: ['globo play'], initials: 'GB', suggestedCategoryId: 'expense_leisure' },
  { id: 'crunchyroll', name: 'Crunchyroll', aliases: [], initials: 'CR', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/crunchyroll.svg' },
  { id: 'youtube-premium', name: 'YouTube Premium', aliases: ['youtube'], initials: 'YT', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/youtube-premium.svg' },

  // ── Música ──────────────────────────────────────────────────────────────────
  { id: 'spotify', name: 'Spotify', aliases: [], initials: 'SP', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/spotify.svg' },
  { id: 'youtube-music', name: 'YouTube Music', aliases: [], initials: 'YM', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/youtube-music.svg' },
  { id: 'apple-music', name: 'Apple Music', aliases: [], initials: 'AM', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/apple-music.svg' },
  { id: 'deezer', name: 'Deezer', aliases: [], initials: 'DZ', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/deezer.svg' },
  { id: 'tidal', name: 'TIDAL', aliases: [], initials: 'TD', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/tidal.svg' },

  // ── Jogos ───────────────────────────────────────────────────────────────────
  { id: 'playstation-plus', name: 'PlayStation Plus', aliases: ['ps plus', 'psn', 'playstation'], initials: 'PS', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/playstation-plus.svg' },
  { id: 'xbox-game-pass', name: 'Xbox Game Pass', aliases: ['game pass', 'xbox'], initials: 'XB', suggestedCategoryId: 'expense_leisure' },
  { id: 'nintendo-switch-online', name: 'Nintendo Switch Online', aliases: ['nintendo'], initials: 'NS', suggestedCategoryId: 'expense_leisure' },
  { id: 'steam', name: 'Steam', aliases: [], initials: 'ST', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/steam.svg' },
  { id: 'twitch', name: 'Twitch', aliases: [], initials: 'TW', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/twitch.svg' },

  // ── Comida e mobilidade ─────────────────────────────────────────────────────
  { id: 'ifood', name: 'iFood Clube', aliases: ['ifood'], initials: 'IF', suggestedCategoryId: 'expense_food', logoPath: '/service-logos/ifood.svg' },
  { id: 'uber-eats', name: 'Uber Eats', aliases: [], initials: 'UE', suggestedCategoryId: 'expense_food', logoPath: '/service-logos/uber-eats.svg' },
  { id: 'rappi', name: 'Rappi Prime', aliases: ['rappi'], initials: 'RP', suggestedCategoryId: 'expense_food', logoPath: '/service-logos/rappi.svg' },
  { id: 'uber-one', name: 'Uber One', aliases: ['uber'], initials: 'UB', suggestedCategoryId: 'expense_transport', logoPath: '/service-logos/uber-one.svg' },

  // ── Saúde e academia ────────────────────────────────────────────────────────
  { id: 'wellhub', name: 'Wellhub (Gympass)', aliases: ['gympass', 'wellhub'], initials: 'WH', suggestedCategoryId: 'expense_health' },
  { id: 'smart-fit', name: 'Smart Fit', aliases: ['smartfit'], initials: 'SF', suggestedCategoryId: 'expense_health' },
  { id: 'academia', name: 'Academia', aliases: ['musculacao', 'crossfit', 'pilates'], initials: 'AC', suggestedCategoryId: 'expense_health' },
  { id: 'plano-saude', name: 'Plano de saúde', aliases: ['unimed', 'amil', 'hapvida', 'sulamerica', 'convenio'], initials: 'PS', suggestedCategoryId: 'expense_health' },
  { id: 'strava', name: 'Strava', aliases: [], initials: 'SV', suggestedCategoryId: 'expense_health', logoPath: '/service-logos/strava.svg' },

  // ── Nuvem, software e IA ────────────────────────────────────────────────────
  { id: 'icloud', name: 'iCloud+', aliases: ['icloud'], initials: 'IC', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/icloud.svg' },
  { id: 'google-one', name: 'Google One', aliases: ['google drive'], initials: 'G1', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/google-one.svg' },
  { id: 'dropbox', name: 'Dropbox', aliases: [], initials: 'DB', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/dropbox.svg' },
  { id: 'notion', name: 'Notion', aliases: [], initials: 'NT', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/notion.svg' },
  { id: 'microsoft-365', name: 'Microsoft 365', aliases: ['office 365', 'office', 'microsoft'], initials: 'M3', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/microsoft-365.svg' },
  { id: 'adobe', name: 'Adobe Creative Cloud', aliases: ['adobe', 'photoshop'], initials: 'AD', suggestedCategoryId: 'expense_leisure' },
  { id: 'canva', name: 'Canva Pro', aliases: ['canva'], initials: 'CV', suggestedCategoryId: 'expense_leisure' },
  { id: 'chatgpt', name: 'ChatGPT Plus', aliases: ['chatgpt', 'openai'], initials: 'AI', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/chatgpt.svg' },
  { id: 'claude', name: 'Claude', aliases: ['anthropic'], initials: 'CD', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/claude.svg' },

  // ── Educação e leitura ──────────────────────────────────────────────────────
  { id: 'duolingo', name: 'Duolingo', aliases: [], initials: 'DL', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/duolingo.svg' },
  { id: 'coursera', name: 'Coursera', aliases: [], initials: 'CO', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/coursera.svg' },
  { id: 'udemy', name: 'Udemy', aliases: [], initials: 'UD', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/udemy.svg' },
  { id: 'audible', name: 'Audible', aliases: [], initials: 'AU', suggestedCategoryId: 'expense_leisure', logoPath: '/service-logos/audible.svg' },
  { id: 'kindle', name: 'Kindle Unlimited', aliases: ['kindle'], initials: 'KU', suggestedCategoryId: 'expense_leisure' },
  { id: 'escola', name: 'Escola / faculdade', aliases: ['mensalidade', 'colegio', 'faculdade'], initials: 'ES' },

  // ── Telecom ─────────────────────────────────────────────────────────────────
  { id: 'claro', name: 'Claro', aliases: [], initials: 'CL', suggestedCategoryId: 'expense_home', logoPath: '/service-logos/claro.svg' },
  { id: 'vivo', name: 'Vivo', aliases: [], initials: 'VV', suggestedCategoryId: 'expense_home' },
  { id: 'tim', name: 'TIM', aliases: [], initials: 'TM', suggestedCategoryId: 'expense_home' },
  { id: 'oi', name: 'Oi', aliases: [], initials: 'OI', suggestedCategoryId: 'expense_home', logoPath: '/service-logos/oi.svg' },
  { id: 'sky', name: 'Sky', aliases: [], initials: 'SK', suggestedCategoryId: 'expense_home' },
  { id: 'celular', name: 'Celular', aliases: ['telefone', 'plano de celular'], initials: 'CE', suggestedCategoryId: 'expense_home' },
  { id: 'internet', name: 'Internet', aliases: ['banda larga', 'fibra', 'wifi'], initials: 'IN', suggestedCategoryId: 'expense_home' },

  // ── Contas fixas da casa ────────────────────────────────────────────────────
  { id: 'energia', name: 'Energia elétrica', aliases: ['luz', 'enel', 'cemig', 'copel', 'cpfl', 'light', 'celesc', 'coelba', 'equatorial', 'neoenergia'], initials: 'EN', suggestedCategoryId: 'expense_home' },
  { id: 'agua', name: 'Água', aliases: ['sabesp', 'copasa', 'cedae', 'sanepar', 'saneamento', 'caesb'], initials: 'AG', suggestedCategoryId: 'expense_home' },
  { id: 'gas', name: 'Gás', aliases: ['comgas', 'gas encanado', 'botijao'], initials: 'GS', suggestedCategoryId: 'expense_home' },
  { id: 'aluguel', name: 'Aluguel', aliases: [], initials: 'AL', suggestedCategoryId: 'expense_home' },
  { id: 'condominio', name: 'Condomínio', aliases: [], initials: 'CD', suggestedCategoryId: 'expense_home' },
  { id: 'iptu', name: 'IPTU', aliases: [], initials: 'IP', suggestedCategoryId: 'expense_home' },
  { id: 'seguro', name: 'Seguro', aliases: ['seguro de vida', 'seguro auto'], initials: 'SG' }
];

/** Sugestões iniciais, com o campo vazio. As mais assinadas primeiro. */
const featuredIds = ['netflix', 'spotify', 'prime-video', 'disney-plus', 'energia', 'internet', 'aluguel', 'academia'];

export function normalizeServiceQuery(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function tokenize(value: string) {
  return normalizeServiceQuery(value)
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);
}

/** Todos os rótulos pelos quais um serviço pode ser reconhecido. */
function labelsOf(service: SubscriptionService) {
  return [service.name, ...service.aliases];
}

/** As `needle` aparecem como sequência contígua dentro de `haystack`? */
function containsSequence(haystack: string[], needle: string[]) {
  if (needle.length === 0 || needle.length > haystack.length) return false;

  return haystack.some((_, start) => needle.every((token, offset) => haystack[start + offset] === token));
}

/**
 * Reconhece o serviço a partir de uma descrição livre ("Netflix da família", "Conta de luz").
 *
 * Casa por **sequência de palavras inteiras**, nunca por substring: um alias curto como
 * "oi" ou "tim" acharia dezenas de falsos positivos dentro de outras palavras, e o logo
 * errado ao lado de um lançamento de dinheiro é pior do que logo nenhum. Marcas com nome
 * mais específico ganham do genérico ("Smart Fit" antes de "Academia") porque a lista é
 * varrida na ordem do catálogo e os genéricos ficam no fim.
 */
export function findSubscriptionService(description: string): SubscriptionService | null {
  const tokens = tokenize(description);
  if (tokens.length === 0) return null;

  return (
    subscriptionServices.find((service) =>
      labelsOf(service).some((label) => containsSequence(tokens, tokenize(label)))
    ) ?? null
  );
}

/**
 * Quão bem o serviço casa com o que foi digitado. Menor é melhor; `null` = não casa.
 *
 * O ranking existe porque substring pura produz lixo: digitar "lu" casa "plus" no meio de
 * "Disney+" e "Paramount+" e empurra "Luz" — o que a pessoa queria — pra fora do limite.
 * Prefixo do rótulo ganha de prefixo de palavra, que ganha de substring solta.
 */
function matchScore(service: SubscriptionService, normalizedQuery: string) {
  let best: number | null = null;

  for (const label of labelsOf(service)) {
    const normalizedLabel = normalizeServiceQuery(label);
    if (!normalizedLabel.includes(normalizedQuery)) continue;

    const score = normalizedLabel.startsWith(normalizedQuery)
      ? 0
      : tokenize(label).some((token) => token.startsWith(normalizedQuery))
        ? 1
        : 2;

    if (best === null || score < best) best = score;
  }

  return best;
}

/**
 * Sugestões enquanto a pessoa digita. Frouxa de propósito (substring), porque quem digita
 * "net" está procurando, não lançando — e a escolha aqui é sempre explícita, ao contrário
 * de `findSubscriptionService`, que reconhece sozinho e por isso é estrito.
 */
export function searchSubscriptionServices(query: string, limit = 6) {
  const normalized = normalizeServiceQuery(query);

  if (!normalized) {
    return featuredIds
      .map((id) => subscriptionServices.find((service) => service.id === id))
      .filter((service): service is SubscriptionService => Boolean(service))
      .slice(0, limit);
  }

  return subscriptionServices
    .map((service) => ({ service, score: matchScore(service, normalized) }))
    .filter((entry): entry is { service: SubscriptionService; score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score)
    .slice(0, limit)
    .map((entry) => entry.service);
}
