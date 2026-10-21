# Milestone 4: cost and naming

Work for [status.md](../status.md) milestone 4.

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
