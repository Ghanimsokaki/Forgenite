// Model catalogue helpers for the NVIDIA NIM API (https://build.nvidia.com).
//
// CURATED_MODELS is the preset list shown before / without an API key.
// When a key is available, /api/models fetches the full live catalogue from
// https://integrate.api.nvidia.com/v1/models and the UI uses that instead.

export const PUBLISHERS = {
  meta: "Meta",
  nvidia: "NVIDIA",
  mistralai: "Mistral AI",
  "nv-mistralai": "NVIDIA · Mistral",
  qwen: "Qwen",
  "deepseek-ai": "DeepSeek",
  microsoft: "Microsoft",
  google: "Google",
  bigcode: "BigCode",
  "01-ai": "01.AI",
  writer: "Writer",
  ai21: "AI21",
};

export function publisherOf(id) {
  const prefix = String(id || "").split("/")[0];
  return PUBLISHERS[prefix] || prefix || "Community";
}

export function shortName(id) {
  const parts = String(id || "").split("/");
  return parts[parts.length - 1] || String(id);
}

export const DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

export const CURATED_MODELS = [
  {
    id: "meta/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    publisher: "Meta",
    description: "Flagship open model — best all-round chat quality.",
  },
  {
    id: "meta/llama-3.1-405b-instruct",
    name: "Llama 3.1 405B",
    publisher: "Meta",
    description: "The largest Llama — top-tier reasoning and knowledge.",
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B",
    publisher: "Meta",
    description: "Strong general-purpose assistant.",
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B",
    publisher: "Meta",
    description: "Small and fast — great for quick questions.",
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    name: "Nemotron 70B",
    publisher: "NVIDIA",
    description: "NVIDIA-tuned Llama focused on helpfulness.",
  },
  {
    id: "nvidia/nemotron-4-340b-instruct",
    name: "Nemotron-4 340B",
    publisher: "NVIDIA",
    description: "NVIDIA's largest in-house model.",
  },
  {
    id: "deepseek-ai/deepseek-r1",
    name: "DeepSeek R1",
    publisher: "DeepSeek",
    description: "Reasoning-first model for math, logic and code.",
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    name: "Qwen2.5 Coder 32B",
    publisher: "Qwen",
    description: "Specialised in code generation and refactoring.",
  },
  {
    id: "qwen/qwen2.5-7b-instruct",
    name: "Qwen2.5 7B",
    publisher: "Qwen",
    description: "Compact multilingual all-rounder.",
  },
  {
    id: "mistralai/mistral-large-2-instruct",
    name: "Mistral Large 2",
    publisher: "Mistral AI",
    description: "Mistral's flagship — strong reasoning.",
  },
  {
    id: "mistralai/mixtral-8x22b-instruct-v0.1",
    name: "Mixtral 8x22B",
    publisher: "Mistral AI",
    description: "Sparse mixture-of-experts workhorse.",
  },
  {
    id: "mistralai/mistral-7b-instruct-v0.3",
    name: "Mistral 7B v0.3",
    publisher: "Mistral AI",
    description: "Efficient classic, still very capable.",
  },
  {
    id: "google/gemma-2-27b-it",
    name: "Gemma 2 27B",
    publisher: "Google",
    description: "Google's efficient open model.",
  },
  {
    id: "microsoft/phi-3.5-mini-instruct",
    name: "Phi 3.5 Mini",
    publisher: "Microsoft",
    description: "Tiny but surprisingly smart.",
  },
];
