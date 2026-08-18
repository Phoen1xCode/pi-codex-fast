import assert from "node:assert/strict";
import test from "node:test";
import { describeFastMode, getEligibility, type FastModeContext } from "../src/fast-mode.ts";
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

test("accepts every exact GPT-5.6 allowlist entry", () => {
  for (const id of SUPPORTED_MODEL_IDS) {
    const eligibility = getEligibility(createContext({ id }));
    assert.equal(eligibility.eligible, true);
    if (eligibility.eligible) assert.equal(eligibility.model.id, id);
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
    assert.equal(getEligibility(ctx).eligible, false, name);
  }
});

test("describes global and model-specific state", () => {
  const ctx = createContext();
  assert.equal(describeFastMode(ctx, false), "Codex Fast mode is off globally.");
  assert.match(describeFastMode(ctx, true), /active for openai-codex\/gpt-5\.6-sol/);
  assert.match(describeFastMode({ ...ctx, model: undefined }, true), /no model is selected/);
});
