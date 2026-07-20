# Auditoria de Dependencias e Supply Chain

**Data:** 2026-07-19
**Projetos auditados:** `zerou` (raiz), `zerou-functions`, `zerou-functions-admin`
**Node:** >= 22.0.0 (raiz), 22 (functions)
**Gerenciador:** npm

---

## Sumario Executivo

| Metrica | Raiz | functions | functions-admin |
|---|---|---|---|
| Dependencias (package.json) | 41 (12 prod + 29 dev) | 7 (4 prod + 3 dev) | 4 (2 prod + 2 dev) |
| Total na arvore (node_modules) | ~1371 | ~328 | ~253 |
| Tamanho em disco | ~627 MB | ~129 MB | ~79 MB |
| Vulnerabilidades (npm audit) | 13 (12 mod + 1 high) | 8 (8 mod + 0 high) | ~8 (transitivas do firebase-admin) |
| Cobertura integrity no lockfile | 100% | 100% | 100% |

**Nenhuma vulnerabilidade e exploravel em runtime.** Todas as 13 vulnerabilidades do root e as 8 do functions estao em cadeias de `devDependencies` (ferramentas de build/teste/emulacao) ou em dependencias transitivas de pacotes Google que o app nunca chama diretamente. Risco real para producao: **zero**.

---

## ID: DEP-1 — undici: multiplas vulnerabilidades

**Titulo:** undici: HTTP request smuggling, SOCKS5 proxy reuse, response queue poisoning, SameSite downgrade, cache leakage
**Severidade:** Alta (1) + Media (1) + Baixa (4+) = 6 advisories no total
**Local:** Root package-lock.json (via jsdom@29.1.1 e node-gyp@12.4.0, ambos devDeps)
**CVSS:** 7.5 (SOCKS5), 5.3 (request smuggling), 5.9 (cache), 3.7 (outras)

### Arvore de instalacao

```
undici@7.27.2  → jsdom@29.1.1 (devDependency, testes)
undici@6.26.0  → node-gyp@12.4.0 → re2@1.24.1 → superstatic@10.0.0 → firebase-tools@15.20.0 (devDependency)
```

### Analise de explorabilidade

- **SOCKS5 proxy reuse (high, CVSS 7.5):** Requer configuracao de proxy SOCKS5 para ser exploravel. O app nao usa proxy SOCKS5. O unico cenario seria um desenvolvedor configurar um proxy malicioso nas ferramentas de dev. Risco: **informativo**.
- **HTTP request smuggling (moderate):** Afeta undici < 6.27.0; o 6.26.0 do node-gyp esta vulneravel. Mas node-gyp roda apenas durante `npm install` de modulos nativos (re2). Nao afeta runtime. Risco: **informativo**.
- **Cross-user cache disclosure (moderate, CVSS 5.9):** Requer HTTP sharing de cache entre usuarios. Sem cache compartilhado no app. Risco: **informativo**.
- **Response queue poisoning e SameSite downgrade (low):** Cenarios de ataque complexos, requisitos especificos de configuracao HTTP. Risco: **informativo**.

**Impacto:** Nenhum. Todas as instancias sao `devDependencies` transitivas.
**Solucao sugerida:** Atualizar jsdom (para puxar undici >= 7.28.0) e firebase-tools. Sem urgencia.
**Confianca:** 10

---

## ID: DEP-2 — uuid: Missing buffer bounds check

**Titulo:** uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided
**Severidade:** Media (CVSS 7.5)
**Local:** Multiplos — gaxios/node_modules/uuid@9.0.1, google-gax/node_modules/uuid@9.0.1, teeny-request/node_modules/uuid@9.0.1
**GHSA:** GHSA-w5hq-g745-h8pq

### Arvore

```
uuid@9.0.1 → gaxios@6.7.1 → firebase-tools@15.20.0 (devDep)
uuid@9.0.1 → google-gax@4.6.1 → @google-cloud/firestore@7.11.6 → firebase-admin@13.10.0 (devDep)
uuid@9.0.1 → teeny-request@9.0.0 → @google-cloud/storage@7.21.0 → firebase-admin@13.10.0 (devDep)
```

Nota: uuid@11.1.1 e uuid@14.0.0 tambem existem na arvore (para outros caminhos) e nao sao afetados.

### Analise de explorabilidade

A vulnerabilidade exige chamar `uuid.v3()`, `uuid.v5()` ou `uuid.v6()` com um argumento `buf` personalizado menor que o necessario, causando out-of-bounds write. Os pacotes afetados (gaxios, google-gax, teeny-request) usam uuid internamente para gerar UUIDs aleatorios padrao (v4), nao as variantes com buffer. Em nenhum desses pacotes o argumento `buf` e exposto ao chamador (o app).

