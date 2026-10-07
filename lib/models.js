// Model catalogue for the NVIDIA NIM API (https://build.nvidia.com).
//
// CURATED_MODELS is the preset list shown before / without an API key —
// a hand-picked selection of the current (Oct 2026) NIM catalogue:
// GLM-5.3, Kimi K3, DeepSeek V4, Nemotron 3, GPT-OSS, Llama 4, Qwen3,
// MiniMax M3, Inkling, Mistral Large 3 and many more.
//
// When a key is available, /api/models fetches the FULL live catalogue
// (~90-100 models, whatever your key can call) from
// https://integrate.api.nvidia.com/v1/models and the UI uses that instead.

export const PUBLISHERS = {
  "z-ai": "Z.ai (Zhipu)",
  moonshotai: "Moonshot AI",
  "deepseek-ai": "DeepSeek",
  nvidia: "NVIDIA",
  meta: "Meta",
  qwen: "Qwen",
  minimaxai: "MiniMax",
  thinkingmachines: "Thinking Machines",
  openai: "OpenAI",
  mistralai: "Mistral AI",
  "nv-mistralai": "NVIDIA · Mistral",
  google: "Google",
  microsoft: "Microsoft",
  ibm: "IBM",
  writer: "Writer",
  "01-ai": "01.AI",
  databricks: "Databricks",
  ai21labs: "AI21 Labs",
  poolside: "Poolside",
  bigcode: "BigCode",
  zyphra: "Zyphra",
  aisingapore: "AI Singapore",
};

export function publisherOf(id) {
  const prefix = String(id || "").split("/")[0];
  return PUBLISHERS[prefix] || prefix || "Community";
}

export function shortName(id) {
  const parts = String(id || "").split("/");
  return parts[parts.length - 1] || String(id);
}

export const DEFAULT_MODEL = "z-ai/glm-5.3";

