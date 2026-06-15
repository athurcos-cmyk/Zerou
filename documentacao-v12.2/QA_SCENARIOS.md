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
| Workspace do casal | Owner cria workspace `couple`, membership owner e workspaceRef ativos. | Usuario com casal ativo nao cria outro casal. |
| Convite valido uma vez | Owner gera codigo `DUO-XXXX-XX`, parceiro confirma e entra como membro ativo. | Mesmo convite aceito de novo falha por status/activeMemberCount. |
| Expiracao e revogacao | Convites expirados/revogados nao aceitam parceiro. | Preview/accept deve falhar sem criar membership. |
| Regenerar convite | Novo codigo invalida convites ativos anteriores do mesmo workspace. | Codigo antigo nao pode ser usado apos regeneracao. |
| Limite de dois membros | Workspace do casal fica com owner + partner. | Terceiro membro ativo e bloqueado em Rules. |
| Privacidade individual | Dados pessoais seguem isolados por workspace/membership. | Parceiro nao le workspace pessoal, contas, cartoes, faturas ou transacoes do outro. |
| Claim compartilhado | Membro cria `SharedExpenseClaim` apenas com resumo, total, split, pagador e status. | Campos pessoais como account/card/invoice/history/notes sao rejeitados. |
| Settlement | Balanco por membro gera proposta; pagamento parcial/total atualiza status e historico. | Valor invalido ou settlement fora do workspace falha. |
| Saida/remocao | Partner pode sair; owner pode remover partner; workspaceRef/membership ficam removidos. | Membro removido perde leitura/escrita. |

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
- Fase 4 passa quando convite/membership, claims e settlements funcionam sem vazar dados pessoais.
- Fase 5 passa quando billing e webhooks sao idempotentes e seguros.
- Fase 6 passa quando produto, legal, PWA, deploy e QA visual estao prontos para uso publico.
