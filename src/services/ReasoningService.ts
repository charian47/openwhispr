import {
  getModelProvider,
  getOpenAiApiConfig,
} from "../models/ModelRegistry";
import { BaseReasoningService, ReasoningConfig } from "./BaseReasoningService";
import { SecureCache } from "../utils/SecureCache";
import { TOKEN_LIMITS } from "../config/constants";
import logger from "../utils/logger";
import { streamText, stepCountIs } from "ai";
import { getAIModel } from "./ai/providers";

export type AgentStreamChunk =
  | { type: "content"; text: string }
  | { type: "tool_calls"; calls: Array<{ id: string; name: string; arguments: string }> }
  | {
      type: "tool_result";
      callId: string;
      toolName: string;
      displayText: string;
      metadata?: Record<string, unknown>;
    }
  | { type: "done"; finishReason?: string };

class ReasoningService extends BaseReasoningService {
  private apiKeyCache: SecureCache<string>;
  private static readonly MAX_TOOL_STEPS = 20;
  private cacheCleanupStop: (() => void) | undefined;
  private streamAbortController: AbortController | null = null;

  constructor() {
    super();
    this.apiKeyCache = new SecureCache();
    this.cacheCleanupStop = this.apiKeyCache.startAutoCleanup();

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => this.destroy());
    }
  }

  async processText(
    text: string,
    model: string = "",
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    let trimmedModel = model?.trim?.() || "";
    const provider = getModelProvider(trimmedModel);

    if (!trimmedModel && provider !== "openwhispr") {
      throw new Error("No reasoning model selected");
    }

    logger.logReasoning("PROVIDER_SELECTION", {
      model: trimmedModel,
      provider,
      agentName,
      hasConfig: Object.keys(config).length > 0,
      textLength: text.length,
      timestamp: new Date().toISOString(),
    });

    try {
      let result: string;
      const startTime = Date.now();

      logger.logReasoning("ROUTING_TO_PROVIDER", {
        provider,
        model,
      });

      switch (provider) {
        case "local":
          result = await this.processWithLocal(text, trimmedModel, agentName, config);
          break;
        default:
          throw new Error(`Unsupported reasoning provider: ${provider}. Only local llama.cpp is supported.`);
      }

      const processingTime = Date.now() - startTime;

      logger.logReasoning("PROVIDER_SUCCESS", {
        provider,
        model,
        processingTimeMs: processingTime,
        resultLength: result.length,
        resultPreview: result.substring(0, 100) + (result.length > 100 ? "..." : ""),
      });

      return result;
    } catch (error) {
      logger.logReasoning("PROVIDER_ERROR", {
        provider,
        model,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      throw error;
    }
  }

  private async processWithLocal(
    text: string,
    model: string,
    agentName: string | null = null,
    config: ReasoningConfig = {}
  ): Promise<string> {
    if (this.isProcessing) {
      throw new Error("Already processing a request");
    }

    logger.logReasoning("LOCAL_START", {
      model,
      agentName,
      environment: typeof window !== "undefined" ? "browser" : "node",
    });

    this.isProcessing = true;
    try {
      if (typeof window !== "undefined" && window.electronAPI) {
        const startTime = Date.now();

        logger.logReasoning("LOCAL_IPC_CALL", {
          model,
          textLength: text.length,
        });

        const systemPrompt = config.systemPrompt || this.getSystemPrompt(agentName, text);
        const result = await window.electronAPI.processLocalReasoning(text, model, agentName, {
          ...config,
          systemPrompt,
        });

        const processingTime = Date.now() - startTime;

        if (result.success) {
          logger.logReasoning("LOCAL_SUCCESS", {
            model,
            processingTimeMs: processingTime,
            resultLength: result.text.length,
          });
          return result.text;
        } else {
          logger.logReasoning("LOCAL_ERROR", {
            model,
            processingTimeMs: processingTime,
            error: result.error,
          });
          throw new Error(result.error);
        }
      } else {
        logger.logReasoning("LOCAL_UNAVAILABLE", {
          reason: "Not in Electron environment",
        });
        throw new Error("Local reasoning is not available in this environment");
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private getCustomPrompt(): string | undefined {
    try {
      const raw = localStorage.getItem("customUnifiedPrompt");
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async *processTextStreaming(
    messages: Array<{ role: string; content: string }>,
    model: string,
    provider: string,
    config: ReasoningConfig & { systemPrompt: string }
  ): AsyncGenerator<string, void, unknown> {
    const serverResult = await window.electronAPI.llamaServerStart(model);
    if (!serverResult.success || !serverResult.port) {
      throw new Error(serverResult.error || "Failed to start local model server");
    }
    const endpoint = `http://127.0.0.1:${serverResult.port}/v1/chat/completions`;
    const isLocalProvider = true;

    const apiKey = "";
    const apiConfig = getOpenAiApiConfig(model);
    const useOldTokenParam = true; // local always uses max_tokens

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };

    const maxTokens = config.maxTokens || Math.max(4096, TOKEN_LIMITS.MAX_TOKENS);

    if (useOldTokenParam) {
      requestBody.temperature = config.temperature ?? 0.3;
      requestBody.max_tokens = maxTokens;
    } else {
      requestBody[apiConfig.tokenParam] = maxTokens;
      if (apiConfig.supportsTemperature) {
        requestBody.temperature = config.temperature ?? 0.3;
      }
    }

    logger.logReasoning("AGENT_STREAM_REQUEST", {
      endpoint,
      model,
      provider,
      isLocal: isLocalProvider,
      messageCount: messages.length,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    this.streamAbortController = new AbortController();
    const controller = this.streamAbortController;
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === "AbortError") {
        throw new Error("Streaming request timed out");
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage =
          errorData.error?.message ||
          errorData.message ||
          errorData.error ||
          `API error: ${response.status}`;
      } catch {
        errorMessage = errorText || `API error: ${response.status}`;
      }
      logger.logReasoning("AGENT_STREAM_ERROR", { status: response.status, errorMessage });
      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let insideThinkBlock = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            let content = parsed.choices?.[0]?.delta?.content;
            if (!content) continue;

            // Strip Qwen3 <think> blocks from streamed output
            if (isLocalProvider) {
              if (insideThinkBlock) {
                const endIdx = content.indexOf("</think>");
                if (endIdx !== -1) {
                  insideThinkBlock = false;
                  content = content.slice(endIdx + 8);
                } else {
                  continue;
                }
              }
              const startIdx = content.indexOf("<think>");
              if (startIdx !== -1) {
                const before = content.slice(0, startIdx);
                const after = content.slice(startIdx + 7);
                const endIdx = after.indexOf("</think>");
                if (endIdx !== -1) {
                  content = before + after.slice(endIdx + 8);
                } else {
                  insideThinkBlock = true;
                  content = before;
                }
              }
              if (!content) continue;
            }

            yield content;
          } catch {
            // skip malformed SSE chunks
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      this.streamAbortController = null;
      reader.releaseLock();
    }
  }

  async *processTextStreamingAI(
    messages: Array<{ role: string; content: string }>,
    model: string,
    provider: string,
    config: ReasoningConfig & { systemPrompt: string },
    tools?: Record<string, import("ai").Tool>
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    if (!tools) {
      const contentGen = this.processTextStreaming(messages, model, provider, config);
      for await (const text of contentGen) {
        yield { type: "content", text };
      }
      yield { type: "done", finishReason: "stop" };
      return;
    }

    const serverResult = await window.electronAPI.llamaServerStart(model);
    if (!serverResult.success || !serverResult.port) {
      throw new Error(serverResult.error || "Failed to start local model server");
    }
    const baseURL = `http://127.0.0.1:${serverResult.port}/v1`;

    const aiModel = getAIModel("local", model, "no-key", baseURL);

    logger.logReasoning("AGENT_AI_SDK_STREAM_REQUEST", {
      model,
      provider: "local",
      hasTools: !!tools,
      toolCount: tools ? Object.keys(tools).length : 0,
      messageCount: messages.length,
    });

    const result = streamText({
      model: aiModel,
      messages: messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      tools: tools || undefined,
      stopWhen: stepCountIs(tools ? ReasoningService.MAX_TOOL_STEPS : 1),
      temperature: config.temperature ?? 0.3,
      maxOutputTokens: config.maxTokens || 4096,
    });

    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        yield { type: "content", text: chunk.text };
      } else if (chunk.type === "tool-call") {
        yield {
          type: "tool_calls",
          calls: [
            {
              id: chunk.toolCallId,
              name: chunk.toolName,
              arguments: JSON.stringify(chunk.input),
            },
          ],
        };
      } else if (chunk.type === "tool-result") {
        const output = chunk.output;
        const displayText =
          typeof output === "string" ? output : output?.error ? String(output.error) : "Done";
        yield {
          type: "tool_result",
          callId: chunk.toolCallId,
          toolName: chunk.toolName,
          displayText,
        };
      } else if (chunk.type === "finish") {
        yield { type: "done", finishReason: chunk.finishReason };
      }
    }
  }

  cancelActiveStream(): void {
    this.streamAbortController?.abort();
    this.streamAbortController = null;
  }

  private streamFromIPC(
    messages: Array<{ role: string; content: string | Array<unknown> }>,
    opts: {
      systemPrompt?: string;
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    }
  ): AsyncGenerator<
    {
      type: string;
      text?: string;
      id?: string;
      name?: string;
      arguments?: string;
      finishReason?: string;
    },
    void,
    unknown
  > {
    type StreamEvent = {
      type: string;
      text?: string;
      id?: string;
      name?: string;
      arguments?: string;
      finishReason?: string;
    };
    const queue: Array<StreamEvent | { type: "__error"; error: string } | { type: "__end" }> = [];
    let resolve: (() => void) | null = null;

    const cleanupChunk = window.electronAPI?.onAgentStreamChunk?.((chunk) => {
      queue.push(chunk);
      resolve?.();
    });
    const cleanupError = window.electronAPI?.onAgentStreamError?.((err) => {
      queue.push({ type: "__error", error: err.error });
      resolve?.();
    });
    const cleanupEnd = window.electronAPI?.onAgentStreamEnd?.(() => {
      queue.push({ type: "__end" });
      resolve?.();
    });

    const cleanup = () => {
      cleanupChunk?.();
      cleanupError?.();
      cleanupEnd?.();
    };

    window.electronAPI?.startAgentStream?.(messages, opts);

    const generator = async function* () {
      try {
        while (true) {
          if (queue.length === 0) {
            await new Promise<void>((r) => {
              resolve = r;
            });
            resolve = null;
          }

          while (queue.length > 0) {
            const item = queue.shift()!;
            if (item.type === "__end") return;
            if (item.type === "__error") throw new Error((item as { error: string }).error);
            yield item as StreamEvent;
          }
        }
      } finally {
        cleanup();
      }
    };

    return generator();
  }

  async *processTextStreamingCloud(
    messages: Array<{ role: string; content: string | Array<unknown> }>,
    config: {
      systemPrompt: string;
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
      executeToolCall?: (
        name: string,
        args: string
      ) => Promise<{ data: string; displayText: string; metadata?: Record<string, unknown> }>;
    }
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    const maxSteps = config.tools?.length ? ReasoningService.MAX_TOOL_STEPS : 1;
    let currentMessages = [...messages];

    for (let step = 0; step < maxSteps; step++) {
      const stream = this.streamFromIPC(currentMessages, {
        systemPrompt: config.systemPrompt,
        tools: config.tools,
      });

      const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const ev of stream) {
        if (ev.type === "content") {
          yield { type: "content", text: ev.text as string };
        } else if (ev.type === "tool_call") {
          const call = {
            id: ev.id as string,
            name: ev.name as string,
            arguments: ev.arguments as string,
          };
          pendingToolCalls.push(call);
          yield { type: "tool_calls", calls: [call] };
        }
      }

      if (pendingToolCalls.length === 0 || !config.executeToolCall) {
        yield { type: "done", finishReason: "stop" };
        return;
      }

      for (const call of pendingToolCalls) {
        let toolResult: { data: string; displayText: string; metadata?: Record<string, unknown> };
        try {
          toolResult = await config.executeToolCall(call.name, call.arguments);
        } catch (error) {
          const errMsg = `Error: ${(error as Error).message}`;
          toolResult = { data: errMsg, displayText: errMsg };
        }
        yield {
          type: "tool_result",
          callId: call.id,
          toolName: call.name,
          displayText: toolResult.displayText,
          ...(toolResult.metadata ? { metadata: toolResult.metadata } : {}),
        };

        currentMessages = [
          ...currentMessages,
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: call.id,
                toolName: call.name,
                input: JSON.parse(call.arguments),
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: call.id,
                toolName: call.name,
                output: { type: "text", value: toolResult.data },
              },
            ],
          },
        ];
      }
    }

    yield { type: "done", finishReason: "stop" };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const localAvailable = await window.electronAPI?.checkLocalReasoningAvailable?.();

      logger.logReasoning("API_KEY_CHECK", {
        hasLocal: !!localAvailable,
      });

      return !!localAvailable;
    } catch (error) {
      logger.logReasoning("API_KEY_CHECK_ERROR", {
        error: (error as Error).message,
        stack: (error as Error).stack,
        name: (error as Error).name,
      });
      return false;
    }
  }

  clearApiKeyCache(provider?: string): void {
    if (provider) {
      if (provider !== "custom") {
        this.apiKeyCache.delete(provider);
      }
      logger.logReasoning("API_KEY_CACHE_CLEARED", { provider });
    } else {
      this.apiKeyCache.clear();
      logger.logReasoning("API_KEY_CACHE_CLEARED", { provider: "all" });
    }
  }

  destroy(): void {
    this.cancelActiveStream();
    if (this.cacheCleanupStop) {
      this.cacheCleanupStop();
    }
  }
}

export default new ReasoningService();
