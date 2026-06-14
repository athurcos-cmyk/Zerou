# Zerou — Diretrizes canônicas de marca

> Fonte de verdade para identidade verbal e visual. Quando houver conflito com texto provisório em outros arquivos, este documento prevalece para superfícies visíveis ao usuário.

# 1. Identidade principal

```text
Marca exibida: Zerou
Tagline oficial: Controle individual. Organização a dois.
Descritor curto: Finanças pessoais e a dois.
```

## Posicionamento

A Zerou organiza finanças pessoais e compartilhadas sem transformar a vida financeira do casal em uma conta única. O produto combina autonomia individual, espaço compartilhado, privacidade e clareza.

## Conceito do símbolo

O símbolo oficial é um **Z formado por duas peças complementares**. Cada peça representa uma pessoa com identidade financeira própria. O encaixe representa organização em conjunto, não fusão irrestrita de dados.

Mensagem central:

```text
Duas pessoas. Dois espaços. Uma organização em comum.
```

# 2. Paleta oficial

| Token | Hex | Uso |
|---|---|---|
| `brand.graphite` | `#171A1F` | textos principais, fundos escuros e contraste |
| `brand.indigo` | `#5B5BD6` | cor principal da marca, CTAs e componentes selecionados |
| `brand.greenAccent` | `#2EAE7D` | detalhe secundário, conclusão e estado positivo |
| `brand.offWhite` | `#F6F7F9` | fundos claros e superfícies Paper |

## Regra cromática

Índigo é protagonista. Verde não deve dominar telas ou peças publicitárias. Usar verde como acento secundário e como semântica positiva: confirmação, conciliação concluída, sincronização, saldo saudável ou ação bem-sucedida.

# 2.1. Identidade institucional versus temas da interface

A paleta oficial acima identifica a marca Zerou. Ela não obriga todos os usuários a utilizar uma interface índigo.

- logo, app icon, favicon, landing e peças institucionais preservam a identidade oficial;
- a área autenticada usa tokens semânticos conforme o tema escolhido pelo usuário;
- a preferência de aparência é individual e não pertence ao workspace do casal;
- não recolorir arbitrariamente o símbolo conforme o tema; usar versão principal ou negativa conforme o contraste;
- consultar `THEME-SYSTEM.md` antes de criar ou alterar componentes.

# 3. Tipografia

Fonte preferencial para UI e comunicação: **Sora**.

Fallbacks:

```css
font-family: 'Sora', Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

# 4. Assinaturas oficiais

1. Logo principal: símbolo + wordmark + tagline.
2. Assinatura horizontal compacta: símbolo + wordmark.
3. Símbolo isolado: uso em avatar, favicon, splash e contextos reduzidos.
4. Versão negativa: símbolo índigo + wordmark claro sobre grafite.
5. App icon: símbolo isolado em tile claro arredondado.

# 5. Regras de uso

- usar o nome exatamente como `Zerou`;
- não exibir o nome provisório anterior;
- não redesenhar o símbolo dentro da implementação;
- não substituir o símbolo por gráficos, cifrões, moedas, corações ou alianças;
- não tratar verde como cor principal da marca;
- preservar área de respiro ao redor do logo;
- preferir símbolo isolado quando o espaço for insuficiente para leitura do wordmark;
- usar a tagline em superfícies institucionais, onboarding e landing quando houver espaço; não forçar tagline em componentes compactos.

# 6. Linguagem visual

A interface deve parecer:

- clara;
- confiável;
- calma;
- contemporânea;
- mobile-first;
- sofisticada sem ostentação;
- acessível sem infantilização.

Evitar:

- estética cripto;
- neon;
- gradiente excessivo em componentes;
- gráficos decorativos sem função;
- linguagem romântica excessiva;
- visual de clínica, spa ou aplicativo de meditação.
