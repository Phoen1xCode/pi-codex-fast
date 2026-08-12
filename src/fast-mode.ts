import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CODEX_PROVIDER_ID,
  CODEX_RESPONSES_API_ID,
  FAST_SERVICE_TIER,
  SUPPORTED_MODEL_IDS,
  isSupportedModelId,
} from "./models.ts";

export type FastModeContext = Pick<ExtensionContext, "model" | "modelRegistry">;

type Eligibility = { eligible: true } | { eligible: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  return { eligible: true };
}

export function injectFastServiceTier(
  payload: unknown,
  ctx: FastModeContext,
  enabled: boolean,
): Record<string, unknown> | undefined {
  if (!enabled || !getEligibility(ctx).eligible || !isRecord(payload)) {
    return undefined;
  }
  if (payload.model !== ctx.model?.id || "service_tier" in payload) {
    return undefined;
  }
  return { ...payload, service_tier: FAST_SERVICE_TIER };
}

export function describeFastMode(ctx: FastModeContext, enabled: boolean): string {
  if (!enabled) return "Codex Fast mode is off globally.";

  const eligibility = getEligibility(ctx);
  if (eligibility.eligible) {
    return `Codex Fast mode is on globally and active for ${ctx.model?.provider}/${ctx.model?.id}.`;
  }
  return `Codex Fast mode is on globally but inactive: ${eligibility.reason}.`;
}
