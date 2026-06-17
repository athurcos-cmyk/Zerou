# Documentação do Zerou

Documentação organizada para reduzir contexto inicial. Os arquivos de entrada ficam curtos; o detalhe vai para `docs/` e é lido sob demanda.

## Estrutura

| Pasta / arquivo | Conteúdo |
|---|---|
| `docs/BUSCA_RAPIDA.md` | Mapa para achar assunto sem abrir doc grande |
| `docs/history/` | Histórico separado por mês (`YYYY-MM.md`) |
| `docs/design/` | Design system "Sol" e decisões visuais |
| `docs/planning/` | Pendências e roadmap |
| `docs/qa/` | Estratégia de testes, QA e comandos |
| `docs/PRODUCTION_CHECKLIST.md` | Checklist de produção |
| `docs/BILLING.md`, `docs/BOOTSTRAP_FIREBASE_STRIPE.md` | Billing futuro (inativo) |
| `docs/MANUAL_SETUP_REQUIRED.md` | Setup manual de infraestrutura |
| `docs/legal/` | Materiais legais |
| `docs/ARCHITECTURE.md` | Visão técnica/arquitetura |
| `docs/SECURITY.md`, `docs/PRIVACY.md` | Segurança e privacidade (LGPD) |
| `docs/RUNBOOK.md` | Operação e deploy |
| `docs/HANDOFF-PARA-CLAUDE.md`, `docs/README-START-HERE.md` | Handoff legado (substituídos por `SESSAO.md`/`CLAUDE.md`) |

## Arquivos de entrada (na raiz)

- `SESSAO.md`: brief curto do estado atual do projeto.
- `CHANGELOG.md`: resumo das últimas mudanças.
- `CLAUDE.md` / `CODEX.md`: instruções para agentes (regra de docs, stack, restrições).
- `docs/BUSCA_RAPIDA.md`: mapa para achar assunto sem carregar histórico grande.

## Referência técnica

`docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/PRIVACY.md` e `docs/RUNBOOK.md` são referência sob demanda — mapeados em `BUSCA_RAPIDA.md`. A raiz fica só com os arquivos de entrada (`README`, `CLAUDE`, `CODEX`, `SESSAO`, `CHANGELOG`).

## Como atualizar histórico

1. Resumo curto em `../CHANGELOG.md`.
2. Detalhe no mês correto em `history/YYYY-MM.md`.
3. Se criar nova área de docs ou mudar caminhos, atualize `BUSCA_RAPIDA.md`.
4. Regra completa de quando atualizar cada arquivo: `../CLAUDE.md`.