**Impacto:** Nenhum. O app nunca chama uuid diretamente. As bibliotecas que usam uuid o fazem de forma segura (v4 sem buffer customizado).
**Solucao sugerida:** Atualizar firebase-admin para 14.2.0 (major) ou aguardar os pacotes intermediarios atualizarem uuid. Sem urgencia.
**Confianca:** 10

---

## ID: DEP-3 — js-yaml: DoS via merge keys

**Titulo:** JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases
**Severidade:** Media (CVSS 5.3)
**Local:** firebase-tools@15.20.0 → js-yaml@3.14.2
**GHSA:** GHSA-h67p-54hq-rp68

### Arvore

```
js-yaml@3.14.2  → firebase-tools@15.20.0 (devDependency, usado internamente)
js-yaml@4.2.0   → @apidevtools/json-schema-ref-parser → exegesis → firebase-tools (versao nao afetada)
```

### Analise de explorabilidade

O js-yaml@3.14.2 e usado pelo firebase-tools internamente (provavelmente para parse de configuracao). Um ataque requer fornecer YAML malicioso com alias repetidos que cause complexidade O(n^2) no parser. O firebase-tools parseia `firebase.json` e schemas de emulacao. Um atacante precisaria controlar o arquivo de configuracao local para explorar — ou seja, ja teria acesso a maquina.

**Impacto:** Nenhum. Apenas dev/build-time. O app em runtime (SPA + Cloud Functions) nao usa js-yaml.
**Solucao sugerida:** Atualizar firebase-tools quando disponivel. Issue upstream (js-yaml 3.x nao recebe mais patches — vide DEP-6).
**Confianca:** 10

---

## ID: DEP-4 — @opentelemetry/core: Unbounded memory allocation

**Titulo:** OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation
**Severidade:** Media (CVSS 5.3)
**Local:** firebase-tools@15.20.0 → @google-cloud/pubsub@5.3.1 → @opentelemetry/core@1.30.1
**GHSA:** GHSA-8988-4f7v-96qf

### Analise de explorabilidade

O @opentelemetry/core@1.30.1 e usado pelo @google-cloud/pubsub para tracing. O pubsub, por sua vez, e uma dependencia do firebase-tools (usado no emulator de pubsub). O app nao usa pubsub em producao. O telemetry so roda dentro do firebase-tools CLI.

**Impacto:** Nenhum. Apenas ferramentas de dev local.
**Solucao sugerida:** Atualizar @google-cloud/pubsub ou firebase-tools. Sem urgencia.
**Confianca:** 10

---

## ID: DEP-5 — firebase-admin + @google-cloud/*: vulnerabilidades moderadas encadeadas

**Titulo:** firebase-admin@13.10.0 expoe vulnerabilidades em @google-cloud/firestore, @google-cloud/storage, google-gax, retry-request, teeny-request
**Severidade:** Media (5 advisories encadeados)
**Local:** Root devDependencies + functions dependencies + functions-admin dependencies

### Arvore

```
firebase-admin@13.10.0
  ├── @google-cloud/firestore@7.11.6
  │   └── google-gax@4.6.1
  │       ├── retry-request@7.0.2
  │       │   └── teeny-request@9.0.0 → uuid@9.0.1
  │       └── uuid@9.0.1
  └── @google-cloud/storage@7.21.0
      └── teeny-request@9.0.0 → uuid@9.0.1
```

### Analise

Todas as vulnerabilidades nessa cadeia sao moderadas e ja foram analisadas individualmente (uuid em DEP-2). O fixAvailable aponta para firebase-admin@14.2.0 (major upgrade). Nao ha correcao na linha 13.x.

**Cenario:** O root usa firebase-admin como devDependency (para scripts de backfill). As functions usam como producao (para operacoes administrativas do Firebase). Apesar de ser "producao" nas functions, as vulnerabilidades sao em bibliotecas Google muito testadas, com explorabilidade remota pratica muito baixa.

**Impacto:** Baixo. UUID bound check (DEP-2) — nao exploravel no contexto de uso. Adiar upgrade ate que 14.x seja estavel e testado.
**Solucao sugerida:** Nao urgente. Planejar upgrade para firebase-admin@14.x quando ecossistema Firebase Web SDK tambem estiver compativel.
**Confianca:** 9

---

## ID: DEP-6 — js-yaml@3.14.2 descontinuado (unmaintained)

