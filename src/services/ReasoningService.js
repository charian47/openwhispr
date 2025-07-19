import { getModelProvider } from "../utils/languages.ts";

const REASONING_PROMPT = `You are a text formatting assistant. Your job is to clean up and format voice-to-text transcriptions while preserving the speaker's natural tone and intent.

Rules:
1. If the speaker gives instructions like "scratch that", "ignore that", "delete the previous part", "never mind", or similar - follow them and remove the referenced content
2. If the speaker says "put this in a list" or starts listing items, format as a proper list
3. Fix obvious speech-to-text errors, punctuation, and capitalization
4. Maintain the speaker's natural tone and style
5. Don't add content - only clean up what's there
6. If unclear, err on the side of minimal changes

Transcript to format:
"{{text}}"

Formatted text:`;

class ReasoningService {
  constructor() {
    this.apiKeyCache = new Map();
  }

  async processText(text, model = "gpt-3.5-turbo") {
    const provider = getModelProvider(model);

    try {
      switch (provider) {
        case "openai":
          return await this.processWithOpenAI(text, model);
        case "anthropic":
          return await this.processWithAnthropic(text, model);
        default:
          throw new Error(`Unsupported reasoning provider: ${provider}`);
      }
    } catch (error) {
      console.error(`ReasoningService error (${provider}):`, error.message);
      throw error;
    }
  }

  async processWithOpenAI(text, model) {
    const apiKey = await this.getAPIKey("openai");
    const prompt = REASONING_PROMPT.replace("{{text}}", text);
    const maxTokens = Math.max(100, text.length * 2);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const reasonedText = result.choices[0]?.message?.content?.trim();

    if (!reasonedText) {
      throw new Error("Empty response from OpenAI");
    }

    return reasonedText;
  }

  async processWithAnthropic(text, model) {
    const apiKey = await this.getAPIKey("anthropic");
    const prompt = REASONING_PROMPT.replace("{{text}}", text);
    const maxTokens = Math.max(100, text.length * 2);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const reasonedText = result.content[0]?.text?.trim();

    if (!reasonedText) {
      throw new Error("Empty response from Anthropic");
    }

    return reasonedText;
  }

  async getAPIKey(provider) {
    // Check cache first
    if (this.apiKeyCache.has(provider)) {
      return this.apiKeyCache.get(provider);
    }

    let apiKey;

    switch (provider) {
      case "openai":
        apiKey =
          (await window.electronAPI?.getOpenAIKey()) ||
          localStorage.getItem("openaiApiKey");
        break;
      case "anthropic":
        apiKey =
          (await window.electronAPI?.getAnthropicKey()) ||
          localStorage.getItem("anthropicApiKey");
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (
      !apiKey ||
      apiKey.trim() === "" ||
      apiKey === "your_openai_api_key_here"
    ) {
      throw new Error(`${provider} API key not found`);
    }

    // Cache the key
    this.apiKeyCache.set(provider, apiKey);
    return apiKey;
  }

  clearCache() {
    this.apiKeyCache.clear();
  }
}

export default new ReasoningService();
