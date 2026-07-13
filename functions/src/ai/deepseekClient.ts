import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

export const deepseekApiKey = defineSecret('DEEPSEEK_API_KEY');

const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const TIMEOUT_MS = 15_000;

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callDeepSeek(
  messages: DeepSeekMessage[],
  opts?: { jsonMode?: boolean }
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY || deepseekApiKey.value();

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
      throw new Error(`DeepSeek API error ${response.status}: ${text.slice(0, 300)}`);
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
