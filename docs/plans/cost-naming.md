# Plan: milestone 4, cost and naming

Cache marks, `usage` and `session-name`. Work list: [plugins/providers.md](../plugins/providers.md).

## Today

| Piece | Today |
| --- | --- |
| Token counts | `loop/step-end` carries Effect AI's `Response.Usage` for each turn step. Calls through `Models.generate` and `generateObject` (approvals review, hosted search, classifiers) go through `ModelCall` but log nothing. |
| Prices | `ModelInfo.price` from models.dev: input, output, cache read, cache write per million tokens |
| Context window | `ModelInfo.contextWindow` |
| Caching | OpenAI wires send `prompt_cache_key` (the session id). Anthropic Messages and Chat Completions send no cache marks, so Claude calls are never cached. Effect AI Anthropic reads `cacheControl` from a message's or part's `options.anthropic`. |
| Sidebar | `chat/sidebar` slot, filled with the Session section |
| Session title | `session`'s list query takes the first line of the first user message |

## Prior art

| Project | Cache marks | Usage | Naming |
| --- | --- | --- | --- |
| Pi (`ai/src/api/anthropic-messages.ts`, `openai-completions.ts`) | Messages wire: last tool, system, last user message. Chat Completions: the same, only for OpenRouter `anthropic/` models | | |
| Anthropic API (prompt caching docs) | A top-level `cache_control` caches up to the last cacheable block and moves forward each call | | |
| Previous Liminal (`archive/packages/plugins/`) | `cache-hints`: a request step marking the first system message and the last message | Context tokens and % of window, cache hit share, session cost, today's cost across sessions | `name_session` tool the model calls once, with a reminder after 5 tool results |

## Agreed

| Step | Work | Shape |
| --- | --- | --- |
| 1 | Cache marks, built and checked live on `anthropic`, `openrouter`, `opencode-go`, `openai` and `codex`. Sign in with ChatGPT is not offered: its route caches nothing (an identical 9.9k-token prompt sent twice reports no write and no read, and it refuses `prompt_cache_options`; others report the same at github.com/Daanish2003/bot-sdk/issues/664), and a coding agent without caching costs too much. | The Messages wire in `model-wire` sends a top-level `cache_control`, so the API caches the prompt up to its last block. `model-openrouter` sends the same for `anthropic/` models. Chat Completions and Responses send none: those models cache on their own. No `cache-hints` plugin and no `ModelRequest` field: no one turns caching off, and the mark depends on the wire. |
| 2 | `usage` | Counts turn steps from `loop/step-end`. The sidebar shows context used with its share of the window, and the session's cost. |
| 3 | `session-name` | `session` defines a name event that its list shows over the first message. After the first turn, `session-name` names the session with `generateObject` on the `small` model and appends the event. |

Usage of calls outside the turn loop and today's cost across sessions are under Later in [status.md](../status.md).

## Step 2: `usage` (proposed)

### Today

| Piece | Today |
| --- | --- |
| Context share | `chat`'s Session section already shows the latest step's input tokens as a share of the window, from `contextUsed` and `stepModel` in `chat/view` and `model/details` |
| Session events in the TUI | `SessionView.ViewState.events` holds the latest page and everything since, not the whole session, so the TUI cannot sum a long session's steps |
| Server reads | `SessionLog.live(session)` streams every saved event, then each new one |
| Model details on the server | `ModelRpc` `model/details` uses `describe` in `model/src/listing.ts`; `Models` has no such method, and `Models.list` covers only signed-in providers |
| Token counts | `Response.Usage`: `inputTokens` `total`, `uncached`, `cacheRead`, `cacheWrite`; `outputTokens.total`. Providers disagree on `uncached`: Anthropic leaves cache writes out, OpenRouter and OpenAI count them in. `total` is always uncached, read and written together. |

### Shape

```text
server entry
  UsageRpc "usage/session" { session } -> stream SessionUsage
    SessionLog.live(session)
      fold: loop/step-start sets the model; loop/step-end finished adds its tokens
      price each step with Models.details(model).price, cached per model
    emit after each burst of events

SessionUsage = { context, contextWindow?, cacheHit?, cost?, unpriced }

fresh = total - cacheRead - cacheWrite   (not `uncached`, which some providers fill differently)
cost of a step = (fresh * input + cacheRead * (cacheRead price ?? input)
                + cacheWrite * (cacheWrite price ?? input) + output * output) / 1e6

tui entry
  fills chat's sidebar slot with a Usage section: context and share of window, cache hit share,
  session cost
```

The plan-billed `codex` provider is priced at API rates, so every session shows what it would cost on the API. It lists `openai` as its catalog id, so its models already carry those prices.

### Decisions for the user

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Context share lives in `chat` today. Move it to `usage`, or leave it and have `usage` add cost only? | Move it: `chat`'s Session section keeps folder and branch, and `contextUsed`, `stepModel` and `useWindow` leave `chat`. One plugin owns token numbers. |
| 2 | Sum on the server with a `usage/session` RPC, or in the TUI by streaming the whole session over `session/live`? | Server: it sends a few numbers, not every event, and stays cheap for remote frontends. |
| 3 | Prices need a model's details on the server. Add `Models.details(model)` to `model`'s contract, the same `describe` the RPC uses, or use `Models.list`? | Add `details`: `list` skips signed-out providers, so their steps would go unpriced. |
| 4 | Show the share of the latest request read from the cache? | Yes: one line, and it shows whether the cache marks work. |
