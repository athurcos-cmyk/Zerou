# Auditoria LGPD — Zerou / Granativa

**Data**: 19 de julho de 2026
**Escopo**: docs/PRIVACY.md, docs/SECURITY.md, src/pages/LegalPages.tsx, src/settings/accountDeletionService.ts, src/privacy/, src/firebase/config.ts, docs/COSTS.md, firestore.rules, src/shared/sharedService.ts, docs/ai/GRAZI.md, src/types/contracts.ts
**Metodologia**: Revisão de documentação e código-fonte. Testes funcionais não realizados.
**Propósito**: Diagnóstico exclusivo. Nenhuma correção foi aplicada.

---

## Sumário Executivo

O projeto Zerou/Granativa demonstra maturidade notável em privacidade para um SaaS individual: a documentação legal (Termos, Política de Privacidade, Data Deletion) é extensa, cobre as bases legais da LGPD com clareza, e o isolamento técnico entre dados pessoais e do casal é sólido. No entanto, há **lacunas reais de conformidade** que expõem o controlador a riscos regulatórios, especialmente na **portabilidade de dados**, na **transferência internacional para a China (DeepSeek)** e na **ausência de DPO independente**.

---

## Achados

---

### ID: LGPD-01
**Título**: Ausência de DPO independente (conflito controlador/encarregado)
**Severidade**: Alta
**Local**: `src/pages/LegalPages.tsx` (linhas 108-109 da Política de Privacidade)
**Descrição**: O DPO (encarregado) é a mesma pessoa física que o controlador: Arthur Olimpio Lima, CPF 487.655.288-67. A LGPD (art. 41) exige que o encarregado seja indicado pelo controlador, mas a prática recomenda independência funcional. Um DPO que é o próprio titular do CPF que opera o serviço não tem independência para reportar incidentes, receber reclamações ou orientar a ANPD contra os próprios interesses do controlador.
**Cenário**: Um titular reclama à ANPD que seu pedido de exclusão não foi atendido. A ANPD contata o DPO, que é o próprio controlador, e deve decidir se aplica sanção a si mesmo.
**Impacto**: Risco reputacional e de sanção. A ANPD pode entender que não há canal independente e efetivo para tratamento de reclamações de titulares.
**Solução sugerida**: Nomear DPO distinto do controlador (pessoa física ou jurídica), ainda que terceirizado. Publicar canal exclusivo com garantia de resposta em 15 dias úteis. O e-mail `privacidade@granativa.com.br` já existe e está correto — a carência é de independência funcional, não de canal.
**Confiança**: 10/10

---

### ID: LGPD-02
**Título**: Portabilidade de dados (Art. 18, V) implementada apenas parcialmente
**Severidade**: Alta
**Local**: `src/finance/csvExport.ts`, `src/privacy/privacyRequests.ts`, `src/types/contracts.ts`
**Descrição**: O CSV export (`csvExport.ts`) cobre APENAS transações (`Transaction[]`), usando cabeçalho `Data;Tipo;Descrição;Categoria;Conta;Valor;Tags`. Não exporta contas, cartões de crédito, faturas, ledger de fatura, contas a pagar, recorrências, metas, orçamentos, dados do espaço compartilhado, nem informações de perfil. O tipo `PrivacyRequestType` inclui `'export'` mas não é implementado na UI — não há botão de exportação na interface do usuário, apenas no `SearchPage` para transações mensais.
**Cenário**: Um titular exerce o direito de portabilidade (Art. 18, V) solicitando todos os seus dados em formato estruturado. O controlador só consegue entregar transações em CSV, e mesmo assim apenas 300 (limitadas pelo `subscribeTransactions` com `limit(300)`).
**Impacto**: Descumprimento do Art. 18, V — o titular tem direito a receber seus dados completos em formato estruturado e interoperável. A lei não limita o escopo da portabilidade a transações.
**Solução sugerida**: (1) Expandir CSV export para cobrir todas as coleções do workspace. (2) Expor botão de "Exportar dados" no PrivacyCenterPage ou Settings. (3) Considerar formato JSON completo com envelope padronizado. (4) Garantir que exportação inclua dados do workspace pessoal E do workspace compartilhado.
**Confiança**: 10/10

---

