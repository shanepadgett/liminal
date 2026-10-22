# Milestone 4: cost and naming

Work for [status.md](../status.md) milestone 4.

## `usage`

- Prices the token usage on `loop/step-end` events from the catalog; adds a section to `chat`'s `sidebar` slot.
- Previous code: `usage`.

## `cache-hints`

- Wraps `ModelCall`: marks cache breakpoints on providers that need them.
- Previous code: `cache-hints`.

## `session-name`

- `TurnEnd` hook names an unnamed session with `Models.generateObject` on the `small` model.
- Previous code: `session-name`.
