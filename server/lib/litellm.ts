export interface LiteLLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LiteLLMRequest {
  model: string;
  messages: LiteLLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LiteLLMResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const LITELLM_BASE_URL = 'http://3.110.18.218';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

export class LiteLLMClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.LITELLM_API_KEY || '';
    if (!this.apiKey) {
      console.warn('WARNING: LITELLM_API_KEY not set. LLM calls will fail.');
    }
  }

  async chat(
    messages: LiteLLMMessage[],
    model: string = 'gemini-2.5-flash',
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const request: LiteLLMRequest = {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${LITELLM_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(request),
        });

        if (response.status === 429) {
          // Rate limit - exponential backoff
          const backoffTime = INITIAL_BACKOFF * Math.pow(2, attempt);
          console.log(`Rate limited. Retrying in ${backoffTime}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LiteLLM API error (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as LiteLLMResponse;
        return data.choices[0]?.message?.content || '';
      } catch (error) {
        lastError = error as Error;
        if (attempt < MAX_RETRIES - 1) {
          const backoffTime = INITIAL_BACKOFF * Math.pow(2, attempt);
          console.log(`LiteLLM error: ${error}. Retrying in ${backoffTime}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }

    throw new Error(`LiteLLM failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
  }
}

// Singleton instance
export const litellm = new LiteLLMClient();