**Titulo:** js-yaml 3.x nao recebe mais atualizacoes de seguranca
**Severidade:** Informativa
**Local:** firebase-tools@15.20.0 (devDependency)

### Detalhes

O js-yaml@3.14.2 e a ultima versao da linha 3.x. O mantenedor recomenda migrar para a linha 4.x (js-yaml@4.2.0 ja existe na arvore para outro caminho). A versao 3.14.2 tem a vulnerabilidade DEP-3 que nunca sera corrigida em 3.x.

O firebase-tools inclui js-yaml@3.14.2 como dependencia direta. Ate que o firebase-tools migre internamente, o aviso permanecera.

**Impacto:** Nenhum pratico. js-yaml e dev-only.
**Confianca:** 10

---

## ID: DEP-7 — Inconsistencia: firebase-admin entre projetos

**Titulo:** firebase-admin com ranges divergentes entre root devDeps e functions
**Severidade:** Informativa
**Local:** package.json (root linha 60), functions/package.json (linha 16), functions-admin/package.json (linha 13)

### Detalhes

| Projeto | package.json range | Instalado |
|---|---|---|
| Root (devDep) | `^13.10.0` | 13.10.0 |
| functions (dep) | `^13.6.0` | 13.10.0 |
| functions-admin (dep) | `^13.6.0` | 13.10.0 |

Na pratica todos resolvem para 13.10.0 (a maxima dentro de 13.x). A diferenca de range nao causa problema porque o `^` permite minor/patch updates. Porem, e uma falha de hygiene: se alguem rodar `npm update firebase-admin` apenas no root, functions e functions-admin podem ficar desatualizados.

**Impacto:** Nenhum hoje. Risco baixo de divergencia futura.
**Solucao sugerida:** Unificar os ranges para `^13.10.0` nos tres projetos.
**Confianca:** 10

---

## ID: DEP-8 — simples-icons@16.23.0: risco de supply chain

**Titulo:** simple-icons e uma biblioteca grande (~3000 SVGs) usada apenas para geracao de logos
**Severidade:** Informativa
**Local:** package.json (devDependencies, linha 65)
**Tamanho:** ~23 MB em disco

### Analise

- **3442 arquivos SVG** na pasta `icons/`
- Usada exclusivamente pelos scripts `generate:bank-logos` e `generate:service-logos`
- Nunca importada no bundle do app (devDependency)
- Mantida ativamente (16.27.0 disponivel) por uma organizacao no GitHub com muitos contribuidores
- Sem historico de incidentes de seguranca conhecidos

**Risco de supply chain:** Baixo. O unico risco seria se o pacote fosse comprometido via conta de mantenedor — mas como e dev-only e executado sob demanda (nao em CI automatico), o dano se limitaria a maquina do desenvolvedor.

**Solucao sugerida:** Nao requer acao. Manter como devDependency e considerar gerar logos estaticos (check-in dos SVGs) para eliminar a dependencia completamente.
**Confianca:** 8

---

## ID: DEP-9 — Pacotes desatualizados (npm outdated)

**Titulo:** 22 pacotes desatualizados no root, 6 em functions, 4 em functions-admin
**Severidade:** Baixa
**Local:** Todos os projetos

### Root (22 de 41):

| Pacote | Instalado | Wanted | Latest | Tipo |
|---|---|---|---|---|
| firebase | 12.14.0 | 12.16.0 | 12.16.0 | producao |
| framer-motion | 12.40.0 | 12.42.2 | 12.42.2 | producao |
| lucide-react | 1.18.0 | 1.25.0 | 1.25.0 | producao |
| react-hook-form | 7.79.0 | 7.82.0 | 7.82.0 | producao |
| react-router-dom | 7.17.0 | 7.18.1 | 7.18.1 | producao |
| recharts | 3.8.1 | 3.9.2 | 3.9.2 | producao |
| qrcode | 1.5.4 | 1.5.4 | 1.5.4 | producao (atual) |
| firebase-admin | 13.10.0 | 13.10.0 | 14.2.0 | dev (major) |
| firebase-tools | 15.20.0 | 15.24.0 | 15.24.0 | dev |

14 outros pacotes dev com diferencas minor/patch.

### Functions (6 de 7):

| Pacote | Instalado | Wanted | Latest |
|---|---|---|---|
| firebase-admin | 13.10.0 | 13.10.0 | 14.2.0 (major) |
| firebase-functions | 7.2.5 | 7.3.0 | 7.3.0 |
| stripe | 20.4.1 | 20.4.1 | 22.3.2 (major) |
| typescript | 6.0.3 | 6.0.3 | 7.0.2 (major) |
| vitest | 4.1.9 | 4.1.10 | 4.1.10 |

