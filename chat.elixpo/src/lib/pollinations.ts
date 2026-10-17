export const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || "";
export const POLLINATIONS_BASE_URL = "https://gen.pollinations.ai";

export type Tier = "FREE" | "PRO" | "MAX";

export interface Model {
  id: string;
  name: string;
  provider: string;
  tier: Tier;
  description: string;
}

export const TEXT_MODELS: Model[] = [
  { id: "openai", name: "GPT-5 Mini", provider: "openai", tier: "FREE", description: "Fast & Balanced" },
  { id: "mistral", name: "Mistral Small", provider: "mistral", tier: "FREE", description: "Efficient & Cost-Effective" },
  { id: "deepseek", name: "DeepSeek V3.2", provider: "deepseek", tier: "FREE", description: "Efficient Reasoning" },
  { id: "gemini-fast", name: "Gemini Flash", provider: "google", tier: "FREE", description: "Ultra Fast & Cost-Effective" },
  
  { id: "openai-large", name: "GPT-5.2", provider: "openai", tier: "PRO", description: "Most Powerful & Intelligent" },
  { id: "gemini", name: "Gemini 3 Flash", provider: "google", tier: "PRO", description: "Pro-Grade Reasoning" },
  { id: "claude", name: "Claude Sonnet", provider: "anthropic", tier: "PRO", description: "Most Capable & Balanced" },
  { id: "kimi", name: "Kimi K2.5", provider: "moonshot", tier: "PRO", description: "Flagship Agentic Model" },

  { id: "claude-large", name: "Claude Opus", provider: "anthropic", tier: "MAX", description: "Most Intelligent Model" },
  { id: "gemini-large", name: "Gemini 3.1 Pro", provider: "google", tier: "MAX", description: "Most Intelligent Model with 1M Context" },
  { id: "grok-reasoning", name: "Grok Reasoning", provider: "xai", tier: "MAX", description: "Chain-of-Thought Reasoning" },
];

export const DEFAULT_MODEL = "openai";

export function getModelById(id: string): Model | undefined {
  return TEXT_MODELS.find(m => m.id === id);
}
