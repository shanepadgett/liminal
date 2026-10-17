# Milestones

The order Liminal is built in. Each step ends in something that runs or is tested. Topic plans hang off the step they serve.

- Each step adds implementations behind final contracts and deletes nothing; no temporary, minimal or placeholder shapes
- Steps 2 to 6 build behind the contracts in [core-contracts.md](core-contracts.md)

## Dependency chain

```text
1. SDK, kernel host, session-store, session-log                         built
        │
2. Step 1 fixes · models + scripted provider · context                  built
        │
3. SDK Pipeline · tool-registry · tool-pipeline · agent-loop            built
        │
4. settings · credential-store · Codex/ChatGPT provider · command runner · file and shell tools   built
        │
5. Kernel protocol server · event bus · session following · TUI on a live session
        │
6. Graph swap with handover · supervisor · resume after restart
```

## Steps

| # | Builds | Proves | Plans |
| --- | --- | --- | --- |
| 1 | Guardrails first: SDK fallow zones (`core`, `testing`, `tui`, `desktop`), SDK subpath exports, plugin-part import rules with tests. Then SDK plugin definition, `Registry` and test harness; kernel host; `session-store` (adds `@effect/sql-sqlite-bun` 4.0.5 and its `sources.json` entry); `session-log` (append, read, subscribe) | The host boots both plugins from their manifests; entries survive a restart | [plugin-foundation](archive/plugin-foundation.md), [session-log](archive/session-log.md), [session-store](archive/session-store.md) |
| 2 | Round 8 changes to step 1: keyed registry in the SDK, `append` takes the writer's entry definition, the store numbers entries and `session-log` drops its lock. `models` (Round 3) with the scripted test provider; `context` (Round 4) | The scripted provider streams a reply; `context` rebuilds the same messages from a saved log | [step-2](archive/step-2.md) |
| 3 | SDK `Pipeline`; `tool-registry` and `tool-pipeline` (Round 6) with test tools; `agent-loop` (Round 5): steps, checkpoints, steering, follow-ups, cancel | Multi-step turns with tool calls run end to end on the scripted provider | [step-3](archive/step-3.md) |
| 4 | `settings` and `credential-store` (Round 7); the OpenAI Codex/ChatGPT login provider with recorded-response tests (adds its `@effect/ai-*` package and `sources.json` entry); the command runner; file and shell tools | A real model does work in a test session | [step-4](archive/step-4.md) |
| 5 | Kernel protocol server over Effect RPC, event bus and session following (Round 2); `session-store` metadata index; the CLI runs the server in process and shows the gallery transcript on a live session | The first TUI session | [transcript](transcript.md) |
| 6 | Graph swap with step-boundary handover (Round 1), supervisor, resume after restart | Hot reload; a turn resumes after a restart | |

Step 4 records its first live responses with Tau's logged-in credentials, read only from `~/.tau/credentials.db` (`credential(provider, credential)`; rows for `anthropic`, `openai`, `codex`, `chatgpt`, `opencode-go`, `openrouter`). `anthropic`, `codex` and `chatgpt` are OAuth logins; recording reads a token only while it is valid and never refreshes it.

Test prior art for steps 2 to 5: DeepSeek `packages/test-support` (`agent-loop-testkit`, `llm-replay`, `llm-mock-server`, `loader-smoke`); Tau `tests/support/agent-harness.ts`; Pi `packages/ai/src/providers/faux.ts`; OpenCode `packages/http-recorder`.

Compaction, permissions, approval, checks, loading user and project plugin folders (with host copies of shared modules, see [status](../status.md)) and the remaining catalog follow step 6. Their requirements stay as written; their design waits for their step.
