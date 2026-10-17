# models

The seam every provider plugs into: streams one model call through a registered provider.

Status: planned

## Provides

- `Models` service: `stream`, `listProviders`, `listModels`
- `ModelProviders` registry that provider plugins add to
- `RpcGroup` with `listProviders` and `listModels`

## Requirements

### Seam

- Requests, events and errors are Liminal's own Schemas built on `ModelContent`, not `effect/ai` types
- A request holds the model (provider and id), messages, tools (name, description, JSON Schema, offered at the start or not), a thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`), an optional output limit, an optional cache key and optional provider options keyed by provider
- `stream` returns a stream of events and a typed error; interruption cancels the call
- Events: start, part start (text, reasoning or tool call), delta, part end with the finished `ModelPart`, finish with reason and usage
- Tool-call params stream as raw JSON text
- System messages can carry a part that offers or withdraws a tool at that point; each provider renders it in its native form, or as text and refuses calls to tools not offered
- Errors carry a reason (`rate-limit`, `quota`, `auth`, `context-overflow`, `invalid-request`, `provider`, `network`, `empty-response`), a message and, when known, status, retry delay and request id
- One `stream` call is one provider attempt; providers never retry; the `retry` plugin retries at step boundaries
- `models` never reads or writes the session log

### Providers

- One plugin per provider adds one entry to `ModelProviders`
- Several providers are active at once
- Each provider owns its model list and metadata: context window, output limit, thinking levels, input types, prices
- `stream` accepts model ids a provider does not list
- Provider plugins build on `@effect/ai-anthropic`, `@effect/ai-openai`, `@effect/ai-openai-compat` and `@effect/ai-openrouter`, translating to and from `effect/ai` inside the plugin
- Each provider maps the thinking level to its own request fields

### Testing

- A scripted provider plugin serves everything above `models`: queued and repeated responses, failure after events, hang after events, a gate, captured requests
- Provider plugins are tested with recorded HTTP replayed at Effect's `HttpClient`

## References

- Pi `packages/ai/src/types.ts`, `providers/faux.ts`
- OpenCode `packages/ai` (`schema/events.ts`, `route/protocol.ts`, `testing.ts`), `packages/http-recorder`
- DeepSeek `docs/subsystems/llm-streaming.md`, `packages/test-support`
- Tau `src/ai/Models.ts`, `src/ai/internal/protocols`
- Effect `effect/ai` `LanguageModel.make`, `Tool.dynamic`
