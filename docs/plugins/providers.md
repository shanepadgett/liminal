# Milestone 4: cost and naming

Work for [status.md](../status.md) milestone 4.

## Cache marks in `model-wire`

- The Messages wire sends a top-level `cache_control`, so the API caches the prompt up to its last block; `model-openrouter` sends the same for `anthropic/` models.
- Previous code: `cache-hints`.

## `usage`

- Prices the token usage on `loop/step-end` events from the catalog; adds a section to `chat`'s `sidebar` slot.
- Previous code: `usage`.

## `session-name`

- `TurnEnd` hook names an unnamed session with `Models.generateObject` on the `small` model.
- Previous code: `session-name`.
