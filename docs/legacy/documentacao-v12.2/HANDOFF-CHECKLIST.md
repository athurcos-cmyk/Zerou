# Zerou v12.2 — Checklist de handoff entre fases

Executar este checklist antes de iniciar qualquer prompt operacional.

# 1. Arquivos obrigatórios para o agente

- [ ] `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`
- [ ] `CONTRATOS-CANONICOS.md`
- [ ] `BRAND-GUIDELINES.md`
- [ ] `THEME-SYSTEM.md`
- [ ] `PRODUCT-COPY-CANONICAL.md`
- [ ] `IMPLEMENTATION_STATUS.md`
- [ ] prompt correspondente à fase atual
- [ ] repositório atualizado

Quando a fase tocar identidade visual, PWA, landing ou metadados:

- [ ] `BRAND-ASSET-INTEGRATION.md`
- [ ] assets aprovados copiados do pacote `zerou-brand-assets.zip`

# 2. Antes da execução

- [ ] confirmar qual fase está ativa;
- [ ] confirmar que a fase anterior passou no gate;
- [ ] registrar bloqueios externos reais;
- [ ] não executar duas fases no mesmo comando;
- [ ] não antecipar escopo pós-MVP.

# 3. Antes de aceitar a entrega

- [ ] testes obrigatórios da fase passaram;
- [ ] TypeScript strict sem erros;
- [ ] build local passou;
- [ ] nenhuma regra de segurança foi relaxada sem justificativa;
- [ ] nenhum mock permanente foi introduzido;
- [ ] `IMPLEMENTATION_STATUS.md` foi atualizado;
- [ ] ocorrências públicas do nome provisório anterior foram removidas;
- [ ] o agente parou ao concluir o gate;
- [ ] componentes visuais novos consomem tokens semânticos;
- [ ] nenhuma cor literal foi introduzida em componentes autenticados fora do registro central de temas;
- [ ] preferências de aparência continuam individuais, não vinculadas ao workspace.
