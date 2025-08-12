import { getModelProvider } from "../utils/languages";
import { BaseReasoningService, ReasoningConfig } from "./BaseReasoningService";
import { SecureCache } from "../utils/SecureCache";
import { withRetry, createApiRetryStrategy } from "../utils/retry";
import { API_ENDPOINTS, API_VERSIONS, TOKEN_LIMITS } from "../config/constants";

export const DEFAULT_PROMPTS = {
  agent: `You are {{agentName}}, a helpful AI assistant. Process and improve the following text, removing any reference to your name from the output:\n\n{{text}}\n\nImproved text:`,
  regular: `Process and improve the following text:\n\n{{text}}\n\nImproved text:`
};

class ReasoningService extends BaseReasoningService {
  private apiKeyCache: SecureCache<string>;
  private cacheCleanupStop: (() => void) | undefined;

  constructor() {
    super();
    this.apiKeyCache = new SecureCache();
    this.cacheCleanupStop = this.apiKeyCache.startAutoCleanup();
  }

  private async getApiKey(provider: 'openai' | 'anthropic' | 'gemini'): Promise<string> {
    let apiKey = this.apiKeyCache.get(provider);
    if (!apiKey) {
      try {
        const keyGetters = {
          openai: () => window.electronAPI.getOpenAIKey(),
          anthropic: () => window.electronAPI.getAnthropicKey(),
          gemini: () => window.electronAPI.getGeminiKey(),
        };
        apiKey = await keyGetters[provider]();
        if (apiKey) {
          this.apiKeyCache.set(provider, apiKey);
        }
      } catch (error) {
        // API key retrieval failed 
      }
    }
    
    if (!apiKey) {
      throw new Error(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key not configured`);
    }
    
    return apiKey;
  }

  async processText(
    text: string,
    model: string = "gpt-4o-mini",
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    const provider = getModelProvider(model);

    try {
      switch (provider) {
        case "openai":
          return await this.processWithOpenAI(text, model, agentName, config);
        case "anthropic":
          return await this.processWithAnthropic(text, model, agentName, config);
        case "local":
          return await this.processWithLocal(text, model, agentName, config);
        case "gemini":
          return await this.processWithGemini(text, model, agentName, config);
        default:
          throw new Error(`Unsupported reasoning provider: ${provider}`);
      }
    } catch (error) {
      // Re-throw error with provider context
      throw error;
    }
  }

  private async processWithOpenAI(
    text: string,
    model: string,
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    const apiKey = await this.getApiKey('openai');

    this.isProcessing = true;

    try {
      const systemPrompt = "You are a helpful assistant that processes text.";
      const userPrompt = this.getReasoningPrompt(text, agentName, config);

      const requestBody = {
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: config.maxTokens || this.calculateMaxTokens(
          text.length,
          TOKEN_LIMITS.MIN_TOKENS,
          TOKEN_LIMITS.MAX_TOKENS,
          TOKEN_LIMITS.TOKEN_MULTIPLIER
        ),
        temperature: config.temperature || 0.3,
      };

      const response = await withRetry(
        async () => {
          const res = await fetch(`${API_ENDPOINTS.OPENAI}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(errorData.error?.message || `OpenAI API error: ${res.status}`);
          }

          return res.json();
        },
        createApiRetryStrategy("OpenAI")
      );

      return response.choices[0].message.content.trim();
    } finally {
      this.isProcessing = false;
    }
  }

  private async processWithAnthropic(
    text: string,
    model: string,
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    const apiKey = await this.getApiKey('anthropic');

    this.isProcessing = true;

    try {
      const systemPrompt = "You are a helpful assistant that processes text.";
      const userPrompt = this.getReasoningPrompt(text, agentName, config);

      const requestBody = {
        model: model || "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
        max_tokens: config.maxTokens || this.calculateMaxTokens(
          text.length,
          TOKEN_LIMITS.MIN_TOKENS_ANTHROPIC,
          TOKEN_LIMITS.MAX_TOKENS_ANTHROPIC,
          TOKEN_LIMITS.TOKEN_MULTIPLIER
        ),
        temperature: config.temperature || 0.3,
      };

      const response = await withRetry(
        async () => {
          const res = await fetch(`${API_ENDPOINTS.ANTHROPIC}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey!,
              "anthropic-version": API_VERSIONS.ANTHROPIC,
            },
            body: JSON.stringify(requestBody),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(errorData.error?.message || `Anthropic API error: ${res.status}`);
          }

          return res.json();
        },
        createApiRetryStrategy("Anthropic")
      );

      return response.content[0].text.trim();
    } finally {
      this.isProcessing = false;
    }
  }

  private async processWithLocal(
    text: string,
    model: string,
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    // Instead of importing directly, we'll use IPC to communicate with main process
    // For local models, we need to use IPC to communicate with the main process
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.processLocalReasoning(text, model, agentName, config);
      if (result.success) {
        return result.text;
      } else {
        throw new Error(result.error);
      }
    } else {
      throw new Error('Local reasoning is not available in this environment');
    }
  }

  private async processWithGemini(
    text: string,
    model: string,
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    const apiKey = await this.getApiKey('gemini');

    this.isProcessing = true;

    try {
      const systemPrompt = "You are a helpful assistant that processes text.";
      const userPrompt = this.getReasoningPrompt(text, agentName, config);

      const requestBody = {
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\n${userPrompt}`
          }]
        }],
        generationConfig: {
          temperature: config.temperature || 0.3,
          maxOutputTokens: config.maxTokens || this.calculateMaxTokens(
            text.length,
            TOKEN_LIMITS.MIN_TOKENS_GEMINI,
            TOKEN_LIMITS.MAX_TOKENS_GEMINI,
            TOKEN_LIMITS.TOKEN_MULTIPLIER
          ),
        },
      };

      const response = await withRetry(
        async () => {
          const res = await fetch(
            `${API_ENDPOINTS.GEMINI}/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            }
          );

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(errorData.error?.message || `Gemini API error: ${res.status}`);
          }

          return res.json();
        },
        createApiRetryStrategy("Gemini")
      );

      return response.candidates[0].content.parts[0].text.trim();
    } finally {
      this.isProcessing = false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if we have at least one configured API key or local model available
      const openaiKey = await window.electronAPI?.getOpenAIKey?.();
      const anthropicKey = await window.electronAPI?.getAnthropicKey?.();
      const geminiKey = await window.electronAPI?.getGeminiKey?.();
      const localAvailable = await window.electronAPI?.checkLocalReasoningAvailable?.();
      
      return !!(openaiKey || anthropicKey || geminiKey || localAvailable);
    } catch (error) {
      return false;
    }
  }

  destroy(): void {
    if (this.cacheCleanupStop) {
      this.cacheCleanupStop();
    }
  }
}

export default new ReasoningService();