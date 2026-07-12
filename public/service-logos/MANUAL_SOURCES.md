# Logos de serviço adicionados à mão (fora do `generate-service-logos.mjs`)

O `SOURCES.md` deste diretório é **gerado por script** a partir do `simple-icons` e não conhece
os arquivos abaixo. Estes foram trazidos manualmente pelo dono (2026-07-12) porque as marcas
**não existem no simple-icons**. O script não apaga arquivos extras, então eles convivem; mas
**não confie no `SOURCES.md` pra saber a origem destes** — é aqui.

Uso nominativo (identificar o serviço que a própria pessoa escolheu no app). Nomes e logos
seguem sendo marcas de seus donos.

## SVGs oficiais (símbolo quadrado, legível no tile de 36px)

| Arquivo | Marca | Origem |
|---|---|---|
| `chatgpt.svg` | ChatGPT (OpenAI) | trazido pelo dono |
| `microsoft-365.svg` | Microsoft 365 | trazido pelo dono |
| `oi.svg` | Oi | trazido pelo dono |
| `google-one.svg` | Google One | trazido pelo dono |
| `claro.svg` | Claro | trazido pelo dono |
| `rappi.svg` | Rappi | trazido pelo dono |

## Marcas que só têm wordmark → tile "ícone de app" (sem SVG)

Prime Video, Disney+, Globoplay, Xbox Game Pass, Nintendo Switch Online, Wellhub, Smart Fit,
Adobe, Canva, Kindle, Vivo, TIM, Sky. O logo real dessas é horizontal e fica ilegível espremido
no tile — então o `ServiceMark` desenha um quadrado na cor da marca com as iniciais em branco. As
cores ficam em `src/theme/palette.ts` (`serviceBrandColors`), não aqui. Pra promover uma delas a
logo de verdade no futuro: coloque o SVG **quadrado** ("ícone de app", não wordmark) aqui como
`<id>.svg`, adicione `logoPath` no catálogo (`src/finance/subscriptionServices.ts`) — o `logoPath`
tem prioridade sobre a cor de marca — e registre a origem nesta tabela.
