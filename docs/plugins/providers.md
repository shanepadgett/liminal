# Milestone 4: providers and cost

Work for [status.md](../status.md) milestone 4.

## Model providers

- `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go`: each adds a `ModelProvider` to `Models` and its logins to `LoginMethods`.
- OpenAI-compatible wire code is a shared library, not a contract.
- Previous code: same names.

## `model-catalog`

- Model names, context limits and prices from models.dev; providers and `usage` read it.
- Previous code: `model-catalog`.

## `usage`

- Attaches token counts and cost to assistant events; adds a `Sidebar` item.
- Previous code: `usage`.

```ts
ModelCall.wrap((req, next) => next(req).pipe(tapFinish(u => attach(Usage, cost(u, catalog)))))
Slots.add(Sidebar, { component: UsageSummary })
```

## `cache-hints`

- Wraps `ModelCall`: marks cache breakpoints on providers that need them.
- Previous code: `cache-hints`.

## `session-name`

- `TurnEnd` hook names an unnamed session with `Models.generate` on the `small` model with a schema.
- Previous code: `session-name`.
