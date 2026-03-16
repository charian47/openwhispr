import type { ToolDefinition, ToolResult } from "./ToolRegistry";

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "Search the web for current information. Returns relevant web results with titles and snippets.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      numResults: {
        type: "number",
        description: "Number of results to return (default 5)",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  readOnly: true,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const numResults = typeof args.numResults === "number" ? args.numResults : 5;

    try {
      const results = await window.electronAPI.agentWebSearch!(query, numResults);

      return {
        success: true,
        data: results,
        displayText: `Found web results for "${query}"`,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        displayText: `Web search failed: ${(error as Error).message}`,
      };
    }
  },
};
