# Milestone 2: TUI

Work for [status.md](../status.md) milestone 2. UI layers and slots are in [architecture.md](../architecture.md#ui).

## `packages/client`

- `send`, `page`, `live`, `call` over plain function calls; no Effect dependency.
- Session view: folds events into `{ messages, streaming, questions, status, actors }`.
- Previous code: `archive/packages/frontend`.

## `packages/tui`

- OpenTUI renderer with Solid 1.x, OpenTUI's plugin slots, the UI kit for `tui` parts.
- UI kit builds on OpenTUI's `Markdown`, `Code`, `Diff`, `Select`, `TextTable`, `Image` and clipboard.
- Loads the `tui` part of every plugin in the composition.
- Previous code: `archive/packages/frontend`, `archive/apps/gallery`.

## `chat`

- The chat screen. Owns the `EventRenderer`, `Sidebar` and `Composer` slots.
- Composer: OpenTUI `Textarea`, `@` file tags as extmarks, stashes, slash commands from `Commands`.
- `@` completion: `fuzzysort` over `git ls-files`.
- `EventRenderer` is a registry keyed by event kind.
- Previous code: `chat`, `inbox` (composer).

```ts
type ChatSlots = { sidebar: { session: SessionId }; composer: { session: SessionId } }
export const EventRenderer: Registry<{ kind: string; component: Component<{ event: SessionEvent }> }>
```

## `palette`

- Command palette over `@opentui/keymap` named commands and `Commands`, filtered with `fuzzysort`.
- Previous code: `palette`.

## `theme`

- Theme tokens the UI kit reads; theme switching.
- Previous code: `theme`.

## `session-sqlite`

- Replaces the in-memory `SessionLog` with SQLite under `~/.liminal/`.
- Queries through `SqlClient`; the host supplies `@effect/sql-sqlite-bun`.
- Runner is an in-process lock.
- Previous code: `session-store`.

## `accounts`

- Credentials in a `0600` JSON file under `~/.liminal/`, `LoginMethods` registry that providers add to, `/connect` command.
- Previous code: `logins`, `credential-store`.

```ts
// model-anthropic adds its logins
LoginMethods.add({ provider: "anthropic", kind: "api-key" })
LoginMethods.add({ provider: "anthropic", kind: "oauth", run: anthropicOAuth })
```