### ID: LGPD-03
**Título**: Transferência internacional de dados para China (DeepSeek) sem salvaguardas documentadas e auditáveis
**Severidade**: Crítica
**Local**: `docs/ai/GRAZI.md`, `src/pages/LegalPages.tsx` (seção 7 da Política de Privacidade)
**Descrição**: DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd., China) processa dados financeiros dos usuários. A cada mensagem da Grazi, um resumo contextual com saldos, transações, categorias, contas a pagar, faturas e orçamentos é enviado para servidores na China. A política de privacidade (seção 7) menciona a DeepSeek e informa o titular, mas:
- A China NÃO tem decisão de adequação da ANPD (art. 33, I)
- A política diz que a Granativa "exige, na máxima extensão possível: cláusulas contratuais padrão de proteção de dados" — sem evidência de que a DeepSeek fornece ou assina DPAs com cláusulas LGPD
- A seção 7.3 diz que o uso das funcionalidades constitui consentimento para transferência internacional ("você é previamente informado e consente") — mas o consentimento para WhatsApp/Grazi é granular apenas para a funcionalidade, não para a transferência internacional especificamente
- Empresas chinesas estão sujeitas à Lei de Inteligência Nacional da China que pode obrigar a entrega de dados mesmo sem DPA
**Cenário**: Usuário ativa a Grazi, faz perguntas sobre sua vida financeira, e dados financeiros completos (saldos, gastos, faturas) são enviados para servidores na China. Em caso de requisição governamental chinesa, não há garantia contratual que proteja os dados.
**Impacto**: Risco jurídico grave. A ANPD pode considerar a transferência ilegal por falta de salvaguardas adequadas (Art. 33). Risco de sanção (Art. 52): multa de até 2% do faturamento ou R\$ 50 milhões.
**Solução sugerida**: (1) Obter DPA assinado pela DeepSeek com cláusulas contratuais padrão adaptadas à LGPD. (2) Se não for possível, avaliar provedores alternativos com data centers no Brasil (ex.: Azure OpenAI) ou pelo menos nos EUA com SCCs. (3) Reforçar o consentimento para transferência internacional como etapa separada e explícita, não embutida no consentimento da funcionalidade. (4) Documentar a análise de impacto (RIPD) específica para essa transferência.
**Confiança**: 9/10 — a ausência de DPA com DeepSeek é inferida pela falta de documentação, não confirmada. Pode existir e não estar documentada.

---

### ID: LGPD-04
**Título**: Ausência de interface de usuário para exercício de direitos LGPD (Art. 18)
**Severidade**: Alta
**Local**: `src/pages/PrivacyCenterPage.tsx`, `src/privacy/privacyRequests.ts`
**Descrição**: A página `PrivacyCenterPage.tsx` existe, é pública, tem links para a política de privacidade, espaço compartilhado e segurança, mas NÃO oferece:
- Botão para solicitar portabilidade/exportação
- Botão para solicitar correção de dados
- Botão para revogar consentimento de marketing (consentimento geral)
- Botão para solicitar exclusão (a exclusão está em Settings > Security > Login Methods, enterrada)
O arquivo `src/privacy/privacyRequests.ts` implementa a função `createPrivacyRequest()` que grava no Firestore (`privacyRequests/{id}`) com tipo (`correction`, `export`, `deletion`, `marketing_revocation`, `cache_help`), mas esta função NÃO É CHAMADA em lugar nenhum da UI — não há formulário ou fluxo que a invoque. Ou seja, o backend para receber solicitações LGPD existe, mas o frontend não expõe.
**Cenário**: Um titular quer corrigir um dado pessoal ou saber com quem seus dados foram compartilhados. A política diz "envie e-mail para privacidade@granativa.com.br". Não há formulário no app, não há confirmação de recebimento, não há acompanhamento do status.
**Impacto**: A LGPD (Art. 18) determina que o titular possa exercer os direitos de forma facilitada. Depender exclusivamente de e-mail sem confirmação automática ou UI pode ser considerado barreira. Além disso, o sistema de privacy requests já construído e não utilizado representa desperdício de desenvolvimento.
**Solução sugerida**: (1) Conectar `createPrivacyRequest` a um formulário na `PrivacyCenterPage` ou nas configurações do app. (2) Exibir histórico de solicitações e status. (3) Implementar confirmação automática de recebimento. (4) Menu de "Privacidade" no app com acesso fácil.
**Confiança**: 10/10

---

