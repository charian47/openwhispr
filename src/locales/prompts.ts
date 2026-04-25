import enPrompts from "./en/prompts.json";
import esPrompts from "./es/prompts.json";

export interface PromptBundle {
  cleanupPrompt: string;
  fullPrompt: string;
  dictionarySuffix: string;
}

export const en: PromptBundle = enPrompts;
export const es: PromptBundle = esPrompts;

export const PROMPTS_BY_LOCALE = {
  en,
  es,
} as const;
