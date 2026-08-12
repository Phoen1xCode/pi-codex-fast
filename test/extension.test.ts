import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createCodexFastExtension } from "../src/index.ts";
import { readGlobalFastMode } from "../src/settings.ts";

type Handler = (event: any, ctx: any) => unknown;
type Command = {
  getArgumentCompletions(prefix: string): unknown;
  handler(args: string, ctx: any): Promise<void>;
};

function createHarness(agentDir: string) {
  const handlers = new Map<string, Handler>();
  let command: Command | undefined;
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, value: Command) {
      assert.equal(name, "fast");
      command = value;
    },
  } as unknown as ExtensionAPI;

  createCodexFastExtension({ agentDir })(pi);
  return {
    handler(name: string): Handler {
      const value = handlers.get(name);
      assert.ok(value, `missing ${name} handler`);
      return value;
    },
    command(): Command {
      assert.ok(command, "missing /fast command");
      return command;
    },
  };
}

function createContext(oauth = true) {
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    context: {
      hasUI: true,
      model: {
        provider: "openai-codex",
        api: "openai-codex-responses",
        id: "gpt-5.6-sol",
      },
      modelRegistry: { isUsingOAuth: () => oauth },
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
    notifications,
  };
}

function createAgentDir(t: test.TestContext): string {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-codex-fast-extension-"));
  t.after(() => rmSync(agentDir, { recursive: true, force: true }));
  return agentDir;
}

test("/fast persists globally and a new extension instance restores it", async (t) => {
  const agentDir = createAgentDir(t);
  const first = createHarness(agentDir);
  const firstContext = createContext();
  first.handler("session_start")({}, firstContext.context);

  assert.equal(
    first.handler("before_provider_request")(
      { payload: { model: "gpt-5.6-sol" } },
      firstContext.context,
    ),
    undefined,
  );

  await first.command().handler("on", firstContext.context);
  assert.equal(readGlobalFastMode(agentDir), true);
  assert.match(firstContext.notifications.at(-1)!.message, /active/);
  assert.deepEqual(
    first.handler("before_provider_request")(
      { payload: { model: "gpt-5.6-sol", input: [] } },
      firstContext.context,
    ),
    { model: "gpt-5.6-sol", input: [], service_tier: "priority" },
  );

  const second = createHarness(agentDir);
  const secondContext = createContext();
  second.handler("session_start")({}, secondContext.context);
  assert.deepEqual(
    second.handler("before_provider_request")(
      { payload: { model: "gpt-5.6-sol" } },
      secondContext.context,
    ),
    { model: "gpt-5.6-sol", service_tier: "priority" },
  );

  await second.command().handler("status", secondContext.context);
  assert.match(secondContext.notifications.at(-1)!.message, /on globally/);
  await second.command().handler("off", secondContext.context);
  assert.equal(readGlobalFastMode(agentDir), false);
});

test("OAuth remains mandatory and invalid commands do not change state", async (t) => {
  const agentDir = createAgentDir(t);
  const harness = createHarness(agentDir);
  const { context, notifications } = createContext(false);
  harness.handler("session_start")({}, context);

  await harness.command().handler("on", context);
  assert.match(notifications.at(-1)!.message, /OAuth login is required/);
  assert.equal(
    harness.handler("before_provider_request")({ payload: { model: "gpt-5.6-sol" } }, context),
    undefined,
  );

  await harness.command().handler("wat", context);
  assert.equal(notifications.at(-1)!.message, "Usage: /fast [on|off|status]");
  assert.equal(readGlobalFastMode(agentDir), true);
  assert.deepEqual(harness.command().getArgumentCompletions("o"), [
    { value: "on", label: "on" },
    { value: "off", label: "off" },
  ]);
});
