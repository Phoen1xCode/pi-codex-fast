# pi-codex-fast

Pi Coding Agent 的 ChatGPT/Codex 订阅 Fast mode 全局开关。

扩展只在满足安全基线时给请求体补充 `service_tier: "priority"`，不会选择或修改 model、thinking level、tools、prompts，也不会读取或保存 OAuth token。

## 安装

```bash
pi install npm:@phoen1xcode/pi-codex-fast
```

本地开发：

```bash
npm install
npm run check
pi -e .
```

## 使用

1. 在 Pi 中执行 `/login`，选择 `OpenAI (ChatGPT Plus/Pro)`。
2. 执行 `/model`，选择一个受支持模型：
   - `openai-codex/gpt-5.6-sol`
   - `openai-codex/gpt-5.6-terra`
   - `openai-codex/gpt-5.6-luna`
3. 执行：

```text
/fast on
/fast off
/fast status
```

不带参数的 `/fast` 会切换当前全局值。Fast mode 可能消耗更多 ChatGPT credits。

## 全局配置

状态保存在 Pi 已有的 `~/.pi/agent/settings.json`，不创建单独配置文件：

```json
{
  "@phoen1xcode/pi-codex-fast": {
    "enabled": true
  }
}
```

扩展通过 Pi 的 `getAgentDir()` 定位该文件，因此支持 `PI_CODING_AGENT_DIR`。写入时使用与 Pi 兼容的文件锁和原子替换，并保留其他设置字段及 `settings.json` 符号链接。

这里的“全局”指持久化作用域，不代表多个 Pi 进程实时同步。每个 Pi 实例会在启动或执行 `/reload` 时读取配置；当前实例执行 `/fast` 后立即生效，其他已运行实例需要执行 `/reload` 才能读取新值。

## 请求安全边界

只有以下条件全部成立才注入 Fast mode：

- provider 是 `openai-codex`
- API 是 `openai-codex-responses`
- model id 位于精确 allowlist
- `ctx.modelRegistry.isUsingOAuth(model)` 为 `true`
- payload 是对象，且 payload model 与当前 model id 一致
- payload 不含 `service_tier`

扩展通过 Pi 内置 Codex stream 传入 `serviceTier: "priority"`。Codex 后端可能仍在响应中回报 `service_tier: "default"`；Pi 会按请求的 priority tier 估算本地成本。该估算不等同于 ChatGPT 后台最终的 credits 结算。

未来确认新模型支持 Fast mode 后，只需更新 [`src/models.ts`](src/models.ts) 的 `SUPPORTED_MODEL_IDS` 并补充测试。