### ID: LGPD-05
**Título**: Ausência de procedimento formal de notificação à ANPD em 3 dias úteis (Art. 48)
**Severidade**: Média
**Local**: `docs/SECURITY.md` (seção "Incident Response")
**Descrição**: O incident response documentado tem 6 passos genéricos: pausar marketing, preservar logs, rodar secrets, publicar regras de emergência, notificar usuários, registrar timeline. A LGPD Art. 48 exige que o controlador **comunique à ANPD e ao titular** em **prazo razoável** (regulamentação da ANPD especifica **3 dias úteis** para incidentes com risco ou dano relevante). Não há:
- Template de notificação à ANPD
- Critérios objetivos para determinar o que é "risco ou dano relevante"
- Procedimento de avaliação de gravidade (prazo de 3 dias corre mesmo para incidentes pequenos, a diferença é no conteúdo)
- Plano de comunicação com titulares (conteúdo da mensagem, canal, cronograma)
**Cenário**: Vazamento de dados financeiros de 50 usuários. O controlador leva 15 dias para perceber a gravidade, e notifica a ANPD no 20º dia. A ANPD aplica multa por descumprimento do Art. 48.
**Impacto**: Sanção administrativa por omissão ou atraso na comunicação. Multa de até 2% do faturamento.
**Solução sugerida**: (1) Adicionar template de notificação à ANPD e ao titular. (2) Definir critérios de "incidente notificável" (ex.: qualquer acesso não autorizado a Firestore com dados financeiros). (3) Criar checklist de avaliação de gravidade nas primeiras 24h. (4) Manter contato de emergência da ANPD documentado.
**Confiança**: 10/10

---

### ID: LGPD-06
**Título**: Retenção de dados em backups por até 90 dias sem justificativa legal específica
**Severidade**: Média
**Local**: `src/pages/LegalPages.tsx` (seção 8.3 da Política de Privacidade, seção "Prazo" do Data Deletion)
**Descrição**: A política informa que "dados em backups poderão levar até 90 (noventa) dias para serem completamente eliminados dos sistemas de armazenamento." Este prazo parece razoável do ponto de vista técnico (backups point-in-time do Firestore), mas:
- Não é informado se há justificativa legal específica para os 90 dias
- A LGPD Art. 16 permite conservação apenas para: cumprimento de obrigação legal, pesquisa (anonimizados), transferência a terceiros (com consentimento), uso exclusivo do controlador (anonimizados)
- Manter dados em backup por 90 dias após a exclusão pode ser tecnicamente necessário, mas a política precisa deixar claro que: (a) são backups criptografados, (b) não são acessíveis operacionalmente, (c) serão sobrescritos naturalmente pelo ciclo de retenção do Firestore
**Cenário**: Um titular solicita exclusão, a conta é apagada do Firestore ativo, mas dados financeiros podem estar em snapshots de backup por 90 dias sem garantias adicionais de isolamento.
**Impacto**: Risco de interpretação pela ANPD como manutenção desnecessária de dados pessoais após o término da finalidade (Art. 15).
**Solução sugerida**: (1) Documentar na política que backups point-in-time são parte da infraestrutura do Firestore, são criptografados, e não são acessíveis para processamento. (2) Informar o prazo real de retenção de backups (Firestore PITR padrão = 7 dias, extended = 14 dias; backups manuais = 90 dias é possível mas confirmar configuração). (3) Diferenciar entre retenção operacional vs. retenção em backup.
**Confiança**: 7/10 — o prazo pode ser impreciso. A configuração real de retenção de backups do Firestore precisa ser verificada no console GCP.

---

### ID: LGPD-07
**Título**: Ausência de Relatório de Impacto à Proteção de Dados (RIPD) — Art. 38
**Severidade**: Alta
**Local**: Todo o projeto
**Descrição**: Não há evidência de RIPD em nenhum documento do projeto. A LGPD Art. 38 e a Resolução CD/ANPD nº 2/2022 determinam que o controlador elabore RIPD para operações de tratamento que possam gerar **altos riscos** — incluindo:
- Tratamento de dados sensíveis (o app trata dados financeiros, que embora não sejam "sensíveis" no Art. 5º, II, são de **alto risco para o titular**: qualquer vazamento expõe a vida financeira completa)
- Uso de IA (Grazi) que toma decisões baseadas em perfil financeiro (Art. 20)
- Vigilância ou monitoramento sistemático em larga escala
**Cenário**: A ANPD solicita o RIPD em uma investigação. O controlador não tem o documento. Isso agrava qualquer outra infração.
**Impacto**: Multa agravada. O RIPD é exigível e sua ausência é um indicador de não conformidade sistemática.
**Solução sugerida**: Elaborar RIPD documentando: (1) descrição dos dados tratados, (2) finalidades e bases legais, (3) riscos específicos (vazamento financeiro, invasão de privacidade do casal, exposição de dados no exterior), (4) medidas de mitigação. O RIPD pode ser interno (não precisa ser publicado), mas deve existir.
**Confiança**: 10/10

---

