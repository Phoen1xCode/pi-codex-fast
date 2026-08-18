import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import type { Api, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { createCodexFastExtension } from "../src/index.ts";
import { readGlobalFastMode } from "../src/settings.ts";

type Handler = (event: any, ctx: any) => unknown;
type ProviderStreamSimple = NonNullable<ProviderConfig["streamSimple"]>;
type Command = {
  getArgumentCompletions(prefix: string): unknown;
  handler(args: string, ctx: any): Promise<void>;
};

function createHarness(agentDir: string) {
  const handlers = new Map<string, Handler>();
  let command: Command | undefined;
  let providerStreamSimple: ProviderStreamSimple | undefined;
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, value: Command) {
      assert.equal(name, "fast");
      command = value;
    },
    registerProvider(name: string, value: ProviderConfig) {
      assert.equal(name, "openai-codex");
      assert.equal(value.api, "openai-codex-responses");
      assert.ok(value.streamSimple);
      providerStreamSimple = value.streamSimple;
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
    streamSimple(): ProviderStreamSimple {
      assert.ok(providerStreamSimple, "missing provider streamSimple");
      return providerStreamSimple;
    },
  };
}

function createContext(oauth = true) {
  const notifications: Array<{ message: string; level: string }> = [];
  const model: Model<"openai-codex-responses"> = {
    provider: "openai-codex",
    api: "openai-codex-responses",
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    baseUrl: "https://chatgpt.com/backend-api",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 100_000,
  };
  return {
    context: {
      hasUI: true,
      model,
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

function fakeCodexToken(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" } }),
    "signature",
  ].join(".");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function captureProviderPayload(
  harness: ReturnType<typeof createHarness>,
  model: Model<Api>,
  options: SimpleStreamOptions = {},
): Promise<Record<string, unknown>> {
  let payload: unknown;
  const context: Context = { systemPrompt: "", messages: [], tools: [] };
  const stream = harness.streamSimple()(model, context, {
    ...options,
    apiKey: fakeCodexToken(),
    onPayload(value) {
      payload = value;
      throw new Error("payload captured");
    },
  });
  await stream.result();
  assert.ok(isRecord(payload));
  return payload;
}

test("/fast persists globally and a new extension instance restores it", async (t) => {
  const agentDir = createAgentDir(t);
  const first = createHarness(agentDir);
  const firstContext = createContext();
  first.handler("session_start")({}, firstContext.context);

  assert.equal(
    (await captureProviderPayload(first, firstContext.context.model)).service_tier,
    undefined,
  );

  await first.command().handler("on", firstContext.context);
  assert.equal(readGlobalFastMode(agentDir), true);
  assert.match(firstContext.notifications.at(-1)!.message, /active/);
  assert.equal(
    (await captureProviderPayload(first, firstContext.context.model)).service_tier,
    "priority",
  );

  const second = createHarness(agentDir);
  const secondContext = createContext();
  second.handler("session_start")({}, secondContext.context);
  assert.equal(
    (await captureProviderPayload(second, secondContext.context.model)).service_tier,
    "priority",
  );

  await second.command().handler("status", secondContext.context);
  assert.match(secondContext.notifications.at(-1)!.message, /on globally/);
  await second.command().handler("off", secondContext.context);
  assert.equal(readGlobalFastMode(agentDir), false);
  assert.equal(
    (await captureProviderPayload(second, secondContext.context.model)).service_tier,
    undefined,
  );
});

test("Fast-on payload matches Fast-off except for priority tier", async (t) => {
  const agentDir = createAgentDir(t);
  const harness = createHarness(agentDir);
  const { context } = createContext();
  harness.handler("session_start")({}, context);
  const options: SimpleStreamOptions = {
    reasoning: "high",
    temperature: 0.25,
    sessionId: "payload-parity",
    cacheRetention: "short",
  };

  const regularPayload = await captureProviderPayload(harness, context.model, options);
  await harness.command().handler("on", context);
  const fastPayload = await captureProviderPayload(harness, context.model, options);
  const { service_tier: serviceTier, ...fastPayloadWithoutTier } = fastPayload;

  assert.equal(serviceTier, "priority");
  assert.deepEqual(fastPayloadWithoutTier, regularPayload);
  assert.deepEqual(fastPayload.reasoning, { effort: "high", summary: "auto" });
});

test("missing API key fails identically with Fast off and on", async (t) => {
  const agentDir = createAgentDir(t);
  const harness = createHarness(agentDir);
  const { context } = createContext();
  harness.handler("session_start")({}, context);
  const resultWithoutApiKey = () =>
    harness.streamSimple()(context.model, { systemPrompt: "", messages: [], tools: [] }).result();

  const regularResult = await resultWithoutApiKey();
  await harness.command().handler("on", context);
  const fastResult = await resultWithoutApiKey();

  assert.equal(regularResult.stopReason, "error");
  assert.equal(regularResult.errorMessage, "No API key for provider: openai-codex");
  assert.equal(fastResult.stopReason, regularResult.stopReason);
  assert.equal(fastResult.errorMessage, regularResult.errorMessage);
});

test("OAuth remains mandatory and invalid commands do not change state", async (t) => {
  const agentDir = createAgentDir(t);
  const harness = createHarness(agentDir);
  const { context, notifications } = createContext(false);
  harness.handler("session_start")({}, context);

  await harness.command().handler("on", context);
  assert.match(notifications.at(-1)!.message, /OAuth login is required/);
  assert.equal((await captureProviderPayload(harness, context.model)).service_tier, undefined);

  await harness.command().handler("wat", context);
  assert.equal(notifications.at(-1)!.message, "Usage: /fast [on|off|status]");
  assert.equal(readGlobalFastMode(agentDir), true);
  assert.deepEqual(harness.command().getArgumentCompletions("o"), [
    { value: "on", label: "on" },
    { value: "off", label: "off" },
  ]);
});
