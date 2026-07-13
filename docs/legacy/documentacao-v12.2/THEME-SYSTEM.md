# Zerou — Sistema canônico de temas

> Fonte de verdade para cores da interface autenticada. Este documento deve ser lido antes de criar ou alterar componentes visuais. A identidade institucional da Zerou e o tema escolhido pelo usuário são camadas distintas.

# 1. Princípio obrigatório

A marca **Zerou** possui identidade visual estável. A interface do aplicativo possui aparência configurável por usuário.

| Camada | Regra |
|---|---|
| Logo, app icon, favicon e assets institucionais | permanecem com a identidade oficial da Zerou |
| Landing pública | utiliza a identidade institucional da Zerou |
| Interface autenticada | utiliza tokens semânticos resolvidos pelo tema ativo |
| Preferência de aparência | pertence ao perfil individual do usuário, não ao workspace |
| Tema do parceiro | nunca altera a aparência escolhida pelo outro usuário |

A cor oficial da marca não pode ser confundida com uma cor fixa de interface.

# 2. Proibição de cores hardcoded

Componentes de interface não devem conter cores literais, classes cromáticas rígidas ou nomes vinculados a um tema específico.

Evitar:

```tsx
<button className="bg-[#5B5BD6] text-white">Salvar</button>
<div className="bg-indigo-600 text-slate-900">...</div>
```

Usar:

```tsx
<button className="bg-action-primary text-on-action hover:bg-action-primary-hover">
  Salvar
</button>
<div className="bg-surface-primary text-content-primary">...</div>
```

Cores literais são permitidas somente:

- no registro central dos temas;
- em assets institucionais aprovados;
- em metadados institucionais, como `theme_color` do PWA manifest;
- em casos excepcionais documentados em `IMPLEMENTATION_STATUS.md`.

# 3. Temas oficiais

Implementar os seis temas desde a Fase 1.

```typescript
export type ThemeId =
  | 'paper'
  | 'sakura'
  | 'obsidian'
  | 'midnight'
  | 'aurora'
  | 'rose-gold';

export type ThemeMode = 'manual' | 'system';
```

| ID | Nome exibido | Tipo | Direção |
|---|---|---|---|
| `paper` | Paper | claro | padrão institucional, leve e sofisticado |
| `sakura` | Sakura | claro | suave, quente e acolhedor sem perder contraste |
| `obsidian` | Obsidian | escuro | carbono neutro e discreto |
| `midnight` | Midnight | escuro | índigo profundo e tecnológico |
| `aurora` | Aurora | escuro | verde profundo com acentos frios |
| `rose-gold` | Rose Gold | escuro | quente, elegante e moderado |

## Modo system

Quando `themeMode === 'system'`:

```text
prefers-color-scheme: light → paper
prefers-color-scheme: dark  → obsidian
```

O usuário pode retornar ao modo manual e selecionar qualquer um dos seis temas. A arquitetura deve permitir alterar futuramente o mapeamento de `system` sem refatorar componentes.

# 4. Tokens semânticos obrigatórios

Os componentes devem consumir estes papéis semânticos:

```css
--bg-page;
--bg-surface;
--bg-surface-subtle;
--bg-surface-muted;
--bg-overlay;

--text-primary;
--text-secondary;
--text-muted;
--text-inverse;

--border-subtle;
--border-default;
--border-focus;

--action-primary;
--action-primary-hover;
--action-primary-soft;
--action-secondary;

--success;
--success-soft;
--danger;
--danger-soft;
--warning;
--warning-soft;
--info;
--info-soft;

--chart-1;
--chart-2;
--chart-3;
--chart-4;
--chart-5;

--shadow-xs;
--shadow-sm;
--shadow-md;
```

A implementação pode adicionar tokens semânticos quando necessário, mas não deve remover nem renomear silenciosamente os tokens canônicos após componentes dependerem deles.

# 5. Registro inicial dos seis temas

