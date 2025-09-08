import { getModelProvider } from "../utils/languages";
import { BaseReasoningService, ReasoningConfig } from "./BaseReasoningService";
import { SecureCache } from "../utils/SecureCache";
import { withRetry, createApiRetryStrategy } from "../utils/retry";
import { API_ENDPOINTS, API_VERSIONS, TOKEN_LIMITS } from "../config/constants";

// Import debugLogger for comprehensive logging
const debugLogger = typeof window !== 'undefined' && window.electronAPI 
  ? { logReasoning: (stage: string, details: any) => {
      window.electronAPI.logReasoning?.(stage, details).catch(() => {});
    }}
  : { logReasoning: (stage: string, details: any) => {
      console.log(`[REASONING ${stage}]`, details);
    }};

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
    
    debugLogger.logReasoning(`${provider.toUpperCase()}_KEY_RETRIEVAL`, {
      provider,
      fromCache: !!apiKey,
      cacheSize: this.apiKeyCache.size || 0
    });
    
    if (!apiKey) {
      try {
        const keyGetters = {
          openai: () => window.electronAPI.getOpenAIKey(),
          anthropic: () => window.electronAPI.getAnthropicKey(),
          gemini: () => window.electronAPI.getGeminiKey(),
        };
        apiKey = await keyGetters[provider]();
        
        debugLogger.logReasoning(`${provider.toUpperCase()}_KEY_FETCHED`, {
          provider,
          hasKey: !!apiKey,
          keyLength: apiKey?.length || 0,
          keyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : 'none'
        });
        
        if (apiKey) {
          this.apiKeyCache.set(provider, apiKey);
        }
      } catch (error) {
        debugLogger.logReasoning(`${provider.toUpperCase()}_KEY_FETCH_ERROR`, {
          provider,
          error: (error as Error).message,
          stack: (error as Error).stack
        });
      }
    }
    
    if (!apiKey) {
      const errorMsg = `${provider.charAt(0).toUpperCase() + provider.slice(1)} API key not configured`;
      debugLogger.logReasoning(`${provider.toUpperCase()}_KEY_MISSING`, {
        provider,
        error: errorMsg
      });
      throw new Error(errorMsg);
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

    debugLogger.logReasoning("PROVIDER_SELECTION", {
      model,
      provider,
      agentName,
      hasConfig: Object.keys(config).length > 0,
      textLength: text.length,
      timestamp: new Date().toISOString()
    });

    try {
      let result: string;
      const startTime = Date.now();
      
      debugLogger.logReasoning("ROUTING_TO_PROVIDER", {
        provider,
        model
      });
      
      switch (provider) {
        case "openai":
          result = await this.processWithOpenAI(text, model, agentName, config);
          break;
        case "anthropic":
          result = await this.processWithAnthropic(text, model, agentName, config);
          break;
        case "local":
          result = await this.processWithLocal(text, model, agentName, config);
          break;
        case "gemini":
          result = await this.processWithGemini(text, model, agentName, config);
          break;
        default:
          throw new Error(`Unsupported reasoning provider: ${provider}`);
      }
      
      const processingTime = Date.now() - startTime;
      
      debugLogger.logReasoning("PROVIDER_SUCCESS", {
        provider,
        model,
        processingTimeMs: processingTime,
        resultLength: result.length,
        resultPreview: result.substring(0, 100) + (result.length > 100 ? "..." : "")
      });
      
      return result;
    } catch (error) {
      debugLogger.logReasoning("PROVIDER_ERROR", {
        provider,
        model,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
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
    debugLogger.logReasoning("OPENAI_START", {
      model,
      agentName,
      hasApiKey: false // Will update after fetching
    });
    
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    const apiKey = await this.getApiKey('openai');
    
    debugLogger.logReasoning("OPENAI_API_KEY", {
      hasApiKey: !!apiKey,
      keyLength: apiKey?.length || 0
    });

    this.isProcessing = true;

    try {
      const systemPrompt = "You are a dictation assistant. Clean up text by fixing grammar and punctuation. Output ONLY the cleaned text without any explanations, options, or commentary.";
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

      const responseText = response.choices[0].message.content.trim();
      
      debugLogger.logReasoning("OPENAI_RESPONSE", {
        model,
        responseLength: responseText.length,
        tokensUsed: response.usage?.total_tokens || 0,
        success: true
      });
      
      return responseText;
    } catch (error) {
      debugLogger.logReasoning("OPENAI_ERROR", {
        model,
        error: (error as Error).message,
        errorType: (error as Error).name
      });
      throw error;
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
    debugLogger.logReasoning("ANTHROPIC_START", {
      model,
      agentName,
      hasApiKey: false // Will update after fetching
    });
    
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    const apiKey = await this.getApiKey('anthropic');
    
    debugLogger.logReasoning("ANTHROPIC_API_KEY", {
      hasApiKey: !!apiKey,
      keyLength: apiKey?.length || 0
    });

    this.isProcessing = true;

    try {
      const systemPrompt = "You are a dictation assistant. Clean up text by fixing grammar and punctuation. Output ONLY the cleaned text without any explanations, options, or commentary.";
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

      const responseText = response.content[0].text.trim();
      
      debugLogger.logReasoning("ANTHROPIC_RESPONSE", {
        model,
        responseLength: responseText.length,
        tokensUsed: response.usage?.total_tokens || 0,
        success: true
      });
      
      return responseText;
    } catch (error) {
      debugLogger.logReasoning("ANTHROPIC_ERROR", {
        model,
        error: (error as Error).message,
        errorType: (error as Error).name
      });
      throw error;
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
    debugLogger.logReasoning("LOCAL_START", {
      model,
      agentName,
      environment: typeof window !== 'undefined' ? 'browser' : 'node'
    });
    
    // Instead of importing directly, we'll use IPC to communicate with main process
    // For local models, we need to use IPC to communicate with the main process
    if (typeof window !== 'undefined' && window.electronAPI) {
      const startTime = Date.now();
      
      debugLogger.logReasoning("LOCAL_IPC_CALL", {
        model,
        textLength: text.length
      });
      
      const result = await window.electronAPI.processLocalReasoning(text, model, agentName, config);
      
      const processingTime = Date.now() - startTime;
      
      if (result.success) {
        debugLogger.logReasoning("LOCAL_SUCCESS", {
          model,
          processingTimeMs: processingTime,
          resultLength: result.text.length
        });
        return result.text;
      } else {
        debugLogger.logReasoning("LOCAL_ERROR", {
          model,
          processingTimeMs: processingTime,
          error: result.error
        });
        throw new Error(result.error);
      }
    } else {
      debugLogger.logReasoning("LOCAL_UNAVAILABLE", {
        reason: 'Not in Electron environment'
      });
      throw new Error('Local reasoning is not available in this environment');
    }
  }

  private async processWithGemini(
    text: string,
    model: string,
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    debugLogger.logReasoning("GEMINI_START", {
      model,
      agentName,
      hasApiKey: false // Will update after fetching
    });
    
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    const apiKey = await this.getApiKey('gemini');
    
    debugLogger.logReasoning("GEMINI_API_KEY", {
      hasApiKey: !!apiKey,
      keyLength: apiKey?.length || 0
    });

    this.isProcessing = true;

    try {
      const systemPrompt = "You are a dictation assistant. Clean up text by fixing grammar and punctuation. Output ONLY the cleaned text without any explanations, options, or commentary.";
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
            const errorText = await res.text();
            let errorData: any = { error: res.statusText };
            
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { error: errorText || res.statusText };
            }
            
            debugLogger.logReasoning("GEMINI_API_ERROR_DETAIL", {
              status: res.status,
              statusText: res.statusText,
              error: errorData,
              errorMessage: errorData.error?.message || errorData.message || errorData.error,
              errorCode: errorData.error?.code,
              errorStatus: errorData.error?.status,
              fullResponse: errorText.substring(0, 500),
              headers: Object.fromEntries(res.headers.entries())
            });
            
            // Check for common error patterns
            const errorMessage = errorData.error?.message || errorData.message || errorData.error || `Gemini API error: ${res.status}`;
            
            if (res.status === 403 || errorMessage.includes('quota') || errorMessage.includes('billing')) {
              throw new Error(`Gemini API quota/billing error: ${errorMessage}. Please check your Google Cloud billing account.`);
            } else if (res.status === 401) {
              throw new Error(`Gemini API authentication error: Invalid API key`);
            } else if (res.status === 400) {
              throw new Error(`Gemini API request error: ${errorMessage}`);
            } else {
              throw new Error(`Gemini API error (${res.status}): ${errorMessage}`);
            }
          }

          return res.json();
        },
        createApiRetryStrategy("Gemini")
      );

      const responseText = response.candidates[0].content.parts[0].text.trim();
      
      debugLogger.logReasoning("GEMINI_RESPONSE", {
        model,
        responseLength: responseText.length,
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        success: true
      });
      
      return responseText;
    } catch (error) {
      debugLogger.logReasoning("GEMINI_ERROR", {
        model,
        error: (error as Error).message,
        errorType: (error as Error).name,
        stack: (error as Error).stack,
        apiKey: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'missing',
        endpoint: `${API_ENDPOINTS.GEMINI}/models/${model}:generateContent`
      });
      throw error;
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
      
      debugLogger.logReasoning("API_KEY_CHECK", {
        hasOpenAI: !!openaiKey,
        hasAnthropic: !!anthropicKey,
        hasGemini: !!geminiKey,
        hasLocal: !!localAvailable,
        openAIKeyLength: openaiKey?.length || 0,
        anthropicKeyLength: anthropicKey?.length || 0,
        geminiKeyLength: geminiKey?.length || 0,
        geminiKeyPreview: geminiKey ? `${geminiKey.substring(0, 8)}...` : 'none'
      });
      
      return !!(openaiKey || anthropicKey || geminiKey || localAvailable);
    } catch (error) {
      debugLogger.logReasoning("API_KEY_CHECK_ERROR", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        name: (error as Error).name
      });
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