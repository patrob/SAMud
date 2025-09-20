import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OllamaClient } from '../services/ollamaClient';
import { OllamaResponse } from '../types/index';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('OllamaClient', () => {
  let ollamaClient: OllamaClient;

  beforeEach(() => {
    ollamaClient = new OllamaClient('http://localhost:11434', 5000);
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('chat', () => {
    it('should successfully call Ollama chat API', async () => {
      const mockResponse: OllamaResponse = {
        model: 'llama2',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'Hello! How can I help you today?'
        },
        done: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' }
      ];

      const result = await ollamaClient.chat('llama2', messages, 0.7, 500);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama2',
            messages,
            options: {
              temperature: 0.7,
              num_predict: 500
            },
            stream: false
          })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(
        ollamaClient.chat('llama2', messages)
      ).rejects.toThrow('Ollama API error: 500 Internal Server Error');
    });

    it('should handle connection refused errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(
        ollamaClient.chat('llama2', messages)
      ).rejects.toThrow('Cannot connect to Ollama service. Is it running on localhost:11434?');
    });

    it('should handle timeout errors', async () => {
      // Mock fetch to never resolve (simulating timeout)
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(
        ollamaClient.chat('llama2', messages)
      ).rejects.toThrow('Ollama request timed out after 5000ms');
    });

    it('should use custom parameters', async () => {
      const mockResponse: OllamaResponse = {
        model: 'llama2',
        created_at: '2024-01-01T00:00:00Z',
        message: { role: 'assistant', content: 'Response' },
        done: true
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const messages = [{ role: 'user', content: 'Test' }];
      await ollamaClient.chat('custom-model', messages, 0.5, 200);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'custom-model',
            messages,
            options: {
              temperature: 0.5,
              num_predict: 200
            },
            stream: false
          })
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      const result = await ollamaClient.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return false when service is unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      const result = await ollamaClient.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false when connection fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await ollamaClient.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should return list of available models', async () => {
      const mockModelsResponse = {
        models: [
          { name: 'llama2' },
          { name: 'codellama' },
          { name: 'mistral' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelsResponse
      });

      const result = await ollamaClient.listModels();

      expect(result).toEqual(['llama2', 'codellama', 'mistral']);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return empty array when no models available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] })
      });

      const result = await ollamaClient.listModels();

      expect(result).toEqual([]);
    });

    it('should return empty array when models property is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      });

      const result = await ollamaClient.listModels();

      expect(result).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(ollamaClient.listModels()).rejects.toThrow('Ollama API error: 404 Not Found');
    });
  });

  describe('generateFallbackResponse', () => {
    it('should generate fallback response for NPCs', () => {
      const npcName = 'TestNPC';
      const response = ollamaClient.generateFallbackResponse(npcName);

      expect(response).toContain(npcName);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should generate different responses for different NPCs', () => {
      const responses = new Set();

      // Generate multiple responses to test variability
      for (let i = 0; i < 20; i++) {
        const response = ollamaClient.generateFallbackResponse('NPC');
        responses.add(response);
      }

      // Should have some variety in responses
      expect(responses.size).toBeGreaterThan(1);
    });
  });

  describe('custom base URL and timeout', () => {
    it('should use custom base URL', async () => {
      const customClient = new OllamaClient('http://custom-host:8080', 1000);

      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      await customClient.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://custom-host:8080/api/tags',
        expect.any(Object)
      );
    });
  });
});