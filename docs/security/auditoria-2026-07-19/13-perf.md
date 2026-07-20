# Auditoria de Performance — 2026-07-19

> Report-only. Nenhuma correcao foi feita.

---

## PERF-1

**Titulo:** Zero code splitting — bundle unico carrega o app inteiro na primeira visita
**Severidade:** Critica
**Local:** `src/App.tsx` (rotas), `src/main.tsx`
**Descricao:** Nao ha uma unica ocorrencia de `React.lazy()` ou `<Suspense>` em todo o codigo fonte. `src/App.tsx` faz import estatico de todas as 25+ paginas/componentes de rota (Dashboard, Transactions, Cards, Invoice, Goals, Assistant, Admin, Settings, Landing, etc.), incluindo paginas pesadas como `SearchPage` (recharts), `AssistantPage` (firebase/functions), `AdminPage` e `InvoicePage`. Isso significa que o mesmo bundle JS contem tanto a landing page (que um visitante nao logado ve) quanto o app inteiro logado com recharts, framer-motion, e todas as paginas de configuracao.
**Impacto:** O bundle inicial ultrapassa 500 kB (ja documentado em `docs/planning/TODOS.md` como pendencia). Visitantes da landing page baixam o app inteiro sem necessidade. Usuarios logados pagam o custo de paginas que talvez nunca visitem (Admin, Assistente, Compartilhado).
**Solucao sugerida:** Aplicar `React.lazy(() => import('./pages/SearchPage'))` em todas as rotas do app logado, com `<Suspense fallback={...}>` no `AppShell`. A landing (`LandingCss`) e paginas publicas (Login, Register, ForgotPassword) devem ficar num chunk separado, sem carregar o bundle do app logado. Prioridade: `SearchPage` (recharts ~500 kB), `AssistantPage` (firebase/functions), `AdminPage`, `InvoicePage`, paginas de goals/detalhes.
**Confianca:** 10

---

## PERF-2

**Titulo:** `recharts` (~500 kB) e importado estaticamente e vai para o bundle principal
**Severidade:** Alta
**Local:** `src/pages/SearchPage.tsx`, `src/components/AnnualSummarySheet.tsx`, `src/pages/NetWorthPage.tsx`
**Descricao:** recharts e um dos maiores pacotes do projeto (~500 kB minified). Tres arquivos o importam estaticamente de `'recharts'` com imports nomeados (`PieChart`, `BarChart`, `LineChart`, `ResponsiveContainer`, etc.). Como nao ha code splitting de rotas, recharts termina no bundle principal, carregado por todos os usuarios, inclusive os que nunca abriram a pagina de Analise.
**Impacto:** Aproximadamente ~500 kB no bundle principal desnecessariamente para usuarios que nunca acessam Analise (ou patrimonio liquido, desativado mas ainda importado). A primeira tela (Dashboard) nao usa recharts, mas paga por ele.
**Solucao sugerida:** Code splitting na rota `/app/search` com `React.lazy()`. O `AnnualSummarySheet` e referenciado por `SearchPage`, entao estara no mesmo chunk lazy. O `NetWorthPage` esta desativado mas ainda importado; se mantido desativado, o import pode ser removido.
**Confianca:** 10

---

## PERF-3

**Titulo:** `framer-motion` incluso no bundle mesmo para usuarios que nunca veem a landing page
**Severidade:** Alta
**Local:** `src/landing/LandingCss.tsx`, `src/landing/LandingSections.tsx`
**Descricao:** `framer-motion` e importado exclusivamente na landing page (`LandingCss.tsx` usa `useMotionValue`, `useSpring`, `useTransform`, `useScroll`, `useReducedValue`; `LandingSections.tsx` usa `motion` e `useInView`). Como nao ha code splitting, o usuario logado que abre `/app/dashboard` carrega framer-motion inteiro mesmo sem nunca ter visto a landing. O mesmo vale para o CSS especifico da landing (`landing.css`, 783 linhas / ~26 kB) que e importado por `LandingShell.tsx` mas agregado ao bundle principal por ser rota filha de `App.tsx`.
**Impacto:** Usuarios do app logado baixam framer-motion (estimativa ~30-40 kB min+gzip) e ~26 kB de CSS de marketing sem utilizar. O efeito e amplificado porque framer-motion nao e pequeno e tem zero arvore de importacao compartilhada com o app logado.
**Solucao sugerida:** Code splitting na rota raiz `/` (landing) separado do bundle do app `/app/*`. O bundle da landing deve conter apenas `LandingShell`, `LandingCss`, `LandingSections`, `AppMockup`, framer-motion e `landing.css`. O bundle do app logado nao deve incluir framer-motion nem `landing.css`.
**Confianca:** 10

