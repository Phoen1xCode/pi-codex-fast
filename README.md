# pi-codex-fast

A global Fast mode toggle for the Pi Coding Agent's ChatGPT/Codex subscription models.

## Features

- Injects `service_tier: "priority"` into Codex requests only when a strict safety baseline is met
- Never selects or modifies model, thinking level, tools, or prompts
- Never reads or stores OAuth tokens
- Persists state in Pi's existing `~/.pi/agent/settings.json` — no separate config file
- Fast mode is injected only when **all** of the following hold:
  - provider is `openai-codex`
  - API is `openai-codex-responses`
  - model id is on the exact allowlist
  - `ctx.modelRegistry.isUsingOAuth(model)` is `true`
  - payload is an object and its model matches the current model id
  - payload does not already contain `service_tier`

## Install

```bash
pi install npm:@phoen1xcode/pi-codex-fast
```

## Usage

1. In Pi, run `/login` and choose `OpenAI (ChatGPT Plus/Pro)`.
2. Run `/model` and pick a supported model:
   - `openai-codex/gpt-5.6-sol`
   - `openai-codex/gpt-5.6-terra`
   - `openai-codex/gpt-5.6-luna`
3. Toggle Fast mode:

```text
/fast on
/fast off
/fast status
```

`/fast` with no arguments toggles the current global value. Fast mode may consume more ChatGPT credits.

## Configuration

State is stored in Pi's existing `~/.pi/agent/settings.json`:

```json
{
  "@phoen1xcode/pi-codex-fast": {
    "enabled": true
  }
}
```

The extension locates this file via Pi's `getAgentDir()`, so `PI_CODING_AGENT_DIR` is respected. Writes use a Pi-compatible file lock and atomic replacement, preserving other settings fields and the `settings.json` symlink.

"Global" here means persisted scope, not real-time sync across Pi processes. Each Pi instance reads the config at startup or on `/reload`; `/fast` takes effect immediately in the current instance, while other running instances need `/reload` to pick up the new value.

The extension passes `serviceTier: "priority"` through Pi's built-in Codex stream. The Codex backend may still report `service_tier: "default"` in responses; Pi estimates local cost based on the requested priority tier. This estimate is not equivalent to the final credits billing in the ChatGPT backend.

To add newly verified Fast-mode models, update `SUPPORTED_MODEL_IDS` in [`src/models.ts`](src/models.ts) and add tests.

## Development

```bash
npm install
npm run check
pi -e .
```
