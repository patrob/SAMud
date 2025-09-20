import { OllamaResponse } from '../types/index.js';

/**
 * Ollama API client for local AI model interactions
 * Communicates with Ollama service running on localhost:11434
 */
export class OllamaClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = 'http://localhost:11434', timeout: number = 15000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Send a chat completion request to Ollama
   */
  async chat(model: string, messages: Array<{role: string, content: string}>, temperature: number = 0.7, maxTokens: number = 500): Promise<OllamaResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          options: {
            temperature,
            num_predict: maxTokens,
          },
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result as OllamaResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${this.timeout}ms`);
        }
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          throw new Error('Cannot connect to Ollama service. Is it running on localhost:11434?');
        }
        throw error;
      }

      throw new Error('Unknown error occurred while calling Ollama API');
    }
  }

  /**
   * Test connection to Ollama service
   */
  async healthCheck(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Shorter timeout for health check

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as { models?: Array<{ name: string }> };
      return result.models?.map((model) => model.name) || [];
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Ollama request timed out after ${this.timeout}ms`);
        }
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          throw new Error('Cannot connect to Ollama service. Is it running on localhost:11434?');
        }
        throw error;
      }

      throw new Error('Unknown error occurred while calling Ollama API');
    }
  }

  /**
   * Generate a fallback response when Ollama is unavailable
   */
  generateFallbackResponse(npcName: string): string {
    const fallbacks = [
      `${npcName} seems distracted and doesn't respond right now.`,
      `${npcName} is busy at the moment and can't talk.`,
      `${npcName} appears to be deep in thought and doesn't hear you.`,
      `${npcName} nods politely but seems preoccupied.`,
      `${npcName} gives you a brief smile but returns to their work.`,
    ];

    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}