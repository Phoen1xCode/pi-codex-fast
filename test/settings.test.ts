import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  SETTINGS_KEY,
  getGlobalSettingsPath,
  readGlobalFastMode,
  writeGlobalFastMode,
} from "../src/settings.ts";

function createAgentDir(t: test.TestContext): string {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-codex-fast-"));
  t.after(() => rmSync(agentDir, { recursive: true, force: true }));
  return agentDir;
}

test("defaults to off without a global setting", (t) => {
  assert.equal(readGlobalFastMode(createAgentDir(t)), false);
});

test("writes into settings.json while preserving Pi and extension fields", async (t) => {
  const agentDir = createAgentDir(t);
  const settingsPath = getGlobalSettingsPath(agentDir);
  writeFileSync(
    settingsPath,
    JSON.stringify({
      theme: "dark",
      [SETTINGS_KEY]: { enabled: false, futureOption: "keep" },
    }),
  );

  await writeGlobalFastMode(true, agentDir);

  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  assert.deepEqual(settings, {
    theme: "dark",
    [SETTINGS_KEY]: { enabled: true, futureOption: "keep" },
  });
  assert.equal(readGlobalFastMode(agentDir), true);
});

test("creates settings.json and persists off explicitly", async (t) => {
  const agentDir = createAgentDir(t);

  await writeGlobalFastMode(false, agentDir);

  assert.deepEqual(JSON.parse(readFileSync(getGlobalSettingsPath(agentDir), "utf8")), {
    [SETTINGS_KEY]: { enabled: false },
  });
});

test("refuses to overwrite malformed Pi settings", async (t) => {
  const agentDir = createAgentDir(t);
  const settingsPath = getGlobalSettingsPath(agentDir);
  writeFileSync(settingsPath, "{ broken");

  await assert.rejects(writeGlobalFastMode(true, agentDir), SyntaxError);
  assert.equal(readFileSync(settingsPath, "utf8"), "{ broken");
});
