import ReasoningService, { type AgentStreamChunk } from "./ReasoningService";
import type { ToolRegistry, ToolResult } from "./tools";
import logger from "../utils/logger";

export interface AgentLoopCallbacks {
  onContentChunk: (text: string) => void;
  onToolStart: (toolName: string, args: Record<string, unknown>) => void;
  onToolComplete: (toolName: string, result: ToolResult) => void;
  onError: (error: Error) => void;
}

export interface AgentLoopOptions {
  messages: Array<{ role: string; content: string }>;
  model: string;
  provider: string;
  systemPrompt: string;
  tools: ToolRegistry;
  callbacks: AgentLoopCallbacks;
  isCloud?: boolean;
  maxIterations?: number;
}

interface ToolCallMessage {
  role: "assistant";
  tool_calls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface ToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

type Message = { role: string; content: string } | ToolCallMessage | ToolResultMessage;

async function executeTool(
  tools: ToolRegistry,
  name: string,
  rawArgs: string,
  callbacks: AgentLoopCallbacks
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    const result: ToolResult = {
      success: false,
      data: null,
      displayText: `Unknown tool: ${name}`,
    };
    return result;
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    const result: ToolResult = {
      success: false,
      data: null,
      displayText: `Invalid arguments for ${name}: failed to parse JSON`,
    };
    return result;
  }

  callbacks.onToolStart(name, args);

  try {
    const result = await tool.execute(args);
    callbacks.onToolComplete(name, result);
    return result;
  } catch (error) {
    const result: ToolResult = {
      success: false,
      data: null,
      displayText: `Tool ${name} error: ${(error as Error).message}`,
    };
    callbacks.onToolComplete(name, result);
    return result;
  }
}

export async function run(options: AgentLoopOptions): Promise<void> {
  const {
    messages: initialMessages,
    model,
    provider,
    systemPrompt,
    tools,
    callbacks,
    maxIterations = 5,
  } = options;

  const conversationMessages: Message[] = [
    { role: "system", content: systemPrompt },
    ...initialMessages,
  ];

  const toolDefs = tools.toOpenAIFormat();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    try {
      const stream = ReasoningService.processTextStreamingWithTools(
        conversationMessages as Array<{ role: string; content: string }>,
        model,
        provider,
        { systemPrompt },
        toolDefs
      ) as AsyncGenerator<AgentStreamChunk, void, unknown>;

      for await (const chunk of stream) {
        if (chunk.type === "content") {
          callbacks.onContentChunk(chunk.text);
        } else if (chunk.type === "tool_calls") {
          pendingToolCalls = chunk.calls;
        } else if (chunk.type === "done") {
          if (pendingToolCalls.length === 0) return;
        }
      }
    } catch (error) {
      callbacks.onError(error as Error);
      return;
    }

    if (pendingToolCalls.length === 0) return;

    // Append assistant message with tool_calls
    const assistantMessage: ToolCallMessage = {
      role: "assistant",
      tool_calls: pendingToolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
    conversationMessages.push(assistantMessage);

    // Classify calls: read-only tools run in parallel, write tools run sequentially
    const readOnlyCalls = pendingToolCalls.filter((c) => tools.get(c.name)?.readOnly);
    const writeCalls = pendingToolCalls.filter((c) => !tools.get(c.name)?.readOnly);

    const toolResults: ToolResultMessage[] = [];

    // Execute read-only tools in parallel
    if (readOnlyCalls.length > 0) {
      const results = await Promise.all(
        readOnlyCalls.map(async (call) => {
          const result = await executeTool(tools, call.name, call.arguments, callbacks);
          return { id: call.id, result };
        })
      );
      for (const { id, result } of results) {
        toolResults.push({
          role: "tool",
          tool_call_id: id,
          content: JSON.stringify({ success: result.success, data: result.data }),
        });
      }
    }

    // Execute write tools sequentially
    for (const call of writeCalls) {
      const result = await executeTool(tools, call.name, call.arguments, callbacks);
      toolResults.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ success: result.success, data: result.data }),
      });
    }

    conversationMessages.push(...toolResults);

    logger.logReasoning("AGENT_LOOP_ITERATION", {
      iteration: iteration + 1,
      toolCallCount: pendingToolCalls.length,
      toolNames: pendingToolCalls.map((c) => c.name),
    });
  }

  logger.warn("Agent loop reached max iterations", { maxIterations }, "agent");
}