```css
:root,
[data-theme="paper"] {
  --bg-page: #F6F7F9;
  --bg-surface: #FFFFFF;
  --bg-surface-subtle: #F1F3F6;
  --bg-surface-muted: #ECEFF3;
  --bg-overlay: rgba(23, 26, 31, 0.42);
  --text-primary: #171A1F;
  --text-secondary: #667085;
  --text-muted: #98A2B3;
  --text-inverse: #FFFFFF;
  --border-subtle: #E7EAF0;
  --border-default: #DDE2EA;
  --border-focus: #6366F1;
  --action-primary: #5B5BD6;
  --action-primary-hover: #4F4FC4;
  --action-primary-soft: #EEF0FF;
  --action-secondary: #FFFFFF;
  --success: #2EAE7D;
  --success-soft: #EAF8F2;
  --danger: #D96B6B;
  --danger-soft: #FCEEEE;
  --warning: #C98A35;
  --warning-soft: #FFF6E8;
  --info: #4C82D8;
  --info-soft: #EEF5FF;
  --chart-1: #5B5BD6;
  --chart-2: #2EAE7D;
  --chart-3: #4C82D8;
  --chart-4: #C98A35;
  --chart-5: #B36DA8;
  --shadow-xs: 0 1px 2px rgba(16, 24, 40, 0.04);
  --shadow-sm: 0 3px 10px rgba(16, 24, 40, 0.06);
  --shadow-md: 0 10px 28px rgba(16, 24, 40, 0.08);
}

[data-theme="sakura"] {
  --bg-page: #FBF7F8;
  --bg-surface: #FFFFFF;
  --bg-surface-subtle: #F8EEF1;
  --bg-surface-muted: #F1E3E7;
  --bg-overlay: rgba(47, 32, 38, 0.40);
  --text-primary: #2A2024;
  --text-secondary: #76636A;
  --text-muted: #A38F96;
  --text-inverse: #FFFFFF;
  --border-subtle: #F0E1E5;
  --border-default: #E7D6DB;
  --border-focus: #B56A83;
  --action-primary: #A85E78;
  --action-primary-hover: #914D67;
  --action-primary-soft: #F7E8ED;
  --action-secondary: #FFFFFF;
  --success: #3D9B78;
  --success-soft: #E9F6F0;
  --danger: #C9676D;
  --danger-soft: #FBECEE;
  --warning: #B98543;
  --warning-soft: #FFF5E7;
  --info: #627FB7;
  --info-soft: #EEF3FC;
  --chart-1: #A85E78;
  --chart-2: #3D9B78;
  --chart-3: #627FB7;
  --chart-4: #B98543;
  --chart-5: #8B6BA8;
  --shadow-xs: 0 1px 2px rgba(47, 32, 38, 0.04);
  --shadow-sm: 0 3px 10px rgba(47, 32, 38, 0.06);
  --shadow-md: 0 10px 28px rgba(47, 32, 38, 0.08);
}

[data-theme="obsidian"] {
  --bg-page: #111318;
  --bg-surface: #1A1D24;
  --bg-surface-subtle: #20242D;
  --bg-surface-muted: #282D37;
  --bg-overlay: rgba(0, 0, 0, 0.62);
  --text-primary: #F3F4F6;
  --text-secondary: #B4BAC4;
  --text-muted: #7F8793;
  --text-inverse: #111318;
  --border-subtle: #262B34;
  --border-default: #343A46;
  --border-focus: #8B91FF;
  --action-primary: #7C83FD;
  --action-primary-hover: #9095FF;
  --action-primary-soft: #282B54;
  --action-secondary: #20242D;
  --success: #49C894;
  --success-soft: #193B30;
  --danger: #EC8585;
  --danger-soft: #452629;
  --warning: #E5AD5C;
  --warning-soft: #42331F;
  --info: #75A7F0;
  --info-soft: #21354F;
  --chart-1: #8B91FF;
  --chart-2: #49C894;
  --chart-3: #75A7F0;
  --chart-4: #E5AD5C;
  --chart-5: #D18AC2;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.18);
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.22);
  --shadow-md: 0 14px 32px rgba(0, 0, 0, 0.28);
}

[data-theme="midnight"] {
  --bg-page: #101225;
  --bg-surface: #181B35;
  --bg-surface-subtle: #202443;
  --bg-surface-muted: #292E52;
  --bg-overlay: rgba(4, 6, 20, 0.66);
  --text-primary: #F4F5FF;
  --text-secondary: #BEC4E0;
  --text-muted: #8991B5;
  --text-inverse: #111326;
  --border-subtle: #282D50;
  --border-default: #383F6C;
  --border-focus: #9DA4FF;
  --action-primary: #858CFF;
  --action-primary-hover: #9BA1FF;
  --action-primary-soft: #2B315E;
  --action-secondary: #202443;
  --success: #55C99B;
  --success-soft: #1E4438;
  --danger: #EE8A91;
  --danger-soft: #4A2933;
  --warning: #E4B362;
  --warning-soft: #46371F;
  --info: #7EB0FF;
  --info-soft: #243A62;
  --chart-1: #9DA4FF;
  --chart-2: #55C99B;
  --chart-3: #7EB0FF;
  --chart-4: #E4B362;
  --chart-5: #D091D4;
  --shadow-xs: 0 1px 2px rgba(3, 5, 18, 0.22);
  --shadow-sm: 0 4px 12px rgba(3, 5, 18, 0.28);
  --shadow-md: 0 14px 32px rgba(3, 5, 18, 0.34);
}

[data-theme="aurora"] {
  --bg-page: #0F1919;
  --bg-surface: #172525;
  --bg-surface-subtle: #1E3030;
  --bg-surface-muted: #263B3B;
  --bg-overlay: rgba(2, 15, 15, 0.66);
  --text-primary: #EFF7F5;
  --text-secondary: #B2C8C5;
  --text-muted: #7F9D99;
  --text-inverse: #102020;
  --border-subtle: #263A3A;
  --border-default: #355050;
  --border-focus: #64BFB2;
  --action-primary: #50AA9E;
  --action-primary-hover: #63BDB0;
  --action-primary-soft: #20443F;
  --action-secondary: #1E3030;
  --success: #64C892;
  --success-soft: #214536;
  --danger: #E98787;
  --danger-soft: #49292C;
  --warning: #DDAE60;
  --warning-soft: #45371F;
  --info: #75AADD;
  --info-soft: #223A4D;
  --chart-1: #63BDB0;
  --chart-2: #64C892;
  --chart-3: #75AADD;
  --chart-4: #DDAE60;
  --chart-5: #B68CC5;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.18);
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.22);
  --shadow-md: 0 14px 32px rgba(0, 0, 0, 0.28);
}

[data-theme="rose-gold"] {
  --bg-page: #1A1517;
  --bg-surface: #251D21;
  --bg-surface-subtle: #30262A;
  --bg-surface-muted: #3B2E33;
  --bg-overlay: rgba(18, 9, 12, 0.68);
  --text-primary: #FBF4F5;
  --text-secondary: #D6BEC4;
  --text-muted: #A88E95;
  --text-inverse: #23171B;
  --border-subtle: #3B2C31;
  --border-default: #513D44;
  --border-focus: #D39BA7;
  --action-primary: #BF8290;
  --action-primary-hover: #D092A0;
  --action-primary-soft: #4A3038;
  --action-secondary: #30262A;
  --success: #71BE94;
  --success-soft: #294136;
  --danger: #EC8D91;
  --danger-soft: #512D31;
  --warning: #DEB16E;
  --warning-soft: #49391F;
  --info: #8AA9D8;
  --info-soft: #2A394E;
  --chart-1: #D092A0;
  --chart-2: #71BE94;
  --chart-3: #8AA9D8;
  --chart-4: #DEB16E;
  --chart-5: #B894D4;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.18);
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.22);
  --shadow-md: 0 14px 32px rgba(0, 0, 0, 0.28);
}
```