### ID: LGPD-08
**Título**: Exclusão de dados incompleta — dados em cache local (IndexedDB + localStorage) não são limpos automaticamente
**Severidade**: Média
**Local**: `src/settings/accountDeletionService.ts`, `src/privacy/cookieConsent.ts`
**Descrição**: O `deleteAccountData()` apaga documentos no Firestore e faz logout, mas não limpa explicitamente:
- IndexedDB (Firestore cache local — `persistentLocalCache`)
- localStorage (cookie consent, theme preferences, dashboard view cache, profile cache)
- Cache do Service Worker (PWAs assets)
Um usuário que usa dispositivo compartilhado (ex.: computador da família) e exclui a conta pode deixar resquícios de dados financeiros no cache local do navegador. Embora o logout dispare `clearIndexedDbPersistence` (SECURITY.md menciona "Logout pode limpar persistência"), não há confirmação de que isso cobre o cache do Firestore offline + localStorage.
**Cenário**: Um casal usa o mesmo computador. Um deles exclui a conta — a exclusão apaga os dados do Firestore, mas o cache local do navegador ainda pode conter dados financeiros no IndexedDB até expirar ou ser sobrescrito.
**Impacto**: Risco de violação de privacidade em dispositivos compartilhados. O titular pode acreditar que seus dados foram completamente removidos.
**Solução sugerida**: (1) No fluxo de exclusão de conta, adicionar `clearIndexedDbPersistence()` se disponível. (2) Limpar localStorage para chaves da aplicação. (3) Limpar caches do Service Worker. (4) Documentar no Data Deletion page que o usuário também deve limpar o cache manualmente em dispositivos compartilhados.
**Confiança**: 8/10 — `clearIndexedDbPersistence` pode não funcionar em todas as situações (o Firestore precisa estar inicializado, e após o logout o SDK pode já ter fechado a conexão).

---

### ID: LGPD-09
**Título**: Consentimento para transferência internacional (DeepSeek e WhatsApp) não é granular nem específico
**Severidade**: Alta
**Local**: `src/pages/LegalPages.tsx` (seções 7 e 13 da Política de Privacidade)
**Descrição**: A política de privacidade menciona na seção 7.3 que "ao utilizar funcionalidades que envolvam fornecedores com infraestrutura fora do Brasil (WhatsApp, DeepSeek), você é previamente informado e consente com a transferência internacional." No entanto:
- O consentimento para WhatsApp é granular (coletado no momento da vinculação)
- O consentimento para Grazi é implícito (acessar a aba "Assistente" = consentimento)
- NENHUM dos dois fluxos informa EXPLICITAMENTE que os dados serão transferidos para a China (DeepSeek) ou EUA (Meta/WhatsApp) como parte do consentimento
- A LGPD Art. 33, VIII exige consentimento "específico e destacado" para transferência internacional. O consentimento para a funcionalidade (WhatsApp/Grazi) não equivale automaticamente ao consentimento para transferência internacional
- Para a DeepSeek, a situação é agravada: o país de destino (China) não tem decisão de adequação (Art. 33, I), então as alternativas são: cláusulas contratuais (Art. 33, III) OU consentimento específico (Art. 33, VIII). Sem DPA (LGPD-03) e sem consentimento específico, a transferência pode ser ilegal
**Cenário**: Usuário acessa a Grazi, faz perguntas. A política informa no site que dados vão para a DeepSeek, mas o fluxo de ativação não reforça isso. Usuário alega que não sabia que dados financeiros saíam do Brasil.
**Impacto**: Transferência internacional sem base legal válida. Risco de multa e obrigação de suspender a funcionalidade.
**Solução sugerida**: (1) No momento de ativação da Grazi (primeiro acesso à aba), exibir consentimento explícito informando: "Seus dados financeiros serão processados pela DeepSeek, empresa localizada na China, para gerar respostas da assistente. Para continuar, confirme que concorda com esta transferência internacional." (2) Fazer o mesmo para a vinculação do WhatsApp, informando que os dados trafegam pelos servidores da Meta (EUA). (3) Registrar o consentimento no Firestore com timestamp.
**Confiança**: 9/10

---

