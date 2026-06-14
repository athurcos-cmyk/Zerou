# Instruções operacionais obrigatórias

Você está trabalhando no repositório do **Zerou**. Execute somente a fase descrita neste arquivo.

Leia antes de editar:

1. `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`;
2. `CONTRATOS-CANONICOS.md`;
3. `BRAND-GUIDELINES.md`;
4. `THEME-SYSTEM.md`;
5. `PRODUCT-COPY-CANONICAL.md`;
6. `IMPLEMENTATION_STATUS.md`;
7. arquivos existentes do repositório;
8. `00-BOOTSTRAP-MANUAL.md` quando houver dependência externa.

Regras:

- não antecipar funcionalidades de fases futuras;
- não fingir que criou recurso externo;
- não substituir funcionalidade por mock permanente;
- não remover comportamento previamente validado;
- manter TypeScript strict;
- persistir dinheiro como inteiros em centavos;
- nunca confiar em autorização, plano ou entitlement enviados pelo frontend;
- usar **Zerou** como nome exibido ao usuário e nunca reintroduzir o nome provisório anterior;
- seguir a identidade de `BRAND-GUIDELINES.md` em toda superfície visual criada nesta fase;
- seguir `THEME-SYSTEM.md`: não hardcodar cores em componentes da interface autenticada e consumir somente tokens semânticos;
- corrigir erros encontrados dentro do escopo atual;
- atualizar `IMPLEMENTATION_STATUS.md` ao final;
- parar ao concluir o gate desta fase.


# Fase 4 — Espaço compartilhado

## Pré-condição

Fases 1 a 3 concluídas. O workspace pessoal deve permanecer privado e estável.

## Objetivo

Implementar workspace compartilhado para casal sem vazar dados pessoais: convite, membership, claims resumidos, aprovações básicas e acertos.

## Escopo permitido

### Convites

Implementar:

```text
createCoupleWorkspace()
createCoupleInvite()
previewCoupleInvite()
acceptCoupleInvite()
revokeCoupleInvite()
regenerateCoupleInvite()
leaveCoupleWorkspace()
removePartner()
cleanupExpiredInvites()
```

Requisitos:

- código amigável `DUO-7X4K-91`;
- excluir caracteres ambíguos `0`, `O`, `1`, `I`, `L`;
- salvar somente hash;
- validade padrão de 48h;
- uso único;
- revogável;
- novo código invalida anterior;
- rate limit;
- máximo de dois membros ativos;
- confirmação explícita;
- QR Code e link derivados do mesmo token lógico;
- preservar código pendente durante login/cadastro.

### Workspace compartilhado

- owner cria workspace `couple`;
- partner aceita convite;
- ambos leem e escrevem somente dados do casal autorizados;
- workspace pessoal de cada um permanece inacessível ao outro;
- remover parceiro ou sair exige confirmação e auditoria.

### SharedExpenseClaim

Implementar projeção segura para gasto do casal pago com fonte pessoal:

```text
sourceVisibility: 'summary_only'
```

Expor ao parceiro somente:

- descrição resumida;
- valor total;
- divisão;
- pagador;
- status;
- comentários associados ao claim.

Não expor:

- conta pessoal;
- cartão pessoal;
- invoice pessoal;
- histórico pessoal;
- notas pessoais;
- saldo pessoal.

### Acerto

Implementar:

- saldo por membro;
- composição resumida;
- proposta de acerto;
- reembolso total ou parcial;
- aceite;
- contestação simples;
- comentário;
- histórico;
- auditoria.

### Entitlement scaffold

A criação de workspace compartilhado deve consultar serviço central `canCreateCoupleWorkspace`. Enquanto billing real ainda não existir, usar catálogo local/dev controlado server-side e feature flag documentada. Não confiar no frontend.

## Fora do escopo

Não implementar:

- billing Stripe real;
- admin;
- automações;
- relatórios avançados;
- merge automático de usuários.

## Testes obrigatórios

### Convite

- convite válido aceita uma vez;
- convite expirado falha;
- convite revogado falha;
- convite reutilizado falha;
- terceiro membro falha;
- regenerar invalida anterior;
- logs não persistem token puro.

### Privacidade

- partner não lê workspace pessoal do owner;
- owner não lê workspace pessoal do partner;
- partner vê claim resumido;
- partner não recebe referência utilizável à fatura pessoal;
- Security Rules bloqueiam leitura cruzada;
- frontend não altera membership diretamente.

### Acerto

- claim aceito compõe saldo;
- acerto parcial reduz saldo corretamente;
- acerto total encerra pendência;
- retry não duplica pagamento ou histórico.

### E2E

Usar dois usuários distintos:

1. owner cria workspace casal;
2. owner gera convite;
3. partner aceita;
4. owner cria claim resumido;
5. partner visualiza resumo sem dados pessoais;
6. membros registram acerto.

## Gate de qualidade

```text
dois usuários distintos compartilham workspace casal,
registram claim e acerto,
mas nenhum consegue ler conta, cartão, fatura ou transação pessoal do outro.
```

## Entrega

Executar testes, corrigir, atualizar `IMPLEMENTATION_STATUS.md` e parar.
