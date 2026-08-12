import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";

export const SETTINGS_KEY = "@phoen1xcode/pi-codex-fast";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSettings(json: string): JsonRecord {
  const settings: unknown = JSON.parse(json);
  if (!isRecord(settings)) {
    throw new Error("Pi settings.json must contain a JSON object");
  }
  return settings;
}

export function getGlobalSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, "settings.json");
}

export function readGlobalFastMode(agentDir = getAgentDir()): boolean {
  const settingsPath = getGlobalSettingsPath(agentDir);
  if (!existsSync(settingsPath)) return false;

  const settings = parseSettings(readFileSync(settingsPath, "utf8"));
  const config = settings[SETTINGS_KEY];
  return isRecord(config) && config.enabled === true;
}

export async function writeGlobalFastMode(
  enabled: boolean,
  agentDir = getAgentDir(),
): Promise<void> {
  mkdirSync(agentDir, { recursive: true });
  const settingsPath = getGlobalSettingsPath(agentDir);
  const release = await lockfile.lock(settingsPath, {
    realpath: false,
    retries: { retries: 10, factor: 1, minTimeout: 20, maxTimeout: 20 },
  });
  const temporaryPath = `${settingsPath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    const settings = existsSync(settingsPath)
      ? parseSettings(readFileSync(settingsPath, "utf8"))
      : {};
    const currentConfig = isRecord(settings[SETTINGS_KEY]) ? settings[SETTINGS_KEY] : {};
    settings[SETTINGS_KEY] = { ...currentConfig, enabled };

    writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: "utf8",
      mode: existsSync(settingsPath) ? statSync(settingsPath).mode : 0o600,
    });
    renameSync(temporaryPath, settingsPath);
  } finally {
    rmSync(temporaryPath, { force: true });
    await release();
  }
}