### ID: LGPD-10
**Título**: Ausência de verificação de idade e consentimento parental (Art. 14 da LGPD)
**Severidade**: Média
**Local**: `src/pages/RegisterPage.tsx`, `src/pages/LegalPages.tsx` (seção 11)
**Descrição**: A política de privacidade (seção 11) está bem redigida sobre menores: proíbe menores de 16, exige consentimento parental para 16-18, fornece canal para responsáveis. No entanto:
- **Não há verificação de idade no cadastro** — qualquer pessoa que digitar uma data de nascimento que aponte maioridade passa
- **Não há bloqueio técnico** para menores de 16
- **Não há fluxo de consentimento parental** para adolescentes 16-18
- O app processa dados financeiros, que são dados de alto risco; a coleta de dados de adolescentes sem consentimento parental viola o Art. 14
- Embora o público-alvo (organização financeira) torne improvável a presença de menores, a ausência de qualquer barreira técnica é um risco
**Cenário**: Um adolescente de 15 anos cria conta (não há verificação), organiza finanças pessoais, vincula WhatsApp. Pai descobre e reclama à ANPD. A Granativa não tinha como saber que o titular era menor e não solicitou consentimento.
**Impacto**: Sanção por tratamento ilícito de dados de criança/adolescente (Art. 14 c/c Art. 52).
**Solução sugerida**: (1) Adicionar campo de data de nascimento no cadastro (mínimo). (2) Bloquear cadastro para < 16 anos. (3) Para 16-18, implementar fluxo de consentimento parental (e-mail de confirmação ao responsável). (4) Documentar a verificação na política.
**Confiança**: 10/10

---

### ID: LGPD-11
**Título**: Ausência de botão de "Revogar consentimento" geral e visível
**Severidade**: Média
**Local**: `src/pages/PrivacyCenterPage.tsx`, `src/settings/`
**Descrição**: A LGPD Art. 18, IX garante ao titular o direito de "revogação do consentimento a qualquer momento, de forma gratuita e facilitada." O app permite:
- Desvincular WhatsApp (Settings > WhatsApp > Desvincular) — OK
- Deixar de usar a Grazi (não acessar a aba) — frágil, não é revogação formal
- Excluir conta (Settings > Security > Login Methods) — medida extrema
Mas não há:
- Um local centralizado "Meus consentimentos" onde o titular veja o que consentiu e possa revogar
- Revogação formal do consentimento para funcionalidades de IA (Grazi) — "parar de usar" não equivale a revogação
- Confirmação por e-mail após revogação
**Cenário**: O titular quer revogar apenas o consentimento da Grazi (não quer mais IA analisando seus dados), mas não quer desvincular WhatsApp nem excluir conta. O app não oferece essa opção — basta não acessar a aba. Mas o dado já foi compartilhado com a DeepSeek no passado, e não há registro de revogação.
**Impacto**: Descumprimento do Art. 18, IX (revogação facilitada) e Art. 8º, §5º (consentimento deve ser revogável a qualquer momento).
**Solução sugerida**: (1) Criar seção "Meus consentimentos" dentro de Configurações > Privacidade. (2) Listar todos os consentimentos ativos (WhatsApp, Grazi, Analytics). (3) Para cada um, botão "Revogar" que registra no Firestore (`privacyRequests` ou coleção de consentimentos). (4) Enviar e-mail de confirmação da revogação.
**Confiança**: 10/10

---

### ID: LGPD-12
**Título**: Analytics consent está desligado por padrão (correto), mas não há UI para o titular alterar
**Severidade**: Baixa
**Local**: `src/privacy/cookieConsent.ts`, `src/firebase/config.ts`, `src/pages/`
**Descrição**: O analytics começa desligado por padrão (cookieConsent.ts linha 19: `analytics: false`), e só inicializa se o usuário consentir (`hasAnalyticsConsent()` em config.ts). A política de privacidade (seção 12) documenta corretamente. O teste e2e (public.spec.ts) verifica que nenhuma requisição de analytics é feita no carregamento inicial. Isto é exemplar.
No entanto, o titular não tem como ALTERAR essa preferência — não há botão ou link "Preferências de cookies" em lugar nenhum do app ou das páginas públicas. O evento `OPEN_COOKIE_PREFERENCES_EVENT` existe (`cookieConsent.ts` linha 78-80) mas nenhum listener consome.
**Cenário**: Um titular que aceitou analytics e depois mudou de ideia não encontra onde desativar. Um titular que nunca foi perguntado e quer ativar analytics para melhorar o app também não encontra.
**Impacto**: Baixo, pois analytics começa desligado. Mas viola o princípio de transparência e controle (Art. 6º, VI) se o titular não consegue gerenciar suas preferências.
**Solução sugerida**: (1) Adicionar link "Preferências de cookies" no rodapé das páginas públicas ou nas Configurações do app. (2) Ao clicar, abrir modal/dispatcher com as 3 categorias (necessários, preferências, analytics). (3) Disparar evento `OPEN_COOKIE_PREFERENCES_EVENT` se já houver listener. (4) Atualizar o Firebase Analytics inicialização conforme mudança de preferência.
**Confiança**: 10/10

