# Zerou — Integração dos assets visuais

Este documento define onde os arquivos do pacote separado `zerou-brand-assets.zip` devem ser copiados dentro do repositório.

# 1. Estrutura recomendada

```text
public/
  brand/
    zerou-logo-primary.png
    zerou-logo-horizontal.png
    zerou-logo-negative.png
    zerou-symbol.png
    zerou-symbol-reduced.png
    zerou-app-icon-512.png
    zerou-app-icon-192.png
    zerou-app-icon-180.png
    zerou-maskable-512.png
  favicon.ico
  favicon-32x32.png
  favicon-16x16.png
```

O pacote visual possui variações e tamanhos adicionais. Usar os arquivos mais próximos destes nomes ou renomeá-los durante a cópia para estabilizar os caminhos públicos.

# 2. Uso por superfície

| Superfície | Asset recomendado |
|---|---|
| Navbar da landing | `zerou-logo-horizontal.png` |
| Tela de login e onboarding | `zerou-logo-primary.png` |
| Sidebar compacta | `zerou-symbol.png` |
| Splash screen | `zerou-symbol.png` ou app icon |
| Favicon | `favicon.ico` |
| PWA manifest 192 | `zerou-app-icon-192.png` |
| PWA manifest 512 | `zerou-app-icon-512.png` |
| Apple touch icon | `zerou-app-icon-180.png` |
| Open Graph provisório | logo horizontal sobre composição institucional |
| Fundo escuro | `zerou-logo-negative.png` |

# 3. PWA manifest

Configuração de referência:

```json
{
  "name": "Zerou",
  "short_name": "Zerou",
  "description": "Controle individual. Organização a dois.",
  "theme_color": "#5B5BD6",
  "background_color": "#F6F7F9",
  "display": "standalone",
  "icons": [
    { "src": "/brand/zerou-app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/brand/zerou-app-icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

# 4. Marca fixa e temas configuráveis

Os assets oficiais são institucionais e não devem ser recoloridos arbitrariamente conforme o tema selecionado.

| Contexto | Regra |
|---|---|
| Superfície clara | usar logo principal |
| Superfície escura | usar versão negativa |
| Espaço reduzido | usar símbolo isolado |
| PWA, favicon e atalho instalado | manter identidade oficial estável |
| Componentes da interface autenticada | consumir tokens semânticos de `THEME-SYSTEM.md` |

A preferência visual pertence ao usuário e não altera o ícone instalado ou a identidade institucional da marca.

# 5. Estado atual dos arquivos

Os assets aprovados foram exportados inicialmente como PNG rasterizado. Eles são suficientes para integração do MVP.

Antes de registro formal de marca, impressão ampliada ou produção avançada de peças, reconstruir o símbolo e o wordmark em vetor SVG com precisão geométrica. Não improvisar SVG aproximado dentro do frontend.

# 6. Checklist

- [ ] copiar assets aprovados;
- [ ] estabilizar nomes em `public/brand/`;
- [ ] atualizar favicon;
- [ ] configurar PWA manifest;
- [ ] validar ícone em 32px, 64px, 192px e 512px;
- [ ] testar contraste em fundo claro e escuro;
- [ ] remover logos temporários;
- [ ] registrar qualquer bloqueio em `IMPLEMENTATION_STATUS.md`.