---

## PERF-4

**Titulo:** Assets de marca legados ("Zerou" e "Granix") ocupam 3,5 MB em `public/brand/` sem serem referenciados
**Severidade:** Media
**Local:** `public/brand/`
**Descricao:** O diretorio `public/brand/` contem ~5,7 MB de PNGs. Destes, aproximadamente 3,5 MB sao de assets antigos que nao sao mais referenciados por nenhum arquivo do codigo: todos os arquivos com prefixo `zerou-*` (~2,7 MB: `zerou-logo-negative.png` 1,2 MB, `zerou-logo-primary.png` 350 kB, `zerou-symbol.png` 328 kB, `zerou-symbol-reduced.png` 217 kB, etc.) e os com prefixo `granix-*` (~775 kB: `granix-logo-horizontal.png` 775 kB). Apenas os assets `granativa-*` sao efetivamente usados (aproximadamente 2,2 MB). Estes arquivos sao copiados para o diretorio de deploy pelo Vite e servidos como assets estaticos, aumentando o tamanho total do deploy sem necessidade.
**Impacto:** ~3,5 MB de dados desnecessarios no deploy. Afeta tempo de deploy, armazenamento CDN e, marginalmente, usuarios em redes lentas que acessam URLs desses assets (embora a maioria nunca seja requisitada).
**Solucao sugerida:** Remover os arquivos `public/brand/zerou-*` e `public/brand/granix-*` (exceto `granix-symbol.png` 652 kB se usado em algum lugar — verificar). Manter apenas os assets `granativa-*` que estao em uso.
**Confianca:** 9

---

## PERF-5

**Titulo:** `favicon.png` tem 767 kB — ordens de grandeza acima do recomendado
**Severidade:** Alta
**Local:** `public/favicon.png`
**Descricao:** O arquivo `public/favicon.png` tem 767 kB. Um favicon tipico tem 1-15 kB (32x32 ou 64x64 px). Este arquivo parece ser uma imagem grande (provavelmente o simbolo da marca em alta resolucao) que nao deveria estar sendo usada como favicon. Favicons sao carregados em toda navegacao para a pagina, mesmo sem interacao do usuario, e um arquivo de 767 kB adiciona ~700 kB de latencia desnecessaria, especialmente em redes moveis.
**Impacto:** 767 kB de transferencia desnecessaria em cada visita ao site. Afeta TTFB percebido e First Paint para usuarios com conexao lenta.
**Solucao sugerida:** Substituir `favicon.png` por um PNG comprimido de 32x32 ou 64x64 px, ou usar um `.ico`. O `favicon.ico` (que existe em paralelo) ja deve ser o correto; verificar qual e servido e se o PNG e realmente necessario.
**Confianca:** 8

---

## PERF-6

**Titulo:** Assets da marca em PNG nao otimizados — poderiam ser WebP com reducao de ~50-80%
**Severidade:** Baixa
**Local:** `public/brand/granativa-logo-horizontal.png` (113 kB), `public/brand/granativa-logo-primary.png` (56 kB), etc.
**Descricao:** Todos os logos da marca sao PNG. Embora a qualidade visual seja boa, PNG e significativamente maior que WebP para o mesmo nivel de qualidade perceptivel. O `granativa-logo-horizontal.png` de 113 kB poderia ser ~20-40 kB como WebP. Navegadores modernos (incluindo todos que o Granativa suporta) aceitam WebP. O mesmo vale para `granativa-symbol.png` (652 kB — extremamente grande para um simbolo).
**Impacto:** ~50-80% de bytes extras nos assets de marca. Impacto moderado: logos sao carregados uma vez e cacheados, mas em conexoes lentas a primeira visita paga o custo.
**Solucao sugerida:** Converter todos os PNGs de marca para WebP. O `granativa-symbol.png` de 652 kB merece atencao especial — possivelmente e um arquivo de origem (nao otimizado para web) que deveria ser substituido por uma versao comprimida.
**Confianca:** 7

---

## PERF-7

**Titulo:** Vercel sem headers de cache para assets estaticos com hash (JS/CSS)
**Severidade:** Media
**Local:** `vercel.json`
**Descricao:** O `vercel.json` define headers apenas para `sw.js`, `workbox-*.js` (no-cache) e regras de CSP. Nao ha headers `Cache-Control` para assets estaticos com fingerprint (arquivos JS/CSS em `dist/assets/*` com hash no nome). Sem `Cache-Control: public, max-age=31536000, immutable` nos arquivos com hash, o CDN e o navegador podem revalidar cada asset em cada visita, adicionando RTT desnecessarios.
**Impacto:** Assets com hash que nunca mudam sao revalidados com o servidor (304s) em cada visita, adicionando latencia de rede. O CDN Vercel pode servir sem headers explicitos, mas a configuracao ideal nao esta declarada.
**Solucao sugerida:** Adicionar em `vercel.json` uma regra para assets com hash:
```json
{
  "source": "/assets/(.*).[a-f0-9]{8,}.(js|css|png|jpg|webp|svg)",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
  ]
}
```
**Confianca:** 10

