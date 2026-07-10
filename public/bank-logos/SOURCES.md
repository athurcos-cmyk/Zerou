# Bank Logo Sources

Estes SVGs identificam a instituição financeira que a pessoa escolhe dentro do app.
Nomes e logos seguem sendo marcas de seus donos (uso nominativo).

> ⚠️ **Procedência divergente (anotado em 2026-07-11).** `scripts/generate-bank-logos.mjs`
> declara gerar 7 arquivos a partir de `simple-icons` (nubank, picpay, mercado-pago, neon,
> modal, wise, nomad). Mas os arquivos **em disco** não batem com essa saída: só `modal`,
> `wise` e `nomad` têm o formato do gerador (`viewBox="0 0 24 24"`, um `<path>`). Os outros
> 26 — incluindo `nubank`, `picpay`, `mercado-pago` e `neon`, que o script lista — vieram de
> outra fonte (viewBox grande, múltiplos paths) e foram commitados sem atualizar este
> arquivo nem o script. **Não** re-rodar o script achando que "regenera tudo": ele
> sobrescreveria 4 logos que hoje estão diferentes. Decidir com o dono se a fonte canônica
> passa a ser o simple-icons (rodar o script e aceitar o novo visual) ou se estes 26 SVGs
> têm uma origem legítima a documentar aqui.

Contraste com `public/service-logos/SOURCES.md`, que é gerado de verdade por
`npm run generate:service-logos` e reflete exatamente o que está em disco.

## Arquivos com procedência confirmada (`simple-icons@16.23.0`)

Formato do gerador: `viewBox="0 0 24 24"`, um único `<path>`, `<title>`.

| Arquivo | Marca | Slug |
|---|---|---|
| modal.svg | Modal | modal |
| wise.svg | Wise | wise |
| nomad.svg | Nomad | nomad |

## Demais arquivos (origem a confirmar)

banco-do-brasil, banrisul, bmg, bradesco, btg, bv, c6, caixa, cresol, infinitepay,
inter, itau, mercado-pago, modal (ver acima), neon, nubank, original, pagbank, picpay,
safra, santander, sicoob, sicredi, stone, unicred, xp.
