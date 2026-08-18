import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CODEX_PROVIDER_ID,
  CODEX_RESPONSES_API_ID,
  SUPPORTED_MODEL_IDS,
  isSupportedModelId,
} from "./models.ts";

export type FastModeContext = Pick<ExtensionContext, "model" | "modelRegistry">;

type Eligibility =
  | { eligible: true; model: NonNullable<FastModeContext["model"]> }
  | { eligible: false; reason: string };

export function getEligibility(ctx: FastModeContext): Eligibility {
  const model = ctx.model;
  if (!model) return { eligible: false, reason: "no model is selected" };
  if (model.provider !== CODEX_PROVIDER_ID) {
    return {
      eligible: false,
      reason: `provider must be ${CODEX_PROVIDER_ID}`,
    };
  }
  if (model.api !== CODEX_RESPONSES_API_ID) {
    return {
      eligible: false,
      reason: `API must be ${CODEX_RESPONSES_API_ID}`,
    };
  }
  if (!isSupportedModelId(model.id)) {
    return {
      eligible: false,
      reason: `model must be one of: ${SUPPORTED_MODEL_IDS.join(", ")}`,
    };
  }
  if (!ctx.modelRegistry.isUsingOAuth(model)) {
    return {
      eligible: false,
      reason: "ChatGPT/Codex OAuth login is required",
    };
  }
  return { eligible: true, model };
}

export function describeFastMode(ctx: FastModeContext, enabled: boolean): string {
  if (!enabled) return "Codex Fast mode is off globally.";

  const eligibility = getEligibility(ctx);
  if (eligibility.eligible) {
    return `Codex Fast mode is on globally and active for ${eligibility.model.provider}/${eligibility.model.id}.`;
  }
  return `Codex Fast mode is on globally but inactive: ${eligibility.reason}.`;
}
