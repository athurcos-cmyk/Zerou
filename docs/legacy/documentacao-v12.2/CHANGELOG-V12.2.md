# Zerou — Mudanças da v12.1 para v12.2

## Sistema de temas

- Criado `THEME-SYSTEM.md` como fonte de verdade da aparência da interface autenticada.
- A identidade institucional da marca foi separada explicitamente dos temas selecionados pelos usuários.
- Os seis temas oficiais passam a integrar a Fase 1: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Componentes autenticados devem consumir tokens semânticos; cores literais e classes cromáticas rígidas ficam proibidas fora do registro central.
- Criado suporte obrigatório a `themeMode: 'manual' | 'system'`.
- O modo `system` resolve Paper em sistema claro e Obsidian em sistema escuro.
- A preferência é aplicada antes do primeiro render para evitar flash visual.
- A troca é persistida imediatamente em `localStorage` e sincronizada em `/users/{uid}` após autenticação.
- A aparência pertence ao perfil individual; nunca ao workspace do casal.
- Gráficos devem consumir tokens `--chart-1` a `--chart-5`.

## Contratos

- `UserProfile.themeId` agora usa `ThemeId` com seis valores.
- Adicionado `UserProfile.themeMode`.
- Adicionado `UserProfile.fontScale`.
- Documentadas regras de sincronização local e remota das preferências.

## Prompts operacionais

- Todos os prompts agora exigem leitura de `THEME-SYSTEM.md`.
- A Fase 1 passou a implementar registro central, tokens, `ThemeProvider`, prepaint, rota de aparência, seis temas e testes de persistência.
- A Fase 6 deixa claro que a landing pública utiliza a identidade institucional e não precisa herdar o tema do usuário autenticado.

## Backlog

- Os quatro temas anteriormente adiados foram removidos do backlog pós-MVP porque agora fazem parte da fundação.