---

### ID: LGPD-13
**Título**: Isolamento pessoal↔casal bem implementado tecnicamente
**Severidade**: Informativa (ponto forte)
**Local**: `firestore.rules` (linhas 1118-1120, 1154-1176, 1424-1455), `src/shared/sharedService.ts` (linha 503: `sourceVisibility: 'summary_only'`), `src/types/contracts.ts` (linha 386)
**Descrição**: O isolamento entre dados pessoais e do casal é sólido:
- Workspaces pessoais têm ID baseado no userId do usuário
- Workspaces de casal seguem padrão `couple_` (validado em `firestore.rules` linha 1154)
- Claims têm `sourceVisibility: 'summary_only'` fixo no schema — **nunca** expõem dados de transações individuais, só valores agregados
- `firestore.rules` linhas 1424-1455 validam que cada `sharedExpenseClaim` é criado com `sourceVisibility == 'summary_only'` — nem o cliente consegue mudar
- A regra `canDeleteWorkspaceTree` (linha 1131-1137) bloqueia exclusão de dados do workspace do casal por um membro sozinho quando há parceiro ativo
- `accountDeletionService.ts` trata corretamente: workspaces onde o usuário é owner são deletados; workspaces onde é partner são tratados como saída
- CLAUDE.md regra explícita: "Dados financeiros pessoais nunca vazam para o espaço do casal"
**Impacto**: Positivo. A arquitetura e as regras estão corretas para evitar vazamento de dados pessoais para o parceiro.
**Solução sugerida**: Manter. Documentar formalmente este isolamento na política de privacidade (já está, seção 6.3).
**Confiança**: 10/10

---

### ID: LGPD-14
**Título**: Histórico de conversas da Grazi não é persistido permanentemente (correto), mas não há garantia contratual com DeepSeek sobre retenção zero
**Severidade**: Alta
**Local**: `docs/ai/GRAZI.md`, `src/pages/LegalPages.tsx` (seção 8.3, 13.3)
**Descrição**: A política informa que a DeepSeek não armazena, treina ou retém o conteúdo após o processamento (seção 6.2.d). O GRAZI.md diz que a função `buildFinancialContext` monta um resumo de até 5000 chars e envia para a DeepSeek a cada pergunta. No entanto:
- A política diz "sem armazenamento, treinamento ou retenção do conteúdo pela DeepSeek após o processamento" — o que é uma afirmação forte que exige garantia contratual
- Não há evidência de que DeepSeek fornece compromisso formal de retenção zero (não treinar modelos com dados dos usuários)
- A API da DeepSeek, por padrão, não retém dados (segundo seus termos), mas a política da DeepSeek pode mudar sem aviso
- Um resumo de 5000 chars com dados financeiros agregados é enviado a cada chamada, e a Cloud Function não tem cache — toda pergunta é uma nova chamada
- O histórico de conversa (até 10 entradas, 4000 chars cada) também é enviado (`financialAssistant.ts`)
**Cenário**: DeepSeek altera sua política de retenção e passa a armazenar dados de entrada por 30 dias para melhoria de modelo. A Granativa não tem contrato que impeça.
**Impacto**: Dados financeiros agregados de todos os usuários da Grazi podem ser retidos por terceiro na China sem garantias LGPD.
**Solução sugerida**: (1) Obter compromisso contratual da DeepSeek (ou avaliar provedor alternativo) sobre não retenção. (2) Adicionar cláusula no Termos/Privacidade que o provedor de IA pode mudar, mas a Granativa se compromete a notificar em 15 dias. (3) Considerar cache de contexto (como já listado em pendências do GRAZI.md) para reduzir número de chamadas. (4) Documentar a política de retenção real da DeepSeek.
**Confiança**: 8/10 — a afirmação de "sem retenção" pode estar baseada nos termos públicos da DeepSeek, mas não há contrato assinado.

---

