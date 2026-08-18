import {
  clampThinkingLevel,
  type Api,
  type AssistantMessage,
  type Context,
  type ImageContent,
  type Message,
  type Model,
  type OpenAICodexResponsesOptions,
  type SimpleStreamOptions,
  type TextContent,
  type Tool,
  type Usage,
} from "@earendil-works/pi-ai";

type ContextUsageEstimate = {
  tokens: number;
  usageTokens: number;
  trailingTokens: number;
  lastUsageIndex: number | null;
};

const CHARS_PER_TOKEN = 4;
const ESTIMATED_IMAGE_CHARS = 4800;
const CONTEXT_SAFETY_TOKENS = 4096;
const MIN_MAX_TOKENS = 1;

function calculateContextTokens(usage: Usage): number {
  return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return "[unserializable]";
  }
}

function estimateTextAndImageContentTokens(
  content: string | Array<TextContent | ImageContent>,
): number {
  if (typeof content === "string") return Math.ceil(content.length / CHARS_PER_TOKEN);

  let chars = 0;
  for (const block of content) {
    chars += block.type === "text" ? block.text.length : ESTIMATED_IMAGE_CHARS;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function estimateMessageTokens(message: Message): number {
  if (message.role === "user" || message.role === "toolResult") {
    return estimateTextAndImageContentTokens(message.content);
  }

  let chars = 0;
  for (const block of message.content) {
    if (block.type === "text") chars += block.text.length;
    else if (block.type === "thinking") chars += block.thinking.length;
    else chars += block.name.length + safeJsonStringify(block.arguments).length;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function getLastAssistantUsageInfo(
  messages: readonly Message[],
): { usage: Usage; index: number } | undefined {
  let latestPrefixTimestamp = Number.NEGATIVE_INFINITY;
  let usageInfo: { usage: Usage; index: number } | undefined;

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "assistant") {
      const assistant = message as AssistantMessage;
      if (
        assistant.timestamp >= latestPrefixTimestamp &&
        assistant.stopReason !== "aborted" &&
        assistant.stopReason !== "error" &&
        calculateContextTokens(assistant.usage) > 0
      ) {
        usageInfo = { usage: assistant.usage, index };
      }
    }
    latestPrefixTimestamp = Math.max(latestPrefixTimestamp, message.timestamp);
  }

  return usageInfo;
}

function estimateMessages(messages: readonly Message[]): ContextUsageEstimate {
  const usageInfo = getLastAssistantUsageInfo(messages);
  if (usageInfo) {
    const usageTokens = calculateContextTokens(usageInfo.usage);
    let trailingTokens = 0;
    for (let index = usageInfo.index + 1; index < messages.length; index++) {
      trailingTokens += estimateMessageTokens(messages[index]);
    }
    return {
      tokens: usageTokens + trailingTokens,
      usageTokens,
      trailingTokens,
      lastUsageIndex: usageInfo.index,
    };
  }

  let tokens = 0;
  for (const message of messages) tokens += estimateMessageTokens(message);
  return { tokens, usageTokens: 0, trailingTokens: tokens, lastUsageIndex: null };
}

function estimateToolsTokens(tools: readonly Tool[] | undefined): number {
  if (!tools || tools.length === 0) return 0;
  return Math.ceil(safeJsonStringify(tools).length / CHARS_PER_TOKEN);
}

function estimateContextTokens(context: Context): number {
  const estimate = estimateMessages(context.messages);
  if (estimate.lastUsageIndex !== null) {
    const addedNames = new Set(
      context.messages
        .slice(estimate.lastUsageIndex + 1)
        .filter((message) => message.role === "toolResult")
        .flatMap((message) => message.addedToolNames ?? []),
    );
    return (
      estimate.tokens +
      estimateToolsTokens(context.tools?.filter((tool) => addedNames.has(tool.name)))
    );
  }

  const prefixTokens =
    (context.systemPrompt ? Math.ceil(context.systemPrompt.length / CHARS_PER_TOKEN) : 0) +
    estimateToolsTokens(context.tools);
  return estimate.tokens + prefixTokens;
}

function clampMaxTokensToContext(model: Model<Api>, context: Context, maxTokens: number): number {
  if (model.contextWindow <= 0) return Math.max(MIN_MAX_TOKENS, maxTokens);
  const available = model.contextWindow - estimateContextTokens(context) - CONTEXT_SAFETY_TOKENS;
  return Math.min(maxTokens, Math.max(MIN_MAX_TOKENS, available));
}

// Mirrors pi-ai's streamSimple base mapping. The extension loader does not expose simple-options.
function buildBaseOptions(
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions | undefined,
  apiKey: string | undefined,
): OpenAICodexResponsesOptions {
  const samplingParams =
    model.samplingParams || options?.samplingParams
      ? { ...model.samplingParams, ...options?.samplingParams }
      : undefined;
  return {
    temperature: options?.temperature,
    samplingParams,
    maxTokens: clampMaxTokensToContext(model, context, options?.maxTokens ?? model.maxTokens),
    signal: options?.signal,
    telemetryContext: options?.telemetryContext,
    apiKey: apiKey || options?.apiKey,
    fetch: options?.fetch,
    transport: options?.transport,
    cacheRetention: options?.cacheRetention,
    sessionId: options?.sessionId,
    headers: options?.headers,
    onPayload: options?.onPayload,
    onResponse: options?.onResponse,
    timeoutMs: options?.timeoutMs,
    websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
    maxRetries: options?.maxRetries,
    maxRetryDelayMs: options?.maxRetryDelayMs,
    metadata: options?.metadata,
    env: options?.env,
  };
}

export function toCodexStreamOptions(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): OpenAICodexResponsesOptions {
  const base = buildBaseOptions(model, context, options, options?.apiKey);
  const clampedReasoning = options?.reasoning
    ? clampThinkingLevel(model, options.reasoning)
    : undefined;
  const reasoningEffort = clampedReasoning === "off" ? undefined : clampedReasoning;
  return { ...base, reasoningEffort };
}
