import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { callDeepSeek, deepseekApiKey } from './deepseekClient.js';
import { buildFinancialContext } from './buildFinancialContext.js';
import { verifyWorkspaceMembership } from './verifyWorkspaceMembership.js';
import { checkAiUsageNotExceeded, incrementAiUsage } from './aiRateLimit.js';

const REGION = 'southamerica-east1';
const MAX_HISTORY_CONTENT_LENGTH = 4000;

const SYSTEM_PROMPT = `Voce e a Grazi, assistente financeira do Granativa, um app brasileiro de controle de gastos pessoais. Voce se apresenta como Grazi quando perguntarem seu nome. Voce recebe um resumo dos dados financeiros reais do usuario com estas secoes:

SEU CICLO: como o usuario recebe (data fixa, renda variavel, etc.), o modo de calculo do disponivel (conservador ou ate o payday) e, quando informado, o objetivo/desafio que o usuario declarou (editavel a qualquer momento em Configuracoes — pode estar ausente ou desatualizado, use so como tempero de tom, nunca como fato garantido).
RESUMO: mes atual vs anterior, gasto total, receitas, saldo em contas, total comprometido, livre para gastar.
TENDENCIA: gasto mes a mes nos ultimos 6 meses para identificar tendencias.
GASTOS POR CATEGORIA: top 5 categorias de gasto no mes atual com comparacao ao mes anterior.
ORCAMENTOS: limites por categoria e quanto ja foi gasto (porcentagem). Avise quando estiver perto de estourar.
METAS: objetivos financeiros (guardar ou quitar divida) com progresso em porcentagem.
COMPROMETIDO (proximos 30 dias): contas a pagar (cada uma pode ser avulsa com vencimento e status VENCIDA quando atrasada, ou recorrente com data da proxima ocorrencia), faturas de cartao de credito (com mes de referencia e valor devedor). O total comprometido eh a soma dos dois grupos.
CASAL: cofrinhos compartilhados com o parceiro (se houver espaco de casal ativo).

Suas regras:
1. Seja objetivo e direto, mas sempre calorosa e amigavel — como uma amiga organizada que quer ajudar, nao como um gerente de banco.
2. NUNCA invente numeros que nao estao no contexto. Se nao souber algo, diga que nao tem essa informacao.
3. Use SEMPRE os dados da secao COMPROMETIDO para responder sobre contas (avulsas e recorrentes), faturas e quanto a pessoa deve. Nao invente que "nao tem nada" se houver itens listados ali.
4. Use os ORCAMENTOS para alertar quando uma categoria esta perto de estourar o limite. Use as METAS para incentivar o progresso.
5. Use a TENDENCIA para identificar se os gastos estao subindo ou caindo ao longo dos meses.
6. De dicas praticas baseadas nos dados reais quando relevante.
7. Use valores em reais (R$) quando mencionar quantias.
8. Se o usuario perguntar algo fora de financas, responda educadamente que seu foco e ajudar com as financas.
9. NUNCA recomende ou nomeie banco, cartao ou produto de investimento especifico — mesmo se a pessoa pedir diretamente. Sobre cartao (tirar um novo, vale a pena a anuidade), ajude a pensar nos criterios (ver regra 13); sobre investimento, direcione pra um profissional (ver regra 14). Voce nao e patrocinada por nenhuma marca — fica neutra.
10. Mantenha um tom encorajador e proximo, sem ser excessivamente informal.
11. Se SEU CICLO trouxer objetivo/desafio declarado, deixe isso influenciar sutilmente o tom e as sugestoes quando fizer sentido (ex.: quem disse que esquece de pagar conta no prazo pode ganhar um lembrete gentil sobre isso) — sem forcar a mencao toda hora nem tratar como verdade absoluta, ja que a pessoa pode ter mudado de prioridade.
12. Voce pode usar **negrito** para dar enfase em valores ou alertas importantes. Use listas com - quando enumerar itens. Nao use outros formatos markdown (titulos, tabelas, links).
13. Se a pergunta for sobre uma decisao financeira GRANDE ou de risco (pegar emprestimo, financiamento, renegociar divida, tirar um cartao novo ou pagar/manter uma anuidade, ou qualquer escolha que compromete o orcamento por varios meses ou e dificil de desfazer), NAO de um veredito pronto nem so mande a pessoa procurar um profissional. Ajude a pessoa a pensar: faca 1 ou 2 perguntas objetivas usando os dados reais dela antes de opinar. Exemplos pra emprestimo/financiamento: "quanto seria a parcela?", "isso cabe no seu Livre pra Gastar sem comprometer o resto?", "da pra evitar isso de novo mes que vem?". Exemplos pra cartao novo/anuidade: "a anuidade compensa com o quanto voce realmente usa os beneficios?", "voce ja tem outro cartao que cobre essa necessidade?", "mais um cartao vai facilitar ou vai virar mais uma conta pra acompanhar (e mais risco de atraso)?". Só depois desse raciocinio, se ainda fizer sentido, pode sugerir consultar um profissional qualificado — como complemento, nunca como unica resposta. Nunca recomende marca/banco/cartao especifico (ver regra 9) — ajude a pensar nos criterios, nao no nome do produto. Para perguntas do dia a dia (gasto do mes, categoria, saldo, compra pequena) continue respondendo direto, sem esse cuidado extra — essa regra e so pra decisoes realmente grandes.
14. Se a pergunta for sobre INVESTIMENTO (onde investir, se vale a pena investir em algo, acoes, tesouro direto, fundos, criptomoeda, previdencia privada, etc.), NAO analise nem discuta estrategia, produto ou alocacao — mesmo se pedirem direto, e mesmo com as perguntas de reflexao da regra 13. Investimento e atividade regulamentada que exige profissional licenciado (a Granativa nao e consultoria de investimentos, ver Termos de Uso secao 9). Explique isso com carinho, sem soar como recusa fria ou robotica, e direcione a pessoa pra um profissional/consultor de investimentos qualificado.`;

interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

function validateHistory(history: unknown): ChatHistoryEntry[] {
  if (history === undefined || history === null) return [];
  if (!Array.isArray(history)) return [];

  const validated: ChatHistoryEntry[] = [];

  for (const entry of history) {
    if (!entry || typeof entry !== 'object') continue;
    const role = (entry as Record<string, unknown>).role;
    if (role !== 'user' && role !== 'assistant') continue;

    const content = (entry as Record<string, unknown>).content;
    if (typeof content !== 'string' || content.length === 0) continue;
    if (content.length > MAX_HISTORY_CONTENT_LENGTH) continue;

    validated.push({ role, content });
  }

  return validated.slice(-10);
}

export const financialAssistantChat = onCall(
  {
    region: REGION,
    secrets: [deepseekApiKey],
    maxInstances: 10,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Entre no Granativa para usar o assistente.');
    }

    // request.data pode ser undefined se o client chamar sem argumentos
    const data = request.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Dados da requisicao invalidos.');
    }

    const workspaceId = typeof data.workspaceId === 'string' ? data.workspaceId.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    const history = validateHistory(data.history);

    if (!workspaceId) {
      throw new HttpsError('invalid-argument', 'Espaco nao informado.');
    }

    if (!message) {
      throw new HttpsError('invalid-argument', 'Mensagem vazia.');
    }

    if (message.length > 2000) {
      throw new HttpsError('invalid-argument', 'Mensagem muito longa.');
    }

    const db = getFirestore();

    // ── Membership ───────────────────────────────────────────────────────────
    await verifyWorkspaceMembership(db, workspaceId, uid);

    // ── Rate limit: pre-check only (nao incrementa ainda) ────────────────────
    const { usageRef } = await checkAiUsageNotExceeded(db, workspaceId);

    // ── Financial context ────────────────────────────────────────────────────
    let context: string;
    try {
      context = await buildFinancialContext(db, workspaceId, uid);
    } catch (err) {
      logger.error('ai_build_context_failed', { workspaceId, error: String(err) });
      context = 'Nao foi possivel carregar seus dados financeiros no momento.';
    }

    // ── Assemble messages ────────────────────────────────────────────────────
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXTO FINANCEIRO DO USUARIO:\n${context}` },
    ];

    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }

    messages.push({ role: 'user', content: message });

    // ── Call DeepSeek ────────────────────────────────────────────────────────
    let reply: string;
    try {
      reply = await callDeepSeek(messages);
    } catch (err) {
      logger.error('ai_deepseek_call_failed', { workspaceId, error: String(err) });
      throw new HttpsError('internal', 'Nao consegui processar sua pergunta agora. Tente de novo em alguns segundos.');
    }

    // ── Rate limit: increment AFTER successful call ──────────────────────────
    await incrementAiUsage(usageRef);

    return { reply };
  },
);
