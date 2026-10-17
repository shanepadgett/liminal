# Milestones

The order Liminal is built in. Each step builds only what the next validation needs and ends in something that runs or is tested. Topic plans hang off the step they serve.

## Dependency chain

```text
1. SDK plugin definition   definePlugin manifest, Registry, Scope rules; the only thing kernel and plugins share
        │ consumed by                         │ consumed by
2. Kernel host                         3. Core contracts
   read manifests, resolve graph,         session-store → session-log → context → models → agent-loop
   build one Layer, own plugin scopes
        └──────────────┬──────────────────────┘
4. Plugin servers implement contracts; the host composes them
5. Kernel protocol server + in-memory transport → TUI
6. Kernel supervisor + host graph swap → reload
```

## Steps

| # | Builds | Proves | Plans |
| --- | --- | --- | --- |
| 1 | Guardrails first: SDK fallow zones (`core`, `testing`, `tui`, `desktop`), SDK subpath exports, plugin-part import rules with tests. Then SDK plugin definition, `Registry` and test harness; kernel host; `session-store` (adds `@effect/sql-sqlite-bun` 4.0.5 and its `sources.json` entry); `session-log` (append, read, subscribe) | The host boots both plugins from their manifests; entries survive a restart | [plugin-foundation](archive/plugin-foundation.md), [session-log](archive/session-log.md), [session-store](archive/session-store.md) |
| 2 | `models` seam and a scripted fake model provider; minimal `context` (log to messages, fixed prompt); `agent-loop` with one step and no tools | A plain-chat turn runs end to end with the scripted model; context rebuilds from the saved log | |
| 3 | One real provider with recorded-response tests; `credential-store` (API key); minimal `settings`; a temporary dev command that runs the server in process and prints replies as plain lines | A real conversation with streaming | |
| 4 | SDK `Pipeline`; `tool-registry`, `tool-pipeline` (first user of `Pipeline`), file and shell tools, multi-step turns | The agent does work | |
| 5 | Protocol, in-memory transport, the gallery transcript wired to a live session; the event bus once something needs events the log does not carry; the `session-store` metadata index; the dev command is deleted | The first TUI session | [transcript](transcript.md) |
| 6 | Graph swap and reload, stable handles vs rebuilding dependents, supervisor | Hot reload | |

Step 3 records its first live responses with Tau's logged-in credentials, read only from `~/.tau/credentials.db` (`credential(provider, credential)`; rows for `anthropic`, `openai`, `codex`, `chatgpt`, `opencode-go`, `openrouter`). `anthropic`, `codex` and `chatgpt` are OAuth logins; recording refreshes expired tokens without writing back to Tau's file.

Test prior art for steps 2, 3 and 5: DeepSeek `packages/test-support` (`agent-loop-testkit`, `llm-replay`, `llm-mock-server`, `loader-smoke`); Tau `tests/support/agent-harness.ts`; Pi `packages/ai/src/providers/faux.ts`; OpenCode `packages/http-recorder`.

Compaction, permissions, approval, checks, loading user and project plugin folders (with host copies of shared modules, see [status](../status.md)) and the remaining catalog follow step 6. Their requirements stay as written; their design waits for their step.
