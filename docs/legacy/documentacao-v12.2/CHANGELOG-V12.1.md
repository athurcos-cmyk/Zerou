# Zerou — Mudanças da v12.0 para v12.2

## Identidade do produto

- O nome provisório anterior foi substituído pela marca oficial **Zerou**.
- Tagline oficial definida: `Controle individual. Organização a dois.`
- Descritor curto definido: `Finanças pessoais e a dois.`
- O posicionamento foi consolidado em torno de autonomia individual com organização financeira compartilhada.

## Sistema visual

- Criado `BRAND-GUIDELINES.md` como fonte de verdade da marca.
- Criado `BRAND-ASSET-INTEGRATION.md` com caminhos públicos recomendados para assets, favicon e PWA manifest.
- Índigo `#5B5BD6` permanece como cor principal.
- Verde `#2EAE7D` passa a ser acento secundário e cor semântica positiva, não protagonista visual.
- Tipografia recomendada: Sora.

## Execução por fases

- Os seis prompts operacionais foram atualizados para exigir a marca Zerou e ler os documentos canônicos de identidade.
- Fase 1 passou a aplicar logo, favicon, PWA manifest e tokens visuais oficiais.
- Fase 6 passou a aplicar Zerou em landing, SEO, Open Graph, emails e páginas públicas.
- Criado `HANDOFF-CHECKLIST.md` para reduzir inconsistência entre execuções.

## Infraestrutura

- Nicknames e exemplos de Project ID Firebase foram atualizados para o namespace `zerou-*`.
- Adicionada variável `VITE_APP_NAME=Zerou` no bootstrap.

## Compatibilidade

- Contratos técnicos, collections Firestore, regras contábeis e roadmap incremental da v12 permanecem válidos.
- O plano comercial `duo` pode continuar existindo: ele é um plano, não a marca.