export const CURATED_MODELS = [
  /* ---------- 2026 flagships ---------- */
  {
    id: "z-ai/glm-5.3",
    name: "GLM-5.3",
    publisher: "Z.ai (Zhipu)",
    description: "Z.ai's newest flagship — 1M context, top coding & agentic benchmarks.",
  },
  {
    id: "z-ai/glm-5.3-flash",
    name: "GLM-5.3 Flash",
    publisher: "Z.ai (Zhipu)",
    description: "Faster, lighter GLM-5.3 — same 1M context.",
  },
  {
    id: "z-ai/glm-5.1",
    name: "GLM-5.1",
    publisher: "Z.ai (Zhipu)",
    description: "Previous Z.ai flagship — agentic long-horizon reasoning.",
  },
  {
    id: "z-ai/glm5",
    name: "GLM-5",
    publisher: "Z.ai (Zhipu)",
    description: "The original GLM-5 release — 128K context.",
  },
  {
    id: "z-ai/glm4.7",
    name: "GLM-4.7",
    publisher: "Z.ai (Zhipu)",
    description: "358B MoE GLM — strong tool calling.",
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    publisher: "Moonshot AI",
    description: "Moonshot's flagship — 1M context, agentic & tool use.",
  },
  {
    id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    publisher: "Moonshot AI",
    description: "Kimi K2.6 — 262K context all-rounder.",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    publisher: "Moonshot AI",
    description: "Kimi K2 with explicit thinking mode.",
  },
  {
    id: "deepseek-ai/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    publisher: "DeepSeek",
    description: "Latest DeepSeek — 1M context, fast reasoning.",
  },
  {
    id: "deepseek-ai/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    publisher: "DeepSeek",
    description: "DeepSeek V4 Flash — 1M context.",
  },
  {
    id: "deepseek-ai/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    publisher: "DeepSeek",
    description: "The heavier DeepSeek V4 variant.",
  },
  {
    id: "deepseek-ai/deepseek-v3.2",
    name: "DeepSeek V3.2",
    publisher: "DeepSeek",
    description: "DeepSeek V3.2 — 128K context.",
  },
  {
    id: "deepseek-ai/deepseek-v3.1",
    name: "DeepSeek V3.1",
    publisher: "DeepSeek",
    description: "DeepSeek V3.1 — 128K context.",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    name: "Nemotron 3 Ultra 550B",
    publisher: "NVIDIA",
    description: "NVIDIA's flagship Nemotron 3 — 1M context.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super 120B",
    publisher: "NVIDIA",
    description: "Nemotron 3 Super MoE — 262K context.",
  },
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    name: "Nemotron 3.5 Lightning 30B",
    publisher: "NVIDIA",
    description: "Fast 30B-A3B Nemotron for quick answers.",
  },
  {
    id: "nvidia/nemotron-nano-3-30b-a3b",
    name: "Nemotron Nano 3 30B",
    publisher: "NVIDIA",
    description: "Compact reasoning Nemotron.",
  },
  {
    id: "minimaxai/minimax-m3",
    name: "MiniMax M3",
    publisher: "MiniMax",
    description: "MiniMax M3 — 1M context, adaptive thinking.",
  },
  {
    id: "minimaxai/minimax-m2.1",
    name: "MiniMax M2.1",
    publisher: "MiniMax",
    description: "MiniMax M2.1 — 1M context.",
  },
  {
    id: "thinkingmachines/inkling",
    name: "Inkling",
    publisher: "Thinking Machines",
    description: "Thinking Machines' model — 1M context, adjustable reasoning effort.",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    publisher: "OpenAI",
    description: "OpenAI's open-weight GPT-OSS.",
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    publisher: "OpenAI",
    description: "OpenAI's compact open-weight model.",
  },

  /* ---------- Meta Llama ---------- */
  {
    id: "meta/llama-4-maverick-17b-128e-instruct",
    name: "Llama 4 Maverick",
    publisher: "Meta",
    description: "Meta's Llama 4 MoE — 1M context.",
  },
  {
    id: "meta/llama-3.1-405b-instruct",
    name: "Llama 3.1 405B",
    publisher: "Meta",
    description: "The largest Llama 3.1 — deep reasoning & knowledge.",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    publisher: "Meta",
    description: "The classic workhorse — great quality per token.",
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
    description: "Small and fast — quick questions.",
  },
  {
    id: "meta/llama-3.2-90b-vision-instruct",
    name: "Llama 3.2 90B Vision",
    publisher: "Meta",
    description: "Vision-capable Llama (works for text chat too).",
  },
  {
    id: "meta/muse-glimmer-30b",
    name: "Muse Glimmer 30B",
    publisher: "Meta",
    description: "Meta's Muse Glimmer — 131K context.",
  },
  {
    id: "meta/codellama-70b",
    name: "CodeLlama 70B",
    publisher: "Meta",
    description: "Code generation specialist.",
  },
  {
    id: "meta/llama2-70b",
    name: "Llama 2 70B",
    publisher: "Meta",
    description: "The 2023 classic (legacy).",
  },

  /* ---------- Qwen ---------- */
  {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    name: "Qwen3 Coder 480B",
    publisher: "Qwen",
    description: "Code specialist MoE — 256K context.",
  },
  {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen3 235B",
    publisher: "Qwen",
    description: "Qwen3 flagship MoE — 128K context.",
  },

  /* ---------- Mistral ---------- */
  {
    id: "mistralai/mistral-large-3-675b-instruct-2512",
    name: "Mistral Large 3",
    publisher: "Mistral AI",
    description: "Mistral's 675B flagship.",
  },
  {
    id: "mistralai/devstral-2-123b-instruct-2512",
    name: "Devstral 2",
    publisher: "Mistral AI",
    description: "Agentic coding model.",
  },
  {
    id: "mistralai/mistral-large-2-instruct",
    name: "Mistral Large 2",
    publisher: "Mistral AI",
    description: "Previous Mistral flagship — strong reasoning.",
  },
  {
    id: "mistralai/mixtral-8x22b-v0.1",
    name: "Mixtral 8x22B",
    publisher: "Mistral AI",
    description: "Sparse mixture-of-experts workhorse.",
  },
  {
    id: "mistralai/codestral-22b-instruct-v0.1",
    name: "Codestral 22B",
    publisher: "Mistral AI",
    description: "Mistral's code model.",
  },
  {
    id: "mistralai/mistral-7b-instruct-v0.3",
    name: "Mistral 7B v0.3",
    publisher: "Mistral AI",
    description: "Efficient classic, still capable.",
  },
  {
    id: "nv-mistralai/mistral-nemo-12b-instruct",
    name: "Mistral NeMo 12B",
    publisher: "NVIDIA · Mistral",
    description: "NVIDIA/Mistral collaboration.",
  },

  /* ---------- Google ---------- */
  {
    id: "google/gemma-4-31b-it",
    name: "Gemma 4 31B",
    publisher: "Google",
    description: "Google's efficient open model — 262K context.",
  },
  {
    id: "google/diffusiongemma-26b-a4b-it",
    name: "DiffusionGemma 26B",
    publisher: "Google",
    description: "Diffusion-based language model (experimental).",
  },
  {
    id: "google/codegemma-7b",
    name: "CodeGemma 7B",
    publisher: "Google",
    description: "Google's code model.",
  },

  /* ---------- NVIDIA (Llama-based & more) ---------- */
  {
    id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    name: "Nemotron Ultra 253B",
    publisher: "NVIDIA",
    description: "Reasoning-focused Nemotron.",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    name: "Nemotron Super 49B v1.5",
    publisher: "NVIDIA",
    description: "Accurate mid-size reasoning model.",
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    name: "Nemotron 70B",
    publisher: "NVIDIA",
    description: "NVIDIA-tuned Llama, helpfulness-focused.",
  },
  {
    id: "nvidia/llama-3.1-nemotron-51b-instruct",
    name: "Nemotron 51B",
    publisher: "NVIDIA",
    description: "Distilled efficiency-focused Nemotron.",
  },
  {
    id: "nvidia/nemotron-4-340b-instruct",
    name: "Nemotron-4 340B",
    publisher: "NVIDIA",
    description: "NVIDIA's large in-house model.",
  },
  {
    id: "nvidia/llama3-chatqa-1.5-70b",
    name: "ChatQA 1.5 70B",
    publisher: "NVIDIA",
    description: "Tuned for RAG / question answering.",
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    name: "Nemotron 3 Nano Omni",
    publisher: "NVIDIA",
    description: "Small omni-capable reasoning model.",
  },

  /* ---------- Others ---------- */
  {
    id: "microsoft/phi-4-mini-flash-reasoning",
    name: "Phi-4 Mini Flash",
    publisher: "Microsoft",
    description: "Tiny fast reasoner.",
  },
  {
    id: "microsoft/phi-3.5-moe-instruct",
    name: "Phi-3.5 MoE",
    publisher: "Microsoft",
    description: "Small mixture-of-experts model.",
  },
  {
    id: "poolside/laguna-xs-2.1",
    name: "Poolside Laguna XS 2.1",
    publisher: "Poolside",
    description: "Code model — 262K context.",
  },
  {
    id: "01-ai/yi-large",
    name: "Yi Large",
    publisher: "01.AI",
    description: "01.AI's flagship.",
  },
  {
    id: "databricks/dbrx-instruct",
    name: "DBRX",
    publisher: "Databricks",
    description: "132B MoE from Databricks.",
  },
  {
    id: "ai21labs/jamba-1.5-large-instruct",
    name: "Jamba 1.5 Large",
    publisher: "AI21 Labs",
    description: "SSM-transformer hybrid, long context.",
  },
  {
    id: "writer/palmyra-creative-122b",
    name: "Palmyra Creative 122B",
    publisher: "Writer",
    description: "Tuned for creative writing.",
  },
  {
    id: "writer/palmyra-med-70b-32k",
    name: "Palmyra Med 70B",
    publisher: "Writer",
    description: "Medical-domain model.",
  },
  {
    id: "writer/palmyra-fin-70b-32k",
    name: "Palmyra Fin 70B",
    publisher: "Writer",
    description: "Finance-domain model.",
  },
  {
    id: "ibm/granite-3.3-8b-instruct",
    name: "Granite 3.3 8B",
    publisher: "IBM",
    description: "IBM's compact enterprise model.",
  },
  {
    id: "ibm/granite-34b-code-instruct",
    name: "Granite 34B Code",
    publisher: "IBM",
    description: "IBM's code model.",
  },
  {
    id: "bigcode/starcoder2-15b",
    name: "StarCoder2 15B",
    publisher: "BigCode",
    description: "Open code-completion model.",
  },
  {
    id: "aisingapore/sea-lion-7b-instruct",
    name: "SEA-LION 7B",
    publisher: "AI Singapore",
    description: "Southeast Asian languages.",
  },
  {
    id: "zyphra/zamba2-7b-instruct",
    name: "Zamba2 7B",
    publisher: "Zyphra",
    description: "Compact SSM-hybrid model.",
  },
];
