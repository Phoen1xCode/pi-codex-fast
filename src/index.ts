import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type {
  Api,
  Context,
  Model,
  OpenAICodexResponsesOptions,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openAICodexResponsesApi } from "@earendil-works/pi-ai/compat";
import { toCodexStreamOptions } from "./codex-options.ts";
import { FAST_COMMAND_USAGE, getFastCommandCompletions, parseFastCommand } from "./command.ts";
import { describeFastMode, getEligibility } from "./fast-mode.ts";
import { CODEX_PROVIDER_ID, CODEX_RESPONSES_API_ID, FAST_SERVICE_TIER } from "./models.ts";
import { readGlobalFastMode, writeGlobalFastMode } from "./settings.ts";

export type CodexFastExtensionOptions = {
  agentDir?: string;
};

function notify(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const codexApi = openAICodexResponsesApi();

function streamCodex(
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions | undefined,
  fast: boolean,
) {
  if (!fast) return codexApi.streamSimple(model, context, options);

  const streamOptions: OpenAICodexResponsesOptions = {
    ...toCodexStreamOptions(model, context, options),
    serviceTier: FAST_SERVICE_TIER,
  };
  return codexApi.stream(model, context, streamOptions);
}

export function createCodexFastExtension(
  options: CodexFastExtensionOptions = {},
): ExtensionFactory {
  return (pi: ExtensionAPI): void => {
    const agentDir = options.agentDir ?? getAgentDir();
    let enabled = false;
    let modelRegistry: ExtensionContext["modelRegistry"] | undefined;

    pi.registerProvider(CODEX_PROVIDER_ID, {
      api: CODEX_RESPONSES_API_ID,
      streamSimple: (model, context, options) =>
        streamCodex(
          model,
          context,
          options,
          enabled &&
            modelRegistry !== undefined &&
            getEligibility({ model, modelRegistry }).eligible,
        ),
    });

    pi.on("session_start", (_event, ctx) => {
      modelRegistry = ctx.modelRegistry;
      try {
        enabled = readGlobalFastMode(agentDir);
      } catch (error) {
        enabled = false;
        notify(
          ctx,
          `Codex Fast mode is disabled because global settings could not be read: ${errorMessage(error)}`,
          "warning",
        );
      }
    });

    pi.registerCommand("fast", {
      description: "Set Codex Fast mode: /fast [on|off|status]",
      getArgumentCompletions: getFastCommandCompletions,
      handler: async (args, ctx) => {
        const action = parseFastCommand(args);
        if (!action) {
          notify(ctx, FAST_COMMAND_USAGE, "warning");
          return;
        }
        if (action === "status") {
          notify(ctx, describeFastMode(ctx, enabled));
          return;
        }

        const nextEnabled = action === "on" || (action === "toggle" && !enabled);
        try {
          await writeGlobalFastMode(nextEnabled, agentDir);
          enabled = nextEnabled;
          notify(ctx, describeFastMode(ctx, enabled));
        } catch (error) {
          notify(ctx, `Could not save Codex Fast mode: ${errorMessage(error)}`, "error");
        }
      },
    });
  };
}

export default createCodexFastExtension();
