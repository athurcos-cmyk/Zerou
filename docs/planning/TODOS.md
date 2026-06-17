# Pendências e roadmap — Zerou

Itens acionáveis. Fechou? Mova para "Concluído" ou remova. Detalhe histórico vai para `../history/`.

## Abertas

### Produto / UX
- [ ] QA manual real no celular (cadastro, login, onboarding, conta, transação, conta a pagar, cartão, fatura, espaço do casal, cofrinho).
- [ ] Testar fim a fim o **cofrinho do casal** com 2 contas pareadas (guardar com e sem desconto de conta pessoal).
- [ ] Avaliar "resgatar do cofrinho de volta pra conta" e categoria fixa "Cofrinho".
- [ ] Dar a mesma voz de copy às páginas legais/ajuda, se fizer sentido.

### Técnico
- [ ] Code splitting — bundle inicial > 500 kB (warning no build).
- [ ] App Check, backups do Firestore, alertas de custo Firebase/Vercel.
- [ ] Corrigir Java local (erro 3221226505) para `npm run test:rules`.
- [ ] Domínio final + canonical/sitemap.
- [ ] Emails oficiais de suporte/privacidade.

### Automação server-side (futuro — exige worker/Functions)
- [ ] Fechar fatura automaticamente, gerar recorrências e lembretes sem depender do app aberto. Decidir entre Cloud Run (perto do Firestore) e Railway. Hoje só roda quando o usuário abre o app.

### Negócio / legal
- [ ] Revisão jurídica antes de escala pública maior.
- [ ] Billing real (Stripe) — só com decisão explícita de produto (hoje 100% gratuito).

## Concluído (recente)
- [x] Redesign Sol + app mobile-nativo (bottom-sheets, FAB, header de valor).
- [x] Cofrinho do casal (meta compartilhada + contribuições por pessoa).
- [x] Divisão flexível de despesa do casal (igual/%/valor).
- [x] Tela de Metas ligada ao questionário do onboarding.
- [x] Landing nova (CSS 3D) com copy de dor; promovida para `/`.
- [x] SVGs oficiais de ~24 bancos.
- [x] Sistema de documentação estilo plantão.