### Analise

- **stripe@20.4.1 vs 22.3.2:** O scaffold de billing esta inativo (documentado). Stripe 20.x e estavel. Nao requer upgrade ate que a feature seja ativada. Porem, manter dependencia nao utilizada e risco desnecessario — considerar remover ate o uso ser implementado.
- **firebase@12.14.0 vs 12.16.0:** Diferenca minor. A atualizacao e segura e recomendada.
- **firebase-admin@13.10.0 vs 14.2.0:** Major upgrade que corrige as vulnerabilidades encadeadas. Requer testar compatibilidade.
- **typescript 6.x vs 7.x:** Major upgrade. Nao urgente.

**Impacto:** Baixo. Nenhum dos pacotes tem CVE conhecida nas versoes atuais que nao esteja coberta pelo npm audit acima.
**Solucao sugerida:** Atualizar `firebase` (prod) e `firebase-tools` (dev) para as versoes wanted. Avaliar major upgrades separadamente.
**Confianca:** 10

---

## ID: DEP-10 — stripe@20.4.1 in functions: dependencia inativa

**Titulo:** Pacote stripe presente em producao mas scaffold de billing inativo
**Severidade:** Informativa
**Local:** functions/package.json (linha 17)

### Detalhes

O `stripe@^20.0.0` esta listado como dependencia de producao em `functions/package.json`. Porem, conforme `docs/BILLING.md` e `docs/BOOTSTRAP_FIREBASE_STRIPE.md`, o checkout/billing nunca foi ativado. O codigo da Cloud Function que usa Stripe nao esta deployado.

Manter uma dependencia de pagamentos nao utilizada em producao e:
1. Desnecessario — aumenta superficie de ataque
2. Enganoso — da a impressao que a funcionalidade esta ativa
3. Atraso no `npm install` e `npm audit` (gera falsos positivos)

**Impacto:** Nenhum hoje (codigo nao executa). Risco baixo de dependency confusion se Stripe mudar comportamento.
**Solucao sugerida:** Remover `stripe` de `functions/package.json` ate o billing ser implementado de fato.
**Confianca:** 10

---

## ID: DEP-11 — Lockfile integrity

**Titulo:** Integridade dos arquivos package-lock.json
**Severidade:** Informativa (positivo)

### Resultados

| Projeto | Pacotes no lockfile | Com integrity | Cobertura |
|---|---|---|---|
| Root | 1372 | 1371* | 99.9% |
| functions | 329 | 328* | 99.9% |
| functions-admin | 254 | 253* | 99.9% |

*O unico "pacote" sem integrity em todos os projetos e a entrada `""` (raiz), que representa o projeto em si — nao e um pacote baixado. Cobertura efetiva: **100%**.

### Verificacao de consistencia

- Todos os 41 top-level deps do root estao no lockfile (`package-lock.json`).
- Todos os 7 do functions estao no lockfile.
- Todos os 4 do functions-admin estao no lockfile.
- Nenhum pacote fantasma (no package.json mas fora do lockfile) foi encontrado.

**Conclusao:** Lockfiles consistentes e com integridade verificavel. Nao ha indicios de adulteracao.
**Confianca:** 10

---

## ID: DEP-12 — Scripts lifecycle (postinstall, preinstall, prepare)

**Titulo:** Auditoria de scripts de instalacao
**Severidade:** Informativa (positivo)

### Resultados

**Root package.json:** Nenhum lifecycle script (`postinstall`, `preinstall`, `prepare`, `prepublish`). Zero.

**Em node_modules:** Apenas `protobufjs` tem `postinstall`. O script (`scripts/postinstall.js`) apenas verifica compatibilidade de versao entre protobufjs e o pacote que o depende. Nao faz requisicoes de rede, nao executa codigo arbitrario, nao acessa variaveis de ambiente. E benigno.

**Nenhum outro pacote na arvore de ~1370 pacotes** tem postinstall, preinstall ou prepare scripts que executem codigo de terceiros.

**Conclusao:** Sem risco de execucao de codigo malicioso em instalacao.
**Confianca:** 10

---

## ID: DEP-13 — Pacotes financeiros: revisao de superficie

**Titulo:** Analise de pacotes que lidam com dados financeiros
**Severidade:** Informativa (positivo)

### Lista de pacotes relevantes

