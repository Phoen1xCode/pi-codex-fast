export const FAST_COMMAND_ACTIONS = ["on", "off", "status"] as const;
export const FAST_COMMAND_USAGE = "Usage: /fast [on|off|status]";

export type FastCommandAction = (typeof FAST_COMMAND_ACTIONS)[number] | "toggle";

export function parseFastCommand(args: string): FastCommandAction | undefined {
  const action = args.trim().toLowerCase();
  if (action === "") return "toggle";
  return FAST_COMMAND_ACTIONS.find((candidate) => candidate === action);
}

export function getFastCommandCompletions(prefix: string) {
  const normalized = prefix.trim().toLowerCase();
  const matches = FAST_COMMAND_ACTIONS.filter((action) => action.startsWith(normalized));
  return matches.length ? matches.map((value) => ({ value, label: value })) : null;
}
