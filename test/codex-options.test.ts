import assert from "node:assert/strict";
import test from "node:test";
import type { Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { buildBaseOptions } from "@earendil-works/pi-ai/api/simple-options";
import { toCodexStreamOptions } from "../src/codex-options.ts";

const model: Model<"openai-codex-responses"> = {
  provider: "openai-codex",
  api: "openai-codex-responses",
  id: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 5_000,
  maxTokens: 4_000,
  samplingParams: { top_p: 0.8, shared: "model" },
};

const context: Context = {
  systemPrompt: "s".repeat(400),
  messages: [{ role: "user", content: "u".repeat(400), timestamp: 1 }],
  tools: [],
};

test("Codex mapper matches pi-ai streamSimple without leaking simple-only options", () => {
  const options: SimpleStreamOptions = {
    apiKey: "test-token",
    reasoning: "high",
    deferred: true,
    thinkingBudgets: { high: 12_345 },
    temperature: 0.25,
    samplingParams: { min_p: 0.1, shared: "options" },
    maxTokens: 3_000,
    transport: "sse",
    cacheRetention: "short",
    sessionId: "mapper-parity",
    headers: { "x-test": "yes" },
    timeoutMs: 1_000,
    websocketConnectTimeoutMs: 2_000,
    maxRetries: 0,
    maxRetryDelayMs: 3_000,
    metadata: { source: "test" },
    env: { TEST_ENV: "value" },
  };

  const actual = toCodexStreamOptions(model, context, options);
  const expected = {
    ...buildBaseOptions(model, context, options, options.apiKey),
    reasoningEffort: "high",
  };

  assert.deepEqual(actual, expected);
  assert.equal(actual.maxTokens, 704);
  assert.deepEqual(actual.samplingParams, {
    top_p: 0.8,
    min_p: 0.1,
    shared: "options",
  });
  assert.equal("reasoning" in actual, false);
  assert.equal("deferred" in actual, false);
  assert.equal("thinkingBudgets" in actual, false);
});
