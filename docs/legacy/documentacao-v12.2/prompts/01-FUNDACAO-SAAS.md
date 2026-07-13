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


# Fase 1 — Fundação SaaS

## Objetivo

Criar a fundação executável do Zerou: scaffold, autenticação, onboarding, workspace pessoal, isolamento por Security Rules, sistema de temas configurável por usuário e ambiente local reproduzível.

## Marca e assets obrigatórios nesta fase

Aplicar a identidade oficial **Zerou** conforme `BRAND-GUIDELINES.md` e `BRAND-ASSET-INTEGRATION.md`:

- nome exibido `Zerou`;
- tagline oficial `Controle individual. Organização a dois.` quando houver espaço adequado;
- favicon oficial;
- ícones PWA;
- logo no shell e telas de autenticação;
- token índigo como cor principal;
- verde apenas como acento secundário ou estado semântico positivo;
- nenhuma ocorrência visível do nome provisório anterior.

## Escopo permitido

### Estrutura do projeto

- React + Vite + TypeScript strict;
- Tailwind + CSS Variables;
- React Router;
- Zustand;
- React Hook Form + Zod;
- Firebase SDK modular;
- Firebase Functions v2 em TypeScript;
- Emulator Suite;
- PWA scaffold;
- scripts de lint, typecheck, testes e emuladores.

### Firebase

Criar ou revisar:

```text
firebase.json
.firebaserc.example
firestore.rules
firestore.indexes.json
storage.rules
.env.example
functions/
```

Usar runtime Node.js 22 preferencialmente. Documentar fallback para Node.js 20 se houver incompatibilidade real.

### Autenticação

Implementar:

- cadastro email/senha;
- login email/senha;
- Google Sign-In;
- recuperação de senha;
- verificação de email;
- logout;
- preservação de rota de retorno;
- preservação de código de convite pendente durante autenticação;
- rota `/app/settings/security/login-methods`;
- listagem de provedores vinculados;
- vincular Google a conta email/senha;
- adicionar senha a conta criada com Google;
- impedir desvínculo do último método ativo;
- reautenticação recente em ações sensíveis;
- bloquear merge automático entre UIDs diferentes.

### Onboarding

Implementar fluxo:

1. boas-vindas;
2. nome e aceite jurídico versionado;
3. criação server-side idempotente do workspace pessoal;
4. primeira conta opcional;
5. dashboard vazio.

### Workspaces e memberships

Implementar modelos e Functions mínimas:

```text
ensureUserProfile()
ensurePersonalWorkspace()
```

Requisitos:

- um workspace pessoal por usuário;
- membership owner ativa;
- `workspaceRefs` no perfil do usuário;
- função idempotente;
- nenhum usuário lê workspace de outro;
- frontend não altera membership, role, owner ou campos protegidos.

### UI base e sistema de temas

Implementar obrigatoriamente conforme `THEME-SYSTEM.md`:

- registro central com os seis temas oficiais: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold;
- tokens semânticos para fundos, superfícies, textos, bordas, ações, estados, gráficos e sombras;
- proibição de cores literais e classes cromáticas rígidas nos componentes da interface autenticada;
- `ThemeProvider` ou serviço equivalente;
- aplicação do tema por `data-theme` no elemento `<html>`;
- script prepaint antes do primeiro render do React para evitar flash visual;
- persistência local imediata em `localStorage`;
- sincronização das preferências em `/users/{uid}` após autenticação;
- preferência individual: nunca salvar tema no workspace nem replicar tema do parceiro;
- modo `system`, resolvendo Paper em sistema claro e Obsidian em sistema escuro;
- reação a alterações de `prefers-color-scheme` quando o modo `system` estiver ativo;
- rota `/app/settings/appearance` com preview real dos seis temas;
- seletor de tema, seguir dispositivo, densidade, tamanho de fonte e reduzir animações;
- layout autenticado;
- bottom navigation mobile;
- sidebar desktop simples;
- telas de login, cadastro, recuperação, onboarding e dashboard vazio;
- estados loading, erro e empty state reais.

A landing pública e os assets institucionais permanecem alinhados à identidade oficial da Zerou. Não recolorir arbitrariamente logo, app icon ou favicon em função do tema selecionado.

## Fora do escopo

Não implementar ainda:

- motor financeiro completo;
- cartões;
- espaço compartilhado funcional;
- billing;
- landing pública completa;
- admin;
- OCR;
- automações.

Pode existir somente scaffold mínimo de rota ou interface quando indispensável.

## Testes obrigatórios

- criar conta email/senha;
- entrar email/senha;
- criar conta Google;
- entrar Google;
- vincular Google mantendo mesmo uid;
- adicionar senha mantendo mesmo uid;
- impedir remoção do último provider;
- preservar convite pendente durante login;
- `ensurePersonalWorkspace()` é idempotente;
- usuário A não lê workspace B;
- frontend não altera role;
- frontend não altera owner;
- regras Storage inicialmente fechadas para caminhos não autorizados;
- renderizar os seis temas;
- alternar tema sem reload;
- persistir tema após reload;
- aplicar Paper e Obsidian corretamente no modo `system`;
- reagir à alteração de `prefers-color-scheme` no modo `system`;
- restaurar preferências do perfil após login;
- provar que dois usuários do mesmo workspace podem manter temas diferentes;
- verificar que componentes centrais não usam cores literais fora do registro de temas.

## Gate de qualidade

Considerar a fase concluída somente quando:

```text
usuário consegue cadastrar, autenticar, concluir onboarding,
receber workspace pessoal isolado e visualizar dashboard vazio;
testes de regras provam que outro usuário não lê nem escreve esse workspace;
os seis temas podem ser selecionados, persistidos e restaurados por usuário
sem cores hardcoded nos componentes centrais.
```

## Entrega

1. executar lint, typecheck, unit tests, rules tests e E2E relevantes;
2. corrigir falhas;
3. atualizar `IMPLEMENTATION_STATUS.md`;
4. registrar setup manual ainda pendente;
5. parar.