---

## PERF-8

**Titulo:** Sete listeners Firestore montados simultaneamente no boot do app logado
**Severidade:** Informativa
**Local:** `src/finance/useFinanceData.ts` (linhas 258-272), `src/shared/useSharedWorkspaceData.ts`
**Descricao:** No boot do app logado, `useFinanceData` monta 7 `onSnapshot` listeners em paralelo: `accounts`, `categories`, `transactions`, `bills`, `receivables`, `recurringRules`, `budgets`. Alem disso, se o usuario tem espaco do casal, `useSharedWorkspaceData` monta mais ate 5 listeners. Cada listener faz uma leitura inicial (mesmo que do cache IndexedDB). O total de leituras no boot frio pode chegar a ~12-15 colecoes, mas cada uma e limitada (`transactions` limit(300), `bills` limit, etc.) ou e naturalmente pequena (`accounts`, `budgets`).
**Impacto:** Dentro do esperado para um app offline-first. O custo esta mapeado em `docs/COSTS.md` (~200 leituras/dia por usuario ativo). Nao e um problema hoje (~250 usuarios cabem no gratuito), mas vale monitorar.
**Solucao sugerida:** Nenhuma agora. Quando o numero de usuarios crescer, considerar carregar colecoes menos usadas (`budgets`, `recurringRules`) sob demanda em vez de no boot.
**Confianca:** 10

---

## PERF-9

**Titulo:** `useInView` e animacoes framer-motion na landing podem causar CLS em dispositivos lentos
**Severidade:** Baixa
**Local:** `src/landing/LandingCss.tsx`, `src/landing/LandingSections.tsx`
**Descricao:** A landing page usa animacoes framer-motion com `initial={{ opacity: 0, y: 28/36/60 }}` e `animate` para revelar secoes. Em dispositivos lentos ou com CPU limitada, o calculo de scroll, parallax e tilt (hero) pode causar jank (quadros perdidos). O `useReducedMotion` e respeitado (`reduceMotion ? {} : { y: [0, -10, 0] }`), o que e um ponto positivo. As secoes da pagina usam `useInView(ref, { once: true })`, que dispara uma vez e congela — isso e bom para performance. No entanto, o parallax do hero com `useScroll` e `useTransform` roda continuamente enquanto o usuario interage com a pagina.
**Impacto:** Potencial jank em dispositivos de baixa renda (Moto G, Galaxy A系列) durante o scroll inicial. CLS e mitigado pelo `opacity: 0` inicial (itens sao invisiveis ate animar), entao nao ha layout shift, mas ha atraso na apresentacao do conteudo.
**Solucao sugerida:** Nao mudar — o comportamento e intencional para impacto visual. Se metricas reais de CLS/INP mostrarem problemas, considerar desativar parallax do hero e animacoes de entrada em dispositivos de baixa performance ale do `prefers-reduced-motion`.
**Confianca:** 5

---

## PERF-10

**Titulo:** Bundle PWA inclui todos os assets estaticos no precache (~6 MB+ de PNGs de marca)
**Severidade:** Baixa
**Local:** `vite.config.ts` (workbox.globPatterns)
**Descricao:** O `globPatterns` do Workbox e configurado como `['**/*.{js,css,html,ico,png,svg,webmanifest,jpg,jpeg,webp}']`. Isso significa que todos os PNGs em `public/`, inclusive os ~3,5 MB de assets legados (Zerou/Granix, ver PERF-4) e o `favicon.png` de 767 kB (ver PERF-5), serao precacheados pelo service worker na instalacao do PWA. Alem disso, a configuracao nao tem `maximumFileSizeToCacheInBytes`, entao arquivos de qualquer tamanho serao tentados.
**Impacto:** A instalacao do PWA em dispositivos moveis pode falhar ou demorar muito se os arquivos precacheados excederem limites de armazenamento do navegador (tipicamente ~50 MB, mas a instalacao pode falhar se exceder muito). O tempo de instalacao do service worker e maior.
**Solucao sugerida:** (1) Remover assets legados (PERF-4). (2) Otimizar `favicon.png` (PERF-5). (3) Considerar adicionar `maximumFileSizeToCacheInBytes: 2 * 1024 * 1024` (2 MB) para evitar precache de acidentalmente arquivos muito grandes. (4) `includeAssets` ja lista explicitamente alguns assets — otimo, mas o globPatterns e mais amplo.
**Confianca:** 7

