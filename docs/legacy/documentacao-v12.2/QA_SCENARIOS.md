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
| Checkout Duo mensal | Callable autenticada busca Price ID no `planCatalog` e retorna URL Stripe. | Plano invalido, usuario anonimo ou preco enviado pelo frontend falha. |
| Checkout Premium anual | Backend usa Price ID anual do catalogo e idempotency key por request. | Price ID ausente mostra cobranca indisponivel. |
| Portal do cliente | Callable retorna URL somente para customer do usuario autenticado. | Usuario sem customer recebe erro seguro. |
| Webhook assinado | `stripeWebhook` valida `stripe-signature` com `rawBody` e persiste evento uma vez. | Assinatura invalida retorna 400 e nao grava evento. |
| Webhook idempotente | Mesmo `stripeEventId` nao duplica efeito. | Evento duplicado nao cria segunda subscription. |
| Evento desconhecido | Evento nao suportado vira `ignored`. | Nao falhar silenciosamente nem apagar payload. |
| Retry | Evento `failed` ou `processing` preso volta para fila. | Erro registrado sem segredo Stripe. |
| Ordem fora de sequencia | Processor busca subscription atual na Stripe antes de recalcular entitlement. | Evento antigo nao rebaixa estado atual indevidamente. |
| Modo gratuito de lancamento | Free cria casal enquanto a Zerou estiver 100% gratuita; owner controla casal. | Frontend nao consegue escrever billingAccount/entitlements. |
| Partner sem Premium pessoal | Plano do owner libera casal, mas nao recursos premium pessoais do parceiro. | Parceiro nao herda Premium no workspace pessoal. |
| Falha de pagamento | `past_due`, `cancelled` ou `expired` bloqueiam novos recursos premium. | Dados existentes permanecem, sem apagamento automatico. |
| E2E Test Mode | Checkout, webhook, tela de billing e Portal funcionam com credenciais Test Mode. | Sem secrets/Blaze, registrar bloqueio externo real. |

## Fase 6 - Lancamento

| Cenario | Caminho esperado | Erro provavel a testar |
|---|---|---|
| Landing publica | Rotas publicas carregam rapido, responsivas e com marca correta. | Hero quebrado, asset errado ou texto fora do canonico. |
| Planos gratuitos | `/pricing` e `/app/settings/billing` deixam claro que nao ha cobranca ativa. | CTA nao deve induzir assinatura ou Checkout. |
| Cookies | Recusar opcionais salva consentimento e nao carrega Analytics. | Analytics antes de consentimento bloqueia gate. |
| Privacy Center | Usuario logado cria pedido LGPD rastreavel em `privacyRequests/{requestId}`. | Botao decorativo sem escrita real bloqueia gate. |
| PWA update | Usuario recebe versao nova sem limpar cache manualmente. | Service worker antigo nao deve prender bundle obsoleto. |
| Juridico | Politica, termos, cookies, subprocessadores e contato ficam acessiveis com placeholders visiveis. | Fingir revisao juridica ou esconder placeholder bloqueia gate. |
| Acessibilidade | Navegacao por teclado, labels e contraste aceitaveis. | Modal/menu inacessivel em mobile. |
| Producao | Build, deploy, smoke test e canary passam. | Rota SPA retorna 404 ou Auth bloqueia dominio. |

## Gates por fase

- Fase 3 passa quando dominio de invoices, UI basica, Rules publicadas, build e testes principais passam.
- Fase 4 passa quando convite/membership, claims e settlements funcionam sem vazar dados pessoais.
- Fase 5 passa quando billing e webhooks sao idempotentes e seguros, mesmo que a ativacao cloud dependa de decisao futura/Blaze.
- Fase 6 passa quando landing, legal draft, cookies, Privacy Center, PWA, docs operacionais e QA passam; producao publica ampla ainda depende do checklist manual.