### ID: LGPD-15
**Título**: Dados financeiros via WhatsApp podem ser processados pela Meta sem consentimento claro do titular
**Severidade**: Média
**Local**: `src/pages/LegalPages.tsx` (seção 7)
**Descrição**: A integração WhatsApp usa a API oficial da Meta (WhatsApp Cloud API). Ao vincular o WhatsApp, o usuário envia um código de verificação de 6 dígitos. A política informa que os dados trafegam conforme a Política de Dados da Meta. No entanto:
- Não há aviso explícito no fluxo de vinculação de que dados estarão sujeitos à Política de Dados da Meta (Facebook)
- A Política de Dados da Meta permite uso de dados para melhoria de produtos Meta (embora para WhatsApp Business API haja restrições)
- Usuários brasileiros podem não saber que mensagens enviadas a um bot do WhatsApp são processadas pela Meta, mesmo que criptografadas em trânsito
- O Art. 33 (transferência internacional) se aplica: Meta é empresa americana
**Cenário**: Usuário vincula WhatsApp para lançar gastos. As mensagens contêm dados financeiros. Meta processa essas mensagens. Usuário não foi informado no momento da vinculação que a Meta teria acesso ao conteúdo.
**Impacto**: Violação do Art. 8º (consentimento deve ser específico e informado) e Art. 33 (transferência internacional).
**Solução sugerida**: (1) No fluxo de vinculação do WhatsApp, exibir aviso: "Suas mensagens serão processadas pela Meta (WhatsApp Cloud API) e pela DeepSeek. A Meta está sediada nos Estados Unidos e segue sua própria Política de Privacidade." (2) Exigir confirmação explícita. (3) Registrar consentimento no Firestore.
**Confiança**: 9/10

---

### ID: LGPD-16
**Título**: Direito de oposição (Art. 18, XI) não implementado
**Severidade**: Média
**Local**: `src/pages/LegalPages.tsx` (seção 10, item XI), `src/privacy/privacyRequests.ts`
**Descrição**: A política de privacidade lista "oposição a tratamento realizado com fundamento em descumprimento da LGPD" como direito do titular (item XI). No entanto, o tipo `PrivacyRequestType` NÃO inclui `'opposition'`. Não há fluxo para exercer oposição, seja por UI ou por função de backend.
**Cenário**: Um titular quer se opor ao tratamento de dados com base em legítimo interesse (segurança, por exemplo). O canal informado é e-mail, mas não há confirmação de recebimento, não há sistema de acompanhamento.
**Impacto**: O direito está listado na política mas não tem implementação técnica, nem mesmo a função de criar requisição existe para este tipo.
**Solução sugerida**: (1) Adicionar `'opposition'` ao enum `PrivacyRequestType`. (2) Adicionar seção no PrivacyCenterPage para oposição. (3) Implementar fluxo de resposta.
**Confiança**: 10/10

---

### ID: LGPD-17
**Título**: Dados financeiros são mantidos "enquanto a conta estiver ativa" — prazo de retenção vago para obrigações legais
**Severidade**: Baixa
**Local**: `src/pages/LegalPages.tsx` (seção 8.2)
**Descrição**: A política de privacidade (seção 8.2) informa que dados financeiros são mantidos "enquanto a conta estiver ativa". Depois da exclusão, são removidos "observados os prazos legais de retenção obrigatória", mas não especifica quais prazos legais se aplicam a dados financeiros pessoais de um app de organização financeira que não é instituição financeira.
**Cenário**: A Lei 12.527 (LAI) ou a legislação tributária podem exigir prazos específicos para certos registros. O app não informa ao titular quais são esses prazos.
**Impacto**: Baixo, pois a exclusão convencional remove os dados. O risco é retenção desnecessária por excesso de cautela sem lastro legal.
**Solução sugerida**: (1) Especificar quais obrigações legais podem exigir retenção (ex.: 5 anos para tributos federais — mas isso não se aplica aos dados do app). (2) Se não há obrigação legal que justifique retenção pós-exclusão, informar que os dados são completamente removidos. (3) Documentar o prazo de retenção de backups (7 dias padrão Firestore PITR).
**Confiança**: 5/10 — o prazo de retenção por "obrigação legal" pode ser aplicável em cenários improváveis para este tipo de app.

---

### ID: LGPD-18
**Título**: Onboarding coleta objetivo financeiro e desafio pessoal — sem classificação como dado sensível, mas com implicações de perfilamento
**Severidade**: Informativa
**Local**: `docs/ai/GRAZI.md` (seção "SEU CICLO"), `onboardingOptions.tsx`
**Descrição**: O onboarding coleta `onboardingGoal` e `onboardingChallenge` (objetivo financeiro e desafio pessoal, ex.: "quitar dívidas", "emergência", etc.). Esses dados são enviados no contexto para a Grazi/DeepSeek como parte do prompt de sistema. Não são dados sensíveis per se (Art. 5º, II), mas:
- São dados comportamentais/financeiros pessoais que revelam perfil econômico
- São usados para personalizar respostas de IA (perfilamento, Art. 20)
- O titular pode não saber que seu "desafio financeiro" declarado é compartilhado com servidores na China
- O GRAZI.md documenta que ids desconhecidos são ignorados (não vazam crus), e que o prompt instrui a IA a tratar como "tempero de tom, não fato garantido" — boas práticas
**Impacto**: Baixo. O dado é voluntário e informado. Mas o perfilamento via IA com esses dados deve ser transparente.
**Solução sugerida**: (1) Informar no onboarding que respostas serão usadas para personalizar a assistente de IA (Grazi). (2) Se o titular não usa a Grazi, o onboarding continua sendo coletado mas não compartilhado — documentar isso.
**Confiança**: 6/10

