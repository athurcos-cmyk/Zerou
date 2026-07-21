# Decisões Pendentes do Dono — Auditoria 2026-07-19

Estes itens exigem decisão de produto/negócio/jurídico/marca antes de qualquer código.
Estão documentados aqui para o dono revisar; NADA foi implementado sem aprovação.

---

## Segurança

### [DONO] Rotacionar tokens do WhatsApp (SECRETS-1)
- **O quê**: `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_VERIFY_TOKEN` existem no working copy (`functions/.env.zerou-26757`) e ficaram unstaged até agora. O arquivo foi removido do tracking (git rm --cached), mas os tokens ainda são os mesmos.
- **Ação**: Gerar novo token no painel Meta (Business Settings → System Users → Granativa API → Generate token) e atualizar `WHATSAPP_ACCESS_TOKEN`. Mudar também `WHATSAPP_VERIFY_TOKEN`.
- **Risco**: Se alguém teve acesso ao repositório, os tokens atuais estão comprometidos.

### [DONO] Deploy das regras do Firestore (FUNCTIONS-CRIT-002)
- **O quê**: A regra `whatsappPhoneIndex` foi alterada para `allow read: if isAdmin()`.
- **Ação**: `npx firebase deploy --only firestore:rules --project zerou-26757`
- **Impacto**: Bloqueia leitura de números de telefone do WhatsApp por qualquer usuário autenticado.

### [DONO] Configurar WHATSAPP_APP_SECRET para HMAC (WHATSAPP-01)
- **O quê**: A validação HMAC do webhook precisa ser reativada. Requer o App Secret do painel Meta.
- **Ação**: Obter App Secret em Meta App Settings → Basic → App Secret. O código já está preparado.
- **Impacto**: Sem HMAC, qualquer POST no webhook é processado (risco atual).

### [DONO] Deploy das Cloud Functions com correções (WHATSAPP-01/02/04/05, GRAZI-2/3, SECRETS-2)
- **O quê**: Várias correções nas Cloud Functions (HMAC, validação Zod, rate limit atômico, dedup de mensagens, sanitização de prompt, secrets).
- **Ação**: `npx firebase deploy --only functions --project zerou-26757` (após implementar as correções)
- **Lembrete**: `gcloud run services update whatsappwebhook --region=southamerica-east1 --no-cpu-throttling --project=zerou-26757` após todo deploy do webhook.

---

## Privacidade / LGPD (jurídico — não implementar sem advogado)

### [DONO] DPA com DeepSeek ou troca de provedor (LGPD-03)
- **O quê**: Dados financeiros de brasileiros são enviados para a DeepSeek (China) sem DPA, consentimento granular ou garantia de retenção zero.
- **Opções**:
  - A) Firmar DPA com a DeepSeek (se oferecerem) + adicionar consentimento na UI
  - B) Trocar para provedor em jurisdição adequada (ex.: Claude API na AWS us-east-1 via Anthropic)
  - C) Assumir o risco e só adicionar consentimento explícito na UI
- **Risco**: Multa ANPD de até 2% do faturamento (máx. R$ 50M). A decisão é do dono com assessoria jurídica.

### [DONO] RIPD — Relatório de Impacto à Proteção de Dados (LGPD-07)
- **O quê**: Exigível para processamento de alto risco (dados financeiros + IA). Não existe.
- **Ação**: Elaborar com profissional jurídico.

### [DONO] DPO independente (LGPD-01)
- **O quê**: O DPO atual é o próprio dono (Arthur), mas a LGPD exige independência funcional.
- **Ação**: Nomear DPO externo/terceirizado e publicar contato.

### [DONO] DPA com Google Cloud (LGPD-LACUNA-1)
- **O quê**: Firebase/Firestore roda no Google Cloud (EUA). Precisa de DPA assinado.
- **Ação**: Verificar se o DPA padrão do Firebase já cobre. Se não, assinar.

### [DONO] Template de notificação à ANPD (LGPD-05)
- **O quê**: Prazo de 3 dias úteis para notificar incidente de segurança à ANPD. Sem template.
- **Ação**: Elaborar com jurídico.

### [DONO] Verificação de idade / ECA Digital (LGPD-10)
- **O quê**: Lei 15.211/2025 exige proteção para menores online desde março/2026.
- **Ação**: Decidir se implementa campo de data de nascimento + bloqueio para <18.

### [DONO] Prazos de retenção documentados (LGPD-06/17)
- **O quê**: Verificar config real de backup no console GCP e documentar prazos.
- **Ação**: Auditar console + escrever política.

---

## Design / Marca

### [DONO] Cor de marca #EE5524 e contraste (A11Y-03)
- **O quê**: A cor primária `--action-primary: #EE5524` tem contraste ~2.5:1 contra fundo branco (mínimo AA: 4.5:1). Afeta 4 temas claros.
- **Opções**:
  - A) Escurecer `--action-primary` para ~#D44A1C (já usado no hover) — muda a identidade visual
  - B) Criar `--action-text` mais escuro só para texto/links, mantendo a cor atual em botões
  - C) Não mexer e aceitar a não-conformidade
- **Impacto**: Afeta a identidade visual do app inteiro. Decisão de design do dono.

### [DONO] Rename "Contas a Pagar" → "Compromissos" (UX-25)
- **O quê**: O dashboard chama de "Compromissos", mas menu/sidebar/título dizem "Contas a Pagar".
- **Ação**: Renomear nas 3 superfícies OU manter como está. Taste do dono.

### [DONO] Raio de borda dos inputs (UX-10)
- **O quê**: Inputs usam `border-radius: 3rem` (pílula). Decisão estética.
- **Ação**: Manter ou ajustar. Taste do dono.

---

## Resumo para o dono

| Prioridade | Ação | Tipo |
|---|---|---|
| **Urgente** | Rotacionar tokens WhatsApp na Meta | Segurança |
| **Urgente** | Deploy das firestore.rules | Segurança |
| **Esta semana** | Configurar APP_SECRET e reativar HMAC | Segurança |
| **Este mês** | Decidir sobre DeepSeek vs provedor alternativo | LGPD |
| **Este mês** | Deploy das Cloud Functions corrigidas | Segurança |
| **Trimestre** | RIPD, DPO, DPA Google Cloud | LGPD |
| **Quando quiser** | Rename Contas a Pagar, cor de marca, bordas | Design |
