# Zerou - QA Scenarios v12.2

> Matriz viva de testes e cenarios provaveis. Planeja validacoes ate a ultima fase, mas nao autoriza implementar fases futuras antes do prompt correspondente.

## Regras gerais

- Usar sempre dados reais de teste do usuario logado ou fixtures de emulador.
- Nao persistir dados fake como se fossem producao.
- Validar sucesso, erro de permissao, erro de validacao, retry/idempotencia e estado offline quando aplicavel.
- Confirmar que textos visiveis usam "Zerou" e a tagline "Controle individual. Organizacao a dois.".
- Confirmar que temas continuam por usuario, sem vazar preferencia para parceiro.

## Fase 3 - Cartoes e faturas

| Cenario | Caminho esperado | Erro provavel a testar |
|---|---|---|
| Criar cartao | Membro ativo cria cartao em `/workspaces/{workspaceId}/cards/{cardId}`. | Nao-membro tenta criar/ler cartao e recebe permissao negada. |
| Compra unica | Compra gera transacao `card_purchase`, ledger `purchase` e fatura do ciclo. | Compra sem cartao valido ou fatura fora do workspace falha. |
| Compra parcelada | Parcelas entram em faturas por ciclo, sem duplicar por retry. | Reenvio com mesma idempotencia nao duplica ledger. |
| Fatura parcial | Compra 1090, pagamento 550, saldo 540. | Dashboard nao deve reduzir caixa no momento da compra. |
| Pagamento total | Pagamento liquida fatura e reduz saldo da conta uma vez. | Pagamento sem conta existente falha. |
| Pagamento maior | Excedente vira credito da fatura. | Valor negativo ou ledger alterado manualmente falha. |
| Estorno/chargeback | Creditos reduzem saldo aberto sem apagar a despesa original. | Estorno depois do fechamento nao reescreve compra original. |
| Juros/multa/IOF/tarifa | Encargos aumentam saldo aberto e ficam rastreaveis no ledger. | Cliente nao altera agregados da fatura diretamente. |
| Antecipacao | Lancamento de antecipacao entra como debito controlado. | Antecipacao sem grupo/parcela identificavel falha na UI. |
| Reconciliacao | Status da fatura pode ser ajustado, totais seguem derivados do ledger. | Tentativa de editar `outstandingBalanceCents` falha em Rules. |

## Fase 4 - Espaco compartilhado

| Cenario | Caminho esperado | Erro provavel a testar |
|---|---|---|
| Convite pendente | Owner cria convite, parceiro aceita e entra como membro ativo. | Token expirado, ja usado ou de outro email falha. |
| Privacidade individual | Dados pessoais seguem isolados por workspace/membership. | Parceiro nao le workspace pessoal do outro. |
| Visao compartilhada | Transacoes compartilhadas aparecem apenas no workspace do casal. | Troca de workspace nao mistura contas pessoais. |
| Saida do casal | Membro removido perde leitura/escrita. | Cache local nao deve continuar mostrando dados privados apos logout/refresh. |

## Fase 5 - Billing e entitlements

| Cenario | Caminho esperado | Erro provavel a testar |
|---|---|---|
| Checkout | Usuario inicia upgrade e volta com entitlement ativo. | Cancelamento no checkout nao ativa plano. |
| Webhook idempotente | Mesmo evento Stripe processado uma vez. | Retry de webhook nao duplica assinatura. |
| Bloqueio por plano | Recursos pagos respeitam entitlement. | Cliente nao consegue forjar entitlement no Firestore. |
| Falha de pagamento | Plano entra em estado pendente/bloqueado conforme regra. | UI informa sem apagar dados do usuario. |

## Fase 6 - Lancamento

| Cenario | Caminho esperado | Erro provavel a testar |
|---|---|---|
| Landing publica | Rotas publicas carregam rapido, responsivas e com marca correta. | Hero quebrado, asset errado ou texto fora do canonico. |
| PWA update | Usuario recebe versao nova sem limpar cache manualmente. | Service worker antigo nao deve prender bundle obsoleto. |
| Juridico | Politica, termos e contato ficam acessiveis. | Links quebrados ou texto desatualizado bloqueiam gate. |
| Acessibilidade | Navegacao por teclado, labels e contraste aceitaveis. | Modal/menu inacessivel em mobile. |
| Producao | Build, deploy, smoke test e canary passam. | Rota SPA retorna 404 ou Auth bloqueia dominio. |

## Gates por fase

- Fase 3 passa quando dominio de invoices, UI basica, Rules publicadas, build e testes principais passam.
- Fase 4 passa quando convite/membership compartilhado nao vaza dados pessoais.
- Fase 5 passa quando billing e webhooks sao idempotentes e seguros.
- Fase 6 passa quando produto, legal, PWA, deploy e QA visual estao prontos para uso publico.
