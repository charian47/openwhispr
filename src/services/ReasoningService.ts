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

      // Build input array for Responses API
      const input = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ];

      // Build request body for Responses API
      const requestBody: any = {
        model: model || "gpt-4o-mini",
        input: input,
        store: false, // Don't store responses for privacy
      };

      // Add temperature for older models (GPT-4 and earlier)
      const isOlderModel = model && (model.startsWith('gpt-4') || model.startsWith('gpt-3'));
      if (isOlderModel) {
        requestBody.temperature = config.temperature || 0.3;
      }

      const response = await withRetry(
        async () => {
          const res = await fetch(API_ENDPOINTS.OPENAI, {
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

      // Log the raw response for debugging
      debugLogger.logReasoning("OPENAI_RAW_RESPONSE", {
        model,
        hasOutput: !!response.output,
        outputLength: response.output?.length || 0,
        outputTypes: response.output?.map((item: any) => item.type),
        usage: response.usage
      });

      // Extract text from the Responses API format
      // Response contains an array of output items, we need to find the message with output_text
      let responseText = "";
      
      if (response.output && Array.isArray(response.output)) {
        for (const item of response.output) {
          if (item.type === "message" && item.content) {
            for (const content of item.content) {
              if (content.type === "output_text" && content.text) {
                responseText = content.text.trim();
                break;
              }
            }
            if (responseText) break;
          }
        }
      }
      
      // Fallback to output_text helper if available
      if (!responseText && response.output_text) {
        responseText = response.output_text.trim();
      }
      
      debugLogger.logReasoning("OPENAI_RESPONSE", {
        model,
        responseLength: responseText.length,
        tokensUsed: response.usage?.total_tokens || 0,
        success: true,
        isEmpty: responseText.length === 0
      });
      
      // If we got an empty response, return the original text as fallback
      if (!responseText) {
        debugLogger.logReasoning("OPENAI_EMPTY_RESPONSE_FALLBACK", {
          model,
          originalTextLength: text.length,
          reason: "Empty response from API"
        });
        return text; // Return original text if API returns nothing
      }
      
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
      environment: typeof window !== 'undefined' ? 'browser' : 'node'
    });
    
    // Use IPC to communicate with main process for Anthropic API
    if (typeof window !== 'undefined' && window.electronAPI) {
      const startTime = Date.now();
      
      debugLogger.logReasoning("ANTHROPIC_IPC_CALL", {
        model,
        textLength: text.length
      });
      
      const result = await window.electronAPI.processAnthropicReasoning(text, model, agentName, config);
      
      const processingTime = Date.now() - startTime;
      
      if (result.success) {
        debugLogger.logReasoning("ANTHROPIC_SUCCESS", {
          model,
          processingTimeMs: processingTime,
          resultLength: result.text.length
        });
        return result.text;
      } else {
        debugLogger.logReasoning("ANTHROPIC_ERROR", {
          model,
          processingTimeMs: processingTime,
          error: result.error
        });
        throw new Error(result.error);
      }
    } else {
      debugLogger.logReasoning("ANTHROPIC_UNAVAILABLE", {
        reason: 'Not in Electron environment'
      });
      throw new Error('Anthropic reasoning is not available in this environment');
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
      hasApiKey: false
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
          maxOutputTokens: config.maxTokens || Math.max(
            2000, // Gemini 2.5 Pro needs more tokens for its thinking process
            this.calculateMaxTokens(
              text.length,
              TOKEN_LIMITS.MIN_TOKENS_GEMINI,
              TOKEN_LIMITS.MAX_TOKENS_GEMINI,
              TOKEN_LIMITS.TOKEN_MULTIPLIER
            )
          ),
        },
      };

      let response: any;
      try {
        response = await withRetry(
          async () => {
            debugLogger.logReasoning("GEMINI_REQUEST", {
              endpoint: `${API_ENDPOINTS.GEMINI}/models/${model}:generateContent`,
              model,
              hasApiKey: !!apiKey,
              requestBody: JSON.stringify(requestBody).substring(0, 200)
            });
            
            const res = await fetch(
              `${API_ENDPOINTS.GEMINI}/models/${model}:generateContent`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-goog-api-key": apiKey,
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
                fullResponse: errorText.substring(0, 500)
              });
              
              const errorMessage = errorData.error?.message || errorData.message || errorData.error || `Gemini API error: ${res.status}`;
              throw new Error(errorMessage);
            }

            const jsonResponse = await res.json();
            
            debugLogger.logReasoning("GEMINI_RAW_RESPONSE", {
              hasResponse: !!jsonResponse,
              responseKeys: jsonResponse ? Object.keys(jsonResponse) : [],
              hasCandidates: !!jsonResponse?.candidates,
              candidatesLength: jsonResponse?.candidates?.length || 0,
              fullResponse: JSON.stringify(jsonResponse).substring(0, 500)
            });
            
            return jsonResponse;
          },
          createApiRetryStrategy("Gemini")
        );
      } catch (fetchError) {
        debugLogger.logReasoning("GEMINI_FETCH_ERROR", {
          error: (fetchError as Error).message,
          stack: (fetchError as Error).stack
        });
        throw fetchError;
      }

      // Check if response has the expected structure
      if (!response.candidates || !response.candidates[0]) {
        debugLogger.logReasoning("GEMINI_RESPONSE_ERROR", {
          model,
          response: JSON.stringify(response).substring(0, 500),
          hasCandidate: !!response.candidates,
          candidateCount: response.candidates?.length || 0
        });
        throw new Error("Invalid response structure from Gemini API");
      }
      
      // Check if the response has actual content
      const candidate = response.candidates[0];
      if (!candidate.content?.parts?.[0]?.text) {
        debugLogger.logReasoning("GEMINI_EMPTY_RESPONSE", {
          model,
          finishReason: candidate.finishReason,
          hasContent: !!candidate.content,
          hasParts: !!candidate.content?.parts,
          response: JSON.stringify(candidate).substring(0, 500)
        });
        
        // If finish reason is MAX_TOKENS, the model hit its limit
        if (candidate.finishReason === "MAX_TOKENS") {
          throw new Error("Gemini reached token limit before generating response. Try a shorter input or increase max tokens.");
        }
        throw new Error("Gemini returned empty response");
      }
      
      const responseText = candidate.content.parts[0].text.trim();
      
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
        errorType: (error as Error).name
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