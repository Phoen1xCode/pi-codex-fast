import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { FAST_COMMAND_USAGE, getFastCommandCompletions, parseFastCommand } from "./command.ts";
import { describeFastMode, injectFastServiceTier } from "./fast-mode.ts";
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

export function createCodexFastExtension(
  options: CodexFastExtensionOptions = {},
): ExtensionFactory {
  return (pi: ExtensionAPI): void => {
    const agentDir = options.agentDir ?? getAgentDir();
    let enabled = false;

    pi.on("session_start", (_event, ctx) => {
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

    pi.on("before_provider_request", (event, ctx) =>
      injectFastServiceTier(event.payload, ctx, enabled),
    );
  };
}

export default createCodexFastExtension();
