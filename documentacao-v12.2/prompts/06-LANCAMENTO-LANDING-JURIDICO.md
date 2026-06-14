# Instruções operacionais obrigatórias

Você está trabalhando no repositório do **Zerou**. Execute somente a fase descrita neste arquivo.

Leia antes de editar:

1. `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`;
2. `CONTRATOS-CANONICOS.md`;
3. `BRAND-GUIDELINES.md`;
4. `THEME-SYSTEM.md`;
5. `PRODUCT-COPY-CANONICAL.md`;
6. `IMPLEMENTATION_STATUS.md`;
7. arquivos existentes do repositório;
8. `00-BOOTSTRAP-MANUAL.md` quando houver dependência externa.

Regras:

- não antecipar funcionalidades de fases futuras;
- não fingir que criou recurso externo;
- não substituir funcionalidade por mock permanente;
- não remover comportamento previamente validado;
- manter TypeScript strict;
- persistir dinheiro como inteiros em centavos;
- nunca confiar em autorização, plano ou entitlement enviados pelo frontend;
- usar **Zerou** como nome exibido ao usuário e nunca reintroduzir o nome provisório anterior;
- seguir a identidade de `BRAND-GUIDELINES.md` em toda superfície visual criada nesta fase;
- seguir `THEME-SYSTEM.md`: não hardcodar cores em componentes da interface autenticada e consumir somente tokens semânticos;
- corrigir erros encontrados dentro do escopo atual;
- atualizar `IMPLEMENTATION_STATUS.md` ao final;
- parar ao concluir o gate desta fase.


# Fase 6 — Lançamento: landing estática, jurídico, privacidade e QA

## Pré-condição

Fases 1 a 5 concluídas ou bloqueios externos claramente documentados. Não mascarar falhas críticas de segurança, isolamento, ledger ou billing.

## Objetivo

Preparar o MVP para lançamento controlado: landing estática, páginas públicas, jurídico com placeholders, consentimentos, Privacy Center básico, documentação, acessibilidade, performance e QA acumulado.

## Escopo permitido

### Identidade pública obrigatória

Aplicar a identidade oficial definida em `BRAND-GUIDELINES.md` e `PRODUCT-COPY-CANONICAL.md` em landing, SEO, Open Graph, emails essenciais, páginas jurídicas e metadados. Usar `Zerou` como marca exibida, sem ocorrência pública do nome provisório anterior. A landing pública usa a identidade institucional da marca; não precisa herdar o tema escolhido dentro da área autenticada.

### Landing estática

Implementar rotas:

```text
/
/pricing
/features
/security
/help
/contact
```

Não usar Three.js, WebGL, React Three Fiber ou landing 3D no MVP.

Hero:

```text
Organize suas finanças.
Compartilhe o que faz sentido.

Controle sua vida financeira pessoal e do casal no mesmo app,
sem misturar o que deve permanecer privado.

[ Começar grátis ] [ Ver como funciona ]
```

Seções:

1. problema;
2. como funciona;
3. cartões e faturas parciais;
4. pessoal e compartilhado;
5. segurança sem promessas absolutas;
6. planos;
7. FAQ;
8. CTA final;
9. footer.

### SEO e performance

- titles e descriptions;
- Open Graph;
- sitemap;
- robots;
- canonical;
- landing indexável;
- app privado `noindex`;
- imagens AVIF/WebP quando aplicável;
- fontes otimizadas;
- JS inicial reduzido;
- navegação por teclado;
- contraste;
- reduced motion.

Metas:

```text
LCP <= 2,5s em mobile razoável
CLS <= 0,1
INP <= 200ms quando possível
```

### Jurídico

Implementar rotas:

```text
/legal/terms
/legal/privacy
/legal/cookies
/legal/subprocessors
```

Usar templates de `docs/legal/`.

Regras:

- placeholders permanecem visíveis até preenchimento;
- impedir marcação de pronto para produção enquanto houver placeholders obrigatórios;
- exibir aviso interno de revisão jurídica pendente;
- versionar textos;
- salvar aceite de termos e ciência da política;
- não afirmar revisão jurídica concluída sem validação humana.

### Cookie consent

Implementar:

- necessários sempre ativos;
- preferências;
- analytics opcionais;
- marketing opcional;
- aceitar;
- recusar com mesma relevância visual;
- revisar preferências;
- persistir versão da preferência;
- não carregar analytics não essencial antes de consentimento aplicável.

### Privacy Center básico

Implementar rota:

```text
/privacy-center
```

Permitir:

- corrigir perfil;
- baixar dados por solicitação;
- solicitar exclusão;
- gerenciar cookies;
- revogar marketing;
- remover cache local;
- sair de workspace casal;
- abrir solicitação LGPD.

Quando uma automação completa de exportação ou exclusão não estiver pronta, implementar solicitação rastreável server-side e documentação operacional real. Não criar botão decorativo.

### Email adapter mínimo

Preparar adapter para emails essenciais:

- boas-vindas;
- segurança;
- convite;
- cobrança falhou;
- cancelamento;
- solicitação LGPD.

Se provider não estiver configurado, registrar bloqueio explícito e não fingir envio.

### Operação mínima

Documentar:

```text
README.md
ARCHITECTURE.md
SECURITY.md
BILLING.md
PRIVACY.md
RUNBOOK.md
docs/MANUAL_SETUP_REQUIRED.md
docs/PRODUCTION_CHECKLIST.md
```

Incluir:

- deploy dev/prod;
- emuladores;
- rollback;
- reprocessamento de billing event por script controlado;
- alertas de custo;
- backup e restauração documentados;
- CSP e headers;
- incident response inicial;
- placeholders jurídicos pendentes;
- variáveis externas necessárias.

## Fora do escopo

Não implementar:

- landing 3D;
- admin completo;
- OCR;
- automações avançadas;
- import OFX/CSV/XLSX;
- promessas de produção quando setup externo faltar.

## Testes obrigatórios

### Landing

- mobile;
- desktop;
- teclado;
- contraste;
- reduced motion;
- links;
- pricing;
- Lighthouse;
- sem CLS relevante.

### Jurídico e privacidade

- links jurídicos funcionam;
- aceite versionado persiste;
- recusa de cookies é funcional;
- analytics opcional não carrega antes de consentimento;
- Privacy Center cria solicitação rastreável;
- logout pode limpar cache local;
- placeholders são detectáveis pelo checklist.

### Regressão acumulada

Executar regressão das fases anteriores:

- auth;
- linked login methods;
- isolamento;
- offline sem duplicação;
- ledger parcial;
- workspace casal sem vazamento;
- billing idempotente;
- entitlement do owner.

### Produção

Não marcar produção pronta sem:

- preencher CNPJ ou identificação jurídica aplicável;
- emails de suporte e privacidade;
- domínio;
- Firebase Prod;
- Stripe produção;
- webhook produção;
- revisão jurídica humana;
- App Check validado;
- backups;
- alertas;
- teste de exclusão;
- teste de exportação;
- teste mobile;
- teste de isolamento.

## Gate de qualidade

```text
MVP possui landing estática rápida, jurídico versionado com pendências explícitas,
Privacy Center funcional, documentação operacional e regressão acumulada passando;
nenhuma pendência externa é mascarada como concluída.
```

## Entrega

Executar testes, corrigir, atualizar `IMPLEMENTATION_STATUS.md`, produzir checklist de lançamento e parar.
