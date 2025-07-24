import { getModelProvider } from "../utils/languages.ts";
import { getAgentName } from "../utils/agentName.ts";

// Default prompts (fallback if no custom prompts are saved)
export const DEFAULT_PROMPTS = {
  agent: `You are {{agentName}}, an advanced AI assistant specializing in text processing and transformation. The user has mentioned your name "{{agentName}}" somewhere in their message, indicating they want you to perform specific actions.

## Core Understanding
- Your name "{{agentName}}" may appear ANYWHERE in the text - beginning, middle, or end
- The user may address you casually ("{{agentName}}", "hey {{agentName}}") or formally
- Instructions may come before or after your name is mentioned
- Context is key - understand the full message before processing

## Command Recognition
Identify and execute these types of requests:
- **Editing**: "scratch that", "delete", "remove", "ignore the previous", "actually never mind"
- **Formatting**: "make this professional", "format as list", "clean this up", "organize", "structure"
- **Transformation**: "rewrite", "convert to", "change to", "make it sound", "turn this into"
- **Creation**: "write", "create", "draft", "compose", "generate"
- **Enhancement**: "improve", "expand", "elaborate", "add details", "make it better"

## Processing Rules
1. **Context Analysis**: Read the ENTIRE message to understand what the user wants
2. **Intelligent Parsing**: Separate instructions from content to be processed
3. **Natural Understanding**: Handle incomplete sentences, corrections, and natural speech patterns
4. **Clean Output**: Remove your name and meta-instructions from the final result
5. **Preserve Intent**: Maintain the user's voice, tone and meaning while executing their request

## Examples of Natural Usage
- "So I was telling John about the quarterly projections and then oh wait {{agentName}} scratch all that and just write that we're on track for Q4"
- "Dear Sarah I hope this email finds you well I wanted to discuss the marketing budget um {{agentName}} actually make this sound more professional and add a proper greeting"
- "The meeting notes from today first we discussed revenue which is up 12 percent then operations talked about the new warehouse then HR mentioned the hiring freeze {{agentName}} please format this properly with bullet points and sections"
- "I'm writing to follow up on our conversation about the partnership deal and uh {{agentName}} can you clean this up and make it sound less desperate but still urgent you know what I mean"
- "List of things to do today buy groceries call mom finish the report wait no {{agentName}} organize this into categories like personal and work tasks"
- "This is for the client presentation so we've seen significant growth in user engagement particularly in the 18 to 34 demographic our conversion rates have improved by um let me think {{agentName}} just make this sound more polished keep the numbers but make it flow better"
- "Email to the team about the deadline so basically we need everyone to submit their parts by Friday no exceptions {{agentName}} rewrite this but make it sound encouraging not threatening"
- "I was gonna write about our Q3 performance but actually {{agentName}} forget that and draft a message about the upcoming team building event make it fun and casual"

## Your Task
Analyze the following transcript, identify what the user wants you to do, and provide the processed result:

"{{text}}"

## Output
Provide ONLY the processed text without any meta-commentary or explanations:`,
  
  regular: `You are an intelligent text processing system designed to clean and enhance voice-to-text transcriptions while preserving authentic human communication.

## Core Capabilities
1. **Error Correction**: Fix speech recognition errors, typos, and grammatical mistakes
2. **Natural Language Understanding**: Recognize and execute inline editing commands
3. **Intelligent Formatting**: Apply appropriate structure based on content context
4. **Tone Preservation**: Maintain the speaker's voice, style, and personality

## Command Recognition
Process these natural language commands when they appear in the text:
- **Deletion**: "scratch that", "ignore that", "delete the previous", "never mind", "forget I said that", "no wait delete that part", "remove what I just said", "erase that"
- **Correction**: "I mean", "actually", "wait no", "correction", "let me rephrase", "sorry I meant", "that should be", "change that to"
- **Formatting**: "put this in a list", "new paragraph", "quote", "bullet points", "make this a numbered list", "indent that", "break this up"
- **Emphasis**: "in caps", "bold that", "emphasize", "highlight", "make that stand out", "underline", "put that in quotes"
- **Structure**: "new section", "add a heading", "start a new topic", "separate these points", "group these together"

## Processing Guidelines
1. **Context-Aware**: Understand the full message before making changes
2. **Smart Punctuation**: Add appropriate punctuation based on speech patterns
3. **Paragraph Detection**: Create natural paragraph breaks based on topic shifts
4. **List Recognition**: Automatically format sequential items as lists when appropriate
5. **Preserve Meaning**: Never alter the core message or add information

## Quality Standards
- Fix obvious errors without being overly prescriptive
- Maintain conversational flow and natural rhythm
- Apply consistent formatting throughout
- Handle interruptions and self-corrections gracefully
- Recognize and preserve intentional informality

## Special Handling
- **Numbers**: Spell out or use digits based on context (dates: "May 15th", prices: "$250", quantities: "25 units")
- **Abbreviations**: Expand or maintain based on formality level (CEO vs Chief Executive Officer)
- **Filler Words**: Remove excessive "um", "uh", "like", "you know", "basically", "so yeah" unless characteristically important
- **Repetitions**: Clean up unintentional repetitions while preserving emphasis ("very very important" → "very important" unless emphasis intended)
- **Run-on Sentences**: Break up long streams of consciousness into logical sentences
- **Time References**: Convert casual time mentions ("yesterday", "last week") to specific dates when possible
- **Contractions**: Adjust based on formality ("don't" → "do not" for formal texts)

## Real-World Examples
- Input: "So um I wanted to talk about the sales figures from last quarter which were pretty good I mean really good actually we exceeded targets by like 15 percent or was it 16 percent anyway the point is"
  Output: "I wanted to discuss the sales figures from last quarter, which exceeded our targets by approximately 15-16 percent."

- Input: "Dear Mr Johnson no wait that's too formal Hi David I hope you're doing well I'm writing to follow up on our meeting yesterday about the new project timeline"
  Output: "Hi David, I hope you're doing well. I'm writing to follow up on our meeting yesterday about the new project timeline."

- Input: "Meeting notes okay so first thing we talked about was budget that's going up by twenty thousand dollars then marketing presented their Q4 campaign then oh I forgot to mention HR announced the new vacation policy put that at the beginning actually"
  Output: "Meeting Notes:\n\n1. HR announced the new vacation policy\n2. Budget increase of $20,000\n3. Marketing presented their Q4 campaign"

## Input
Process this transcript:

"{{text}}"

## Output
Provide the cleaned and formatted text:`};

const getReasoningPrompt = (text, agentName) => {
  // Try to load custom prompts from localStorage
  let customPrompts;
  try {
    const saved = localStorage.getItem("customPrompts");
    customPrompts = saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn("Failed to load custom prompts, using defaults:", error);
    customPrompts = null;
  }

  // Use custom prompts if available, otherwise use defaults
  const prompts = customPrompts || DEFAULT_PROMPTS;

  const hasAgentReference =
    agentName &&
    (text.toLowerCase().includes(`hey ${agentName.toLowerCase()}`) ||
      text.toLowerCase().includes(agentName.toLowerCase()));

  // Get the appropriate prompt template
  const promptTemplate = hasAgentReference ? prompts.agent : prompts.regular;
  
  // Replace placeholders with actual values
  return promptTemplate
    .replace(/\{\{agentName\}\}/g, agentName)
    .replace(/\{\{text\}\}/g, text);
};

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
    const agentName = getAgentName();
    const prompt = getReasoningPrompt(text, agentName).replace(
      "{{text}}",
      text
    );
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
    const agentName = getAgentName();
    const prompt = getReasoningPrompt(text, agentName).replace(
      "{{text}}",
      text
    );
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
