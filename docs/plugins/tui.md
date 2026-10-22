# Milestone 2: TUI

Work for [status.md](../status.md) milestone 2. UI layers and slots are in [architecture.md](../architecture.md#ui).

## Session view in `packages/client`

- Folds events into `{ messages, streaming, questions, status, actors }`.
- Previous code: `archive/packages/frontend`.

## `packages/tui`

- OpenTUI renderer with Solid 1.x, OpenTUI's plugin slots, the UI kit for `tui` entries.
- UI kit builds on OpenTUI's `Markdown`, `Code`, `Diff`, `Select`, `TextTable`, `Image` and clipboard.
- Loads the `tui` entry of every plugin in the composition.
- Previous code: `archive/packages/frontend`, `archive/apps/gallery`.

## `chat`

- The chat screen. Owns the `EventRenderer`, `Sidebar` and `Composer` slots.
- Composer: OpenTUI `Textarea`, `@` file tags as extmarks, stashes, slash commands from `Commands`.
- `@` completion: `fuzzysort` over `git ls-files`.
- `EventRenderer` is a registry keyed by event kind.
- Saved sessions: `SessionLog` gains the session list with titles; the chat screen opens a saved session; print mode gains `--session <id>`.
- RPC groups gain `session`'s `page` and `loop`'s `pullBack` and `queue`. A queued input can be pulled back until the turn takes it.
- `loop` gains the `Commands` registry with the first command. A command runs as soon as it is sent and is logged as `session/command`; one that changes the log waits for the running turn to end.
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

## Model picker

- The `model` TUI entry: picks the session's model, filtered with `fuzzysort`.
- Picking a model saves it as the role's model in settings. Until a role is set, it uses the first signed-in provider's default.
- Print mode gains `--model provider/model`.

## `/connect` in the TUI

- The `accounts` TUI entry: `/connect` runs the same login methods and saves to the same credentials as `liminal connect`.
- Previous code: `logins`.