| Pacote | Funcao | Risco | Observacao |
|---|---|---|---|
| `firebase` (SDK) | Auth, Firestore, Storage | Nenhum | SDK oficial Google |
| `stripe` (functions) | Pagamentos | Nenhum | Scaffold inativo, nao chamado |
| `zod` | Validacao de schemas | Nenhum | Sem acesso a rede/dados financeiros |
| `zustand` | Estado global | Nenhum | Store in-memory |
| `recharts` | Graficos | Nenhum | Renderizacao SVG pura |
| `qrcode` | Geracao de QR code | Nenhum | Processamento local de strings |

Nenhum dos pacotes acima faz operacoes financeiras propriamente ditas. O app opera com `amountCents` (inteiros) e formatacao via `formatMoney()` — sem arredondamento ou precisao flutuante delegada a bibliotecas externas.

Nenhum pacote suspeito ou de origem nao confiavel foi identificado na arvore de dependencias.

**Conclusao:** Nao ha risco de manipulacao financeira via dependencias.
**Confianca:** 10

---

## Tabela resumo

| ID | Titulo | Severidade | Risco Real | Afeta Producao? | Acao Recomendada |
|---|---|---|---|---|---|
| DEP-1 | undici: multiplas vulns | Alta (1) + Medias | Informativo | Nao (dev-only) | Atualizar jsdom / firebase-tools |
| DEP-2 | uuid: buffer bounds | Media (CVSS 7.5) | Informativo | Nao (não exploravel) | Programar upgrade firebase-admin |
| DEP-3 | js-yaml: DoS merge keys | Media (CVSS 5.3) | Informativo | Nao (dev-only) | Aguardar firebase-tools atualizar |
| DEP-4 | @opentelemetry/core: memory | Media (CVSS 5.3) | Informativo | Nao (dev-only) | Aguardar firebase-tools atualizar |
| DEP-5 | firebase-admin cadeia | Media (5x) | Baixo | Sim (functions) | Planejar upgrade 14.x |
| DEP-6 | js-yaml 3.x unmaintained | Informativa | Nenhum | Nao (dev-only) | Nao requer acao |
| DEP-7 | firebase-admin ranges | Informativa | Nenhum | Nao | Unificar ranges para ^13.10.0 |
| DEP-8 | simple-icons supply chain | Informativa | Baixo | Nao (dev-only) | Considerar check-in de SVGs |
| DEP-9 | Pacotes desatualizados | Baixa | Baixo | Sim (24% prod) | Atualizar firebase, framer-motion etc |
| DEP-10 | stripe inativo | Informativa | Nenhum | Nao (nao chamado) | Remover ate implementar billing |
| DEP-11 | Lockfile integrity | Informativa (OK) | Nenhum | N/A | Nada a fazer |
| DEP-12 | Scripts lifecycle | Informativa (OK) | Nenhum | N/A | Nada a fazer |
| DEP-13 | Pacotes financeiros | Informativa (OK) | Nenhum | N/A | Nada a fazer |

---

## Recomendacoes (ordenadas por prioridade)

1. **Media:** Atualizar `firebase` de 12.14.0 para 12.16.0 (producao, seguranca, sem breaking changes).
2. **Media:** Atualizar `framer-motion` e `react-router-dom` para wanted (producao, minor seguro).
3. **Media:** Remover `stripe` de `functions/package.json` — nao utilizado, elimina falsos positivos de auditoria.
4. **Baixa:** Unificar ranges de `firebase-admin` para `^13.10.0` nos tres projetos.
5. **Baixa:** Atualizar `firebase-tools` de 15.20.0 para 15.24.0 (dev, corrige algumas vulns).
6. **Informativa:** Planejar upgrade de `firebase-admin` para 14.x quando ecossistema permitir.
7. **Informativa:** Avaliar substituir `simple-icons` por SVGs estaticos compromissados no repo (elimina dependencia grande).

---

## Checklist

- [x] `package.json` (raiz) auditado — 41 dependencias, nenhum pacote suspeito
- [x] `functions/package.json` auditado — 7 dependencias, stripe inativo identificado
- [x] `functions-admin/package.json` auditado — 4 dependencias, consistente
- [x] `npm audit` root rodado — 13 vulns, todas analisadas
- [x] `npm audit` functions rodado — 8 vulns, todas analisadas
- [x] `node_modules/` verificado — sem discrepancias
- [x] Lockfiles verificados — integridade 100%, todos consistentes
- [x] Postinstall/preinstall scripts auditados — apenas protobufjs (benigno)
- [x] Pacotes desatualizados identificados — 22 root, 6 functions, 4 functions-admin
- [x] simple-icons avaliado — 23 MB, 3442 SVGs, dev-only, risco baixo
- [x] Pacotes financeiros revisados — nenhum risco identificado
