import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Renderer-side AI SDK factory — local llama.cpp only.
// Enterprise providers (bedrock/azure/vertex) run in the main process via
// `process-enterprise-reasoning` IPC.
// See `src/helpers/enterpriseAiProviders.js` for the main-process counterpart.

export function getAIModel(
  provider: string,
  model: string,
  _apiKey: string,
  baseURL?: string
): LanguageModel {
  // Only local llama.cpp is supported in local-only mode
  return createOpenAI({ apiKey: "no-key", baseURL }).chat(model);
}
