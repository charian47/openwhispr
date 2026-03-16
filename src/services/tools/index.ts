import { ToolRegistry } from "./ToolRegistry";
import { searchNotesTool } from "./searchNotesTool";
import { clipboardTool } from "./clipboardTool";
import { webSearchTool } from "./webSearchTool";
import { calendarTool } from "./calendarTool";

export { ToolRegistry } from "./ToolRegistry";
export type { ToolDefinition, ToolResult } from "./ToolRegistry";

interface ToolRegistrySettings {
  isSignedIn: boolean;
  gcalConnected: boolean;
}

export function createToolRegistry(settings: ToolRegistrySettings): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(searchNotesTool);
  registry.register(clipboardTool);

  if (settings.isSignedIn) {
    registry.register(webSearchTool);
  }

  if (settings.gcalConnected) {
    registry.register(calendarTool);
  }

  return registry;
}
