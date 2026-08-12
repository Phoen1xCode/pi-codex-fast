import assert from "node:assert/strict";
import test from "node:test";
import { getEligibility, injectFastServiceTier, type FastModeContext } from "../src/fast-mode.ts";
import { SUPPORTED_MODEL_IDS } from "../src/models.ts";

type ContextOptions = {
  provider?: string;
  api?: string;
  id?: string;
  oauth?: boolean;
};

function createContext({
  provider = "openai-codex",
  api = "openai-codex-responses",
  id = "gpt-5.6-sol",
  oauth = true,
}: ContextOptions = {}): FastModeContext {
  return {
    model: { provider, api, id },
    modelRegistry: { isUsingOAuth: () => oauth },
  } as unknown as FastModeContext;
}

test("injects priority for every exact GPT-5.6 allowlist entry", () => {
  for (const id of SUPPORTED_MODEL_IDS) {
    const payload = {
      model: id,
      input: [{ role: "user", content: "hello" }],
      tools: [{ type: "function", name: "read" }],
    };

    assert.deepEqual(injectFastServiceTier(payload, createContext({ id }), true), {
      ...payload,
      service_tier: "priority",
    });
    assert.equal("service_tier" in payload, false);
  }
});

test("rejects non-Codex, wrong API, unknown model, and API-key auth", () => {
  const cases: Array<[string, FastModeContext]> = [
    ["provider", createContext({ provider: "openai" })],
    ["API", createContext({ api: "openai-responses" })],
    ["model", createContext({ id: "gpt-5.6-future" })],
    ["OAuth", createContext({ oauth: false })],
  ];

  for (const [name, ctx] of cases) {
    assert.equal(injectFastServiceTier({ model: ctx.model?.id }, ctx, true), undefined, name);
    assert.equal(getEligibility(ctx).eligible, false, name);
  }
});

test("leaves disabled, malformed, mismatched, and pre-tiered payloads untouched", () => {
  const ctx = createContext();
  const payload = { model: "gpt-5.6-sol", input: [] };

  assert.equal(injectFastServiceTier(payload, ctx, false), undefined);
  assert.equal(injectFastServiceTier(null, ctx, true), undefined);
  assert.equal(injectFastServiceTier([], ctx, true), undefined);
  assert.equal(injectFastServiceTier({ model: "gpt-5.6-terra" }, ctx, true), undefined);
  assert.equal(
    injectFastServiceTier({ model: "gpt-5.6-sol", service_tier: "default" }, ctx, true),
    undefined,
  );
  assert.deepEqual(payload, { model: "gpt-5.6-sol", input: [] });
});