---

## PERF-11

**Titulo:** Imagens na landing (mockup do app, logos) nao tem atributos `width`/`height` explicitos
**Severidade:** Media
**Local:** `src/landing/LandingShell.tsx` (logo no header e footer), `src/landing/AppMockup.tsx` (mockup do phone)
**Descricao:** As imagens no header e footer da landing (`<img src="/brand/granativa-logo-horizontal.png" height={28} ... />`) tem `height` mas nao `width`. O mockup do phone em `AppMockup.tsx` e CSS-only (nativo), entao nao e um problema de imagem, mas o logo sem `width` pode causar recalculo de layout se o tamanho intrinseco da imagem for diferente do esperado pelo CSS.
**Impacto:** Potencial CLS se a imagem demorar a carregar e o `height` especificado nao corresponder `aspect-ratio` do PNG. Baixo, porque o logo e servido pelo CDN e geralmente rapido, mas e uma boa pratica.
**Solucao sugerida:** Adicionar `width` correspondente ao `height` para manter aspect ratio. Exemplo: `<img src="..." alt="Granativa" height={28} width={112} />` (ou o ratio exato do PNG).
**Confianca:** 6

---

## PERF-12

**Titulo:** Rotas de paginas publicas (Features, Security, Help, Contact, Privacy, Legal) sao importadas estaticamente mas sao de baixo trafego
**Severidade:** Baixa
**Local:** `src/App.tsx` (linhas 33-34)
**Descricao:** As paginas publicas (`FeaturesPage`, `SecurityPage`, `HelpPage`, `ContactPage`, `PrivacyCenterPage`, `TermsPage`, `PrivacyPolicyPage`, `DataDeletionPage`) sao importadas estaticamente e fazem parte do bundle principal. Embora essas paginas sejam de baixo trafego comparado a landing e ao app, cada uma adiciona alguns kB ao bundle inicial.
**Impacto:** Baixo. Essas paginas sao leves (componentes simples com texto) e cada uma contribui com talvez 1-3 kB. Nao sao o gargalo.
**Solucao sugerida:** Podem ser lazy-loading com `React.lazy()` quando code splitting for implementado (PERF-1), mas nao sao prioridade.
**Confianca:** 7

---

## Resumo

| ID | Titulo | Severidade | Confianca |
|---|---|---|---|
| PERF-1 | Zero code splitting | Critica | 10 |
| PERF-2 | recharts no bundle principal | Alta | 10 |
| PERF-3 | framer-motion incluso no bundle logado | Alta | 10 |
| PERF-5 | favicon.png de 767 kB | Alta | 8 |
| PERF-4 | Assets legados Zerou/Granix em public/brand/ | Media | 9 |
| PERF-7 | Sem cache headers para hashed assets no Vercel | Media | 10 |
| PERF-11 | Imagens da landing sem width explicito | Media | 6 |
| PERF-6 | PNGs nao otimizados (poderiam ser WebP) | Baixa | 7 |
| PERF-9 | Animacoes framer-motion podem causar jank | Baixa | 5 |
| PERF-10 | PWA precache de PNGs grandes e legados | Baixa | 7 |
| PERF-12 | Paginas publicas estaticas no bundle principal | Baixa | 7 |
| PERF-8 | Sete listeners Firestore no boot | Informativa | 10 |

**Achado principal:** A ausencia de code splitting e o problema mais grave. O bundle JS inicial inclui a landing page, o app logado completo com recharts e framer-motion. Um visitante nao logado baixa recharts, framer-motion, a pagina de Analise, Admin, Assistente e todas as paginas de configuracao — nada disso e necessario ate que o usuario faca login e navegue ate essas paginas.

**Pontos fortes ja existentes:**
- Firebase imports sao modulares (v9+), sem compat — bom.
- `lucide-react` usa imports individuais, sem barrel — otimo.
- `date-fns` usa funcoes individuais — otimo.
- Analytics e lazy-loaded com `await import('firebase/analytics')` — correto.
- Fontes usam `preload` com `onload` trick e `display=swap` — boa pratica.
- Preconnect para Google Fonts — correto.
- PWA tem caching para Google Fonts (CacheFirst, 1 ano) — otimo.
- Modo escuro e aplicado via script inline no `<head>` (sem flash de tema incorreto) — boa pratica.
- `useReducedMotion` respeitado na landing — boa pratica de acessibilidade.
- Firestore SDK usa `persistentLocalCache` com `persistentMultipleTabManager` — otimo para offline.
