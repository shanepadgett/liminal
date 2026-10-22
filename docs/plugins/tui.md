# Milestone 2: TUI

Work for [status.md](../status.md) milestone 2. UI layers and slots are in [architecture.md](../architecture.md#ui).

## Session view in `packages/client`

- `SessionView.open(session)`: `{ events, streaming, running }` in a `SubscriptionRef`, and `loadOlder`.
- `loop` gains `loop/turn-start`, saved with the input a turn takes; `loop/step-start` with the model id and `loop/step-end` around each model call, every start with an end, a finished one with the finish reason and token usage from Effect AI's `finish` part; and a `tool-input` variant of `loop/reply` with a tool call's params so far, parsed from unfinished JSON.
- Previous code: `archive/packages/frontend`.

## `packages/tui`

- OpenTUI renderer with Solid 1.x, OpenTUI's plugin slots, the UI kit for `tui` entries.
- UI kit builds on OpenTUI's `Markdown`, `Code`, `Diff`, `Select`, `TextTable`, `Image` and clipboard.
- Loads the `tui` entry of every plugin in the composition.
- One `screen` slot (`single_winner`), which `chat` fills.
- `Dialogs`: a stack with `open` and `close`, drawn above the screen with the dim.
- Plugins gain `./view` and `./tui` exports; the plugin anatomy check and lint rules learn them and who may import each.
- Previous code: `archive/packages/frontend`, `archive/apps/gallery`.

## `chat`

- The chat screen. Owns `TranscriptRules` in `view.ts`, and `ItemRenderer` and the `sidebar` (`append`) and `composer` (`replace`) slots in its `tui` entry.
- Sidebar: chat's Session section, and the context share from the latest `loop/step-end` over the model's `contextWindow`. Below 110 columns it is a drawer; the "Toggle sidebar" command (`ctrl+b`, in the palette) opens it, `escape` closes it, a footer hint shows while hidden.
- Each tool call and its result make one single-line row; consecutive tool rows sit next to each other, ungrouped.
- Composer: OpenTUI `Textarea`, `@` file tags as extmarks, stashes, slash commands from `Commands`.
- `@` completion: `fuzzysort` over `git ls-files`.
- Saved sessions: `SessionLog` gains the session list with titles; the chat screen opens a saved session; print mode gains `--session <id>`.
- RPC groups gain `session`'s `page` and `loop`'s `pullBack` and `queue`. A queued input can be pulled back until the turn takes it.
- `loop` gains the `Commands` registry with the first command. A command runs as soon as it is sent and is logged as `session/command`; one that changes the log waits for the running turn to end.
- Previous code: `chat`, `inbox` (composer).

```ts
// view.ts
export const TranscriptRules: Registry<TranscriptRule<unknown>>
// tui.tsx
type ChatSlots = { sidebar: { session: SessionId }; composer: { session: SessionId } }
export const ItemRenderer: Registry<{ kind: string; component: Component<{ item: Item }> }>
```

## `palette`

- Command palette over `@opentui/keymap` named commands and `Commands`, filtered with `fuzzysort`.
- Previous code: `palette`.

## `theme`

- Colors shared by the TUI and desktop: role names and `Palette` in the contract; OKLCH math, ramps, palettes and the palette-to-role mapping in `view.ts`.
- `tui` entry: OpenTUI's `SyntaxStyle`, fills the UI kit's color context; switching.
- Server: the theme setting, `theme/get` and `theme/set`.
- Previous code: `theme`.

## Model picker

- The `model` TUI entry: picks the session's model, filtered with `fuzzysort`.
- Picking a model saves it as the role's model in settings. Until a role is set, it uses the first signed-in provider's default.
- Print mode gains `--model provider/model`.

## `/connect` in the TUI

- The `accounts` TUI entry: `/connect` runs the same login methods and saves to the same credentials as `liminal connect`.
- Previous code: `logins`.
