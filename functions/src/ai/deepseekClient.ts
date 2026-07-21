import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';

export const deepseekApiKey = defineSecret('DEEPSEEK_API_KEY');

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 45_000;

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function getApiKey(): string {
  const apiKey = process.env.DEEPSEEK_API_KEY || deepseekApiKey.value();

  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Assistente de IA indisponivel neste ambiente.');
  }

  return apiKey;
}

export async function callDeepSeek(
  messages: DeepSeekMessage[],
  opts?: { jsonMode?: boolean },
): Promise<string> {
  const apiKey = getApiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model: 'deepseek-chat',
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    };

    if (opts?.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(DEEPSEEK_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const status = response.status;

      // Retry once for transient errors
      if (status === 429 || status === 503) {
        logger.warn('deepseek_transient_error', { status });
        await new Promise((r) => setTimeout(r, 1000));

        const retryResponse = await fetch(DEEPSEEK_CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (retryResponse.ok) {
          const retryData = (await retryResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const retryContent = retryData.choices?.[0]?.message?.content;
          if (retryContent) return retryContent;
        }
      }

      throw new Error(`DeepSeek API error ${status}: ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      logger.warn('deepseek_empty_response', { data: JSON.stringify(data).slice(0, 500) });
      throw new Error('DeepSeek returned an empty response.');
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}
