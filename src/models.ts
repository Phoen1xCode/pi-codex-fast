export const CODEX_PROVIDER_ID = "openai-codex";
export const CODEX_RESPONSES_API_ID = "openai-codex-responses";
export const FAST_SERVICE_TIER = "priority";

// Add newly verified Fast-mode models here. Keep this an exact allowlist.
export const SUPPORTED_MODEL_IDS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] as const;

const supportedModels = new Set<string>(SUPPORTED_MODEL_IDS);

export function isSupportedModelId(modelId: string): boolean {
  return supportedModels.has(modelId);
}
