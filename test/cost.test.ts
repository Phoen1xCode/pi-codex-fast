import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { zstdDecompressSync } from "node:zlib";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { SETTINGS_KEY } from "../src/settings.ts";

const CODEX_PROVIDER = "openai-codex";
const MODEL_ID = "gpt-5.6-sol";

function fakeCodexToken(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" } }),
    "signature",
  ].join(".");
}

function responseEvents() {
  const id = "resp_test";
  return [
    { type: "response.created", response: { id } },
    {
      type: "response.output_item.added",
      item: { id: "msg_test", type: "message", role: "assistant", content: [] },
    },
    {
      type: "response.content_part.added",
      part: { type: "output_text", text: "", annotations: [] },
    },
    { type: "response.output_text.delta", delta: "ok" },
    {
      type: "response.output_item.done",
      item: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "ok", annotations: [] }],
      },
    },
    {
      type: "response.completed",
      response: {
        id,
        status: "completed",
        service_tier: "default",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
          input_tokens_details: { cached_tokens: 0 },
        },
      },
    },
  ];
}

test("records priority-tier cost when Codex echoes the default tier", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-codex-fast-cost-"));
  const cwd = join(root, "cwd");
  const agentDir = join(root, "agent");
  mkdirSync(cwd);
  mkdirSync(agentDir);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFileSync(
    join(agentDir, "auth.json"),
    JSON.stringify({
      [CODEX_PROVIDER]: {
        type: "oauth",
        access: fakeCodexToken(),
        refresh: "refresh_test",
        expires: Date.now() + 3_600_000,
        accountId: "acct_test",
      },
    }),
  );
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ [SETTINGS_KEY]: { enabled: true } }),
  );

  let requestBody: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const compressed = Buffer.concat(chunks);
    const body = String(request.headers["content-encoding"]).includes("zstd")
      ? zstdDecompressSync(compressed).toString("utf8")
      : compressed.toString("utf8");
    requestBody = JSON.parse(body);

    const events = responseEvents();
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  });

  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
  });
  const model = modelRuntime.getModel(CODEX_PROVIDER, MODEL_ID);
  assert.ok(model);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  model.baseUrl = `http://127.0.0.1:${address.port}`;

  const settingsManager = SettingsManager.inMemory({
    transport: "sse",
    defaultThinkingLevel: "off",
    retry: { enabled: false, provider: { maxRetries: 0 } },
    compaction: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [resolve("src/index.ts")],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const { session, extensionsResult } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    resourceLoader,
    model,
    thinkingLevel: "off",
    noTools: "all",
  });
  t.after(() => session.dispose());
  assert.deepEqual(extensionsResult.errors, []);

  await session.bindExtensions({});
  await session.prompt("cost test", { expandPromptTemplates: false });

  assert.equal(requestBody?.service_tier, "priority");
  const assistant = session.sessionManager
    .getBranch()
    .reverse()
    .find((entry) => entry.type === "message" && entry.message.role === "assistant");
  assert.ok(assistant?.type === "message" && assistant.message.role === "assistant");
  assert.ok(Math.abs(assistant.message.usage.cost.total - 0.0004) < 1e-12);
});