# 6. Aplicação antes do primeiro render

Evitar flash de tema incorreto. Carregar a preferência local antes da inicialização do React.

Referência:

```html
<script>
  (() => {
    const mode = localStorage.getItem('zerou.themeMode') || 'system';
    const manualTheme = localStorage.getItem('zerou.themeId') || 'paper';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = mode === 'system'
      ? (prefersDark ? 'obsidian' : 'paper')
      : manualTheme;

    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = mode;
  })();
</script>
```

Após autenticação, sincronizar as preferências do perfil no Firestore sem bloquear a primeira pintura da interface.

# 7. Persistência por usuário

Persistir no perfil individual:

```typescript
interface AppearancePreferences {
  themeMode: ThemeMode;
  themeId: ThemeId;
  density: 'comfortable' | 'compact';
  fontScale: 'sm' | 'md' | 'lg';
  reduceMotion: boolean;
}
```

Regras:

- persistir imediatamente no `localStorage` para resposta visual instantânea;
- sincronizar em `/users/{uid}` após login;
- restaurar em novos dispositivos após autenticação;
- não salvar aparência no workspace;
- não compartilhar preferência visual com parceiro;
- lidar com falha de sincronização sem impedir troca local;
- atualizar automaticamente quando o sistema operacional alternar claro/escuro e o modo ativo for `system`.

# 8. Rota e UX

Implementar:

```text
/app/settings/appearance
```

A tela deve conter:

- seletor `Seguir aparência do dispositivo`;
- grid com preview real dos seis temas;
- nome do tema;
- estado selecionado claro;
- opções de densidade;
- tamanho de fonte;
- reduzir animações;
- contraste acessível;
- atualização instantânea sem reload.

# 9. Gráficos e estados

Gráficos devem usar `--chart-1` a `--chart-5`, nunca arrays cromáticos hardcoded dentro do componente.

Estados semânticos usam `--success`, `--danger`, `--warning` e `--info`. Não utilizar a cor primária como substituta de status.

# 10. Assets da marca em temas escuros

A marca continua institucional. Para superfícies claras, usar logo principal. Para superfícies escuras, usar versão negativa. Em áreas reduzidas, usar símbolo isolado.

Não recolorir arbitrariamente o símbolo em função do tema. Selecionar a variante oficial apropriada ao contraste.

# 11. Testes obrigatórios

- renderizar cada um dos seis temas;
- alternar entre temas sem reload;
- persistir escolha após reload;
- restaurar preferência do perfil após login em novo dispositivo;
- manter tema independente entre dois usuários do mesmo workspace de casal;
- aplicar `paper` e `obsidian` corretamente no modo `system`;
- reagir a alteração de `prefers-color-scheme` quando o modo for `system`;
- garantir contraste mínimo nos fluxos críticos;
- verificar que componentes centrais não usam cores literais fora do registro de temas;
- verificar gráficos com tokens cromáticos do tema ativo.
