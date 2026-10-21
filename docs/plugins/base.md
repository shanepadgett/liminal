# Milestone 1: core and a turn

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `packages/core`

- `definePlugin`, `compose`, `Registry`, `Pipeline`, `Attribute` as in [architecture.md](../architecture.md#core).
- `Registry.add` and `Pipeline.wrap` return a registration tied to the calling plugin's scope.
- Depends only on `effect`.
- Previous code: `archive/packages/kernel/src/graph`, `archive/packages/sdk`.

## `model`

- Message and part types, `Model`, `Models` registry, `ModelCall` pipeline, `Models.generate`.
- Roles `main` and `small` resolve to model ids from settings.
- Owns the `Message` and `Part` schema the log stores; providers convert at their edge.
- Previous code: `models`, `decisions`.

```ts
Models.generate({ model: "small", prompt, schema })
  → resolve role → ModelCall.run(request) → schema ? decode : collect message
```

## `session`

- `SessionLog` with `open`, `append`, `page`, `live`; in-memory store.
- `Inbox.send`, `Send` pipeline, `Commands` registry, `defineEvent`.
- Notices are an event kind with `modelVisible: false`.
- Previous code: `session-log`, `inbox`, `notices`.

## `tools`

- `Tools` registry, `ToolCall` pipeline, a section listing tool guidance.
- Previous code: `tools`.

## `context`

- `Sections` registry, `History` pipeline that projects model-visible events into messages.
- Previous code: `context`.

## `loop`

- One turn as in [architecture.md](../architecture.md#base-plugins-the-agent); `TurnEnd` registry; cancel input.
- Previous code: `agent-loop`, `cancel`.

## `model-anthropic`

- Adds an Anthropic `ModelProvider` to `Models`, built on Effect AI's Anthropic provider.
- API key from the environment until `accounts` exists.
- Previous code: `model-anthropic`.

## `model-scripted`

- Adds a provider that replays scripted replies, including tool calls.
- Previous code: `model-scripted`.

## `apps/cli`

- Composes the base plugins, `model-anthropic` and one tool.
- Command line with `effect/cli`.
- Print mode over `client`: `-p` streams the reply to stdout, `--json` writes session events as JSON lines, `--approve` lets questions and approvals pass.

## Open

- Where settings live: a base service, part of `session`, or its own plugin (previous code: `settings`).
