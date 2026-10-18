# models

The seam every provider plugs into: streams one model call through a registered provider.

Status: built

## Provides

- `Models` service: `stream`, `listProviders`, `listModels`, `describe`, `cheap`
- `ModelTask` service: one bounded exchange with any model that ends in a typed answer
- `ModelProviders` registry that provider plugins add to
- `RpcGroup` with `listProviders` and `listModels`

## Requirements

### Seam

- Requests, events and errors are Liminal's own Schemas built on `ModelContent`, not `effect/ai` types
- A request holds the model (provider and id), messages, tools (name, description, JSON Schema, offered at the start or not), a thinking value (off, an effort name, a token budget, or on), an optional output limit, an optional cache key and optional provider options keyed by provider
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
- A provider's models come from a fixed list, the `models.dev` catalog (`model-catalog`), or the catalog filtered by its plan's list
- Plan lists are kept in `plans.json` in the data folder; a listing returns the kept list at once and reads the plan again in the background; only a provider with no kept list waits
- A background read failing with `auth` forgets the kept list
- `describe` finds one model without reading the plan list
- A provider with a login can give a check; listing its models fails with that check's `auth` error while it has no usable login
- Each model lists its own thinking options as the provider names them: effort names as given, labelled token budgets, or off and on; none when it cannot reason
- `stream` accepts model ids a provider does not list
- Provider plugins build on `@effect/ai-anthropic`, `@effect/ai-openai`, `@effect/ai-openai-compat` and `@effect/ai-openrouter`, translating to and from `effect/ai` inside the plugin
- Each provider maps the thinking value to its own request fields
- A request can set a tool choice: `auto` (default), `required`, or one named tool
- Each provider names a preferred small model and its thinking value; `Models.cheap(provider)` returns it; it limits nothing

### Tasks

- A task takes any model and thinking value, a system prompt, messages, tools, a submit tool with a Schema, and a step limit
- Each step requires a tool call; the last step forces the submit tool
- Structured output is the submit tool for every model
- The task runs the model's other tool calls and sends back their results; an unknown tool or a failed run is a failure result
- A submitted answer the Schema rejects goes back once with the reason and the submit tool forced; a second rejection fails with `TaskFailed`
- No answer within the step limit fails with `TaskFailed`

### Testing

- A scripted provider plugin serves everything above `models`: queued and repeated responses, failure after events, hang after events, a gate, captured requests
- Provider plugins are tested with recorded HTTP replayed at Effect's `HttpClient`

## References

- Pi `packages/ai/src/types.ts`, `providers/faux.ts`
- OpenCode `packages/ai` (`schema/events.ts`, `route/protocol.ts`, `testing.ts`), `packages/http-recorder`
- DeepSeek `docs/subsystems/llm-streaming.md`, `packages/test-support`
- Tau `src/ai/Models.ts`, `src/ai/internal/protocols`
- Effect `effect/ai` `LanguageModel.make`, `Tool.dynamic`