---

## Resumo de Achados

| ID | Título | Severidade | Confiança |
|---|---|---|---|
| LGPD-01 | DPO sem independência funcional | Alta | 10 |
| LGPD-02 | Portabilidade parcial (só transações em CSV) | Alta | 10 |
| LGPD-03 | DeepSeek (China) sem salvaguardas documentadas | **Crítica** | 9 |
| LGPD-04 | UI de direitos LGPD não implementada (código existe, não usado) | Alta | 10 |
| LGPD-05 | Notificação à ANPD sem procedimento formal de 3 dias | Média | 10 |
| LGPD-06 | Retenção em backups sem justificativa específica | Média | 7 |
| LGPD-07 | RIPD não elaborado | Alta | 10 |
| LGPD-08 | Cache local não limpo na exclusão de conta | Média | 8 |
| LGPD-09 | Consentimento de transferência internacional não granular | Alta | 9 |
| LGPD-10 | Verificação de idade ausente (menores) | Média | 10 |
| LGPD-11 | Revogação de consentimento sem UI centralizada | Média | 10 |
| LGPD-12 | Analytics consent sem UI de alteração (começa desligado — correto) | Baixa | 10 |
| LGPD-13 | Isolamento pessoal↔casal bem implementado | Informativa | 10 |
| LGPD-14 | Retenção zero da DeepSeek sem garantia contratual | Alta | 8 |
| LGPD-15 | WhatsApp/Meta sem consentimento explícito de transferência | Média | 9 |
| LGPD-16 | Direito de oposição (Art. 18, XI) sem implementação | Média | 10 |
| LGPD-17 | Prazo de retenção pós-exclusão genérico | Baixa | 5 |
| LGPD-18 | Perfilamento via onboarding + Grazi sem transparência total | Informativa | 6 |

## Prioridades de Remediação

### Crítico (ação imediata)
1. **LGPD-03**: DeepSeek/Criar salvaguarda contratual para transferência Brasil-China OU substituir provedor. Sem isso, o processamento de dados financeiros por IA na China está sem base legal na LGPD.

### Alto (ação em 30 dias)
2. **LGPD-07**: Elaborar RIPD. É exigível e sua ausência agrava todas as outras infrações.
3. **LGPD-04 + LGPD-11**: Expor `createPrivacyRequest` na UI. O código existe e não é usado. Centralizar consentimentos em uma tela "Meus consentimentos".
4. **LGPD-02**: Expandir CSV export para todas as coleções ou adotar JSON completo.
5. **LGPD-14**: Obter garantia contratual de retenção zero da DeepSeek.
6. **LGPD-09**: Adicionar consentimento explícito de transferência internacional nos fluxos Grazi e WhatsApp.

### Médio (ação em 60 dias)
7. **LGPD-01**: Separar DPO do controlador (pode ser serviço terceirizado de DPO as a Service).
8. **LGPD-05**: Template de notificação ANPD em 3 dias úteis.
9. **LGPD-10**: Verificação de idade no cadastro.
10. **LGPD-16**: Adicionar `opposition` a `PrivacyRequestType`.

### Baixo (ação contínua)
11. **LGPD-08**: Limpeza de cache local na exclusão.
12. **LGPD-12**: UI de preferências de cookies.
13. **LGPD-06**: Especificar prazos reais de retenção de backup.

---

## Notas Finais

- O Zarou/Granativa está em posição **acima da média** para um SaaS individual: os documentos legais são completos e bem redigidos, o isolamento de dados é sólido, analytics começa desligado, a exclusão de conta tem testes unitários que cobrem casos de borda (sessão zumbi, reautenticação, etc.).
- O maior risco é a **DeepSeek (China)** — a combinação de dados financeiros com processamento em país sem acordo LGPD e sem contrato formal de proteção de dados é a vulnerabilidade mais grave identificada.
- O código morto em `privacyRequests.ts` (backend pronto, frontend não usa) é um desperdício de trabalho anterior que precisa ser conectado.
- A documentação legal está datada de **15 de julho de 2026**, o que é recente e demonstra manutenção ativa.
