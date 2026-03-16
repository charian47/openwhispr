export interface ToolResult {
  success: boolean;
  data: unknown;
  displayText: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict: true;
  };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  toOpenAIFormat(): OpenAIFunctionTool[] {
    return this.getAll().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: true,
      },
    }));
  }
}
