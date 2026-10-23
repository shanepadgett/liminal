# Milestone 2: TUI

Work for [status.md](../status.md) milestone 2. UI layers and slots are in [architecture.md](../architecture.md#ui).

## Session view in `packages/client`

- `SessionView.open(session)`: `{ events, streaming, running }` in a `SubscriptionRef`, and `loadOlder`. It loads the latest page, then every new event; `loadOlder` loads the page before the oldest held, and nothing held is dropped.
- `session` gains the `session/page` RPC; `loop` gains `loop/state`, a stream of whether a turn runs, which the view's `running` follows.
- `loop` gains `loop/turn-start`, saved with the input a turn takes; `loop/step-start` with the model id and `loop/step-end` around each model call, every start with an end, a finished one with the finish reason and token usage from Effect AI's `finish` part; and a `tool-input` variant of `loop/reply` with a tool call's params so far, parsed from unfinished JSON.
- Previous code: `archive/packages/frontend`.

## `packages/tui`

- OpenTUI renderer with Solid 1.x, OpenTUI's plugin slots, the UI kit for `tui` entries.
- UI kit builds on OpenTUI's `Markdown`, `Code`, `Diff`, `Select`, `TextTable`, `Image` and clipboard.
- Loads the `tui` entry of every plugin in the composition.
- One `screen` slot (`single_winner`), which `chat` fills.
- `Dialogs`: a stack with `open` and `close`, drawn above the screen with the dim.
- `Keymap` and `registerCommands`: keymap commands with `title`, `category`, `slash`, `hint` and `enabled`; `listCommands` reads back the reachable ones. Every hint line shows only the keys that would run now (`activeHints`, `useHints`).
- `Pickers`: a pipeline every picker spec passes through by name; `openPicker` draws the kit's `Picker` in a dialog.
- Plugins gain `./view` and `./tui` exports; the plugin anatomy check and lint rules learn them and who may import each.
- Previous code: `archive/packages/frontend`, `archive/apps/gallery`.

## `chat`

- The chat screen. Builds the transcript in `view/`; owns `ItemRenderer` (by event kind) and the `sidebar` (`append`) and `composer` (`replace`) slots in its `tui` entry.
- Sidebar: chat's Session section, and the context share from the latest `loop/step-end` over the model's `contextWindow`. Below 110 columns it is a drawer; the "Toggle sidebar" command (`ctrl+b`, in the palette) opens it, `escape` closes it, and the `ctrl+b sidebar` hint shows while it is closed.
- The transcript opens at the bottom: its first frame shows the latest items, with no scroll down after loading.
- Each tool call and its result make one single-line row; consecutive tool rows sit next to each other, ungrouped.
- Composer: OpenTUI `Textarea`, the menus of `DraftTriggers` that other plugins add, and a line under the draft with the session's model and its thinking level from `model-choice`.
- `ChatScreen`: the session on screen, showing another or none, and the draft, for other plugins' commands.
- `@` list, in `tags`' `tui` entry: `tags/list` once each time it opens, ranked in the TUI by `fuzzysort` times one plus frecency, 50 rows. `tags` adds each tag's text on send; the transcript hides the parts it added.
- Saved sessions: `SessionLog` gains the session list of the workspace folder, each listed by the first line of its first user message; the header shows a title only once `session-name` sets one. The chat screen opens a saved session (`ctrl+o`) and starts a new one (`ctrl+n`, `/new`); print mode gains `--session <id>`.
- `loop/state` gains the queued inputs, and `loop` gains `pullBack`. A queued input can be pulled back until the turn takes it.
- Previous code: `chat`, `inbox` (composer).

```ts
// view/index.ts
export const buildTranscript: (state: ViewState, drawn: ReadonlySet<string>) => ReadonlyArray<Turn>
// tui/index.tsx
type ChatSlots = {
  sidebar: { session: SessionId; state: ViewState }
  composer: { running: boolean; send(text, mode?): void; cancel(): void }
}
export const ItemRenderer: Registry<{ kind: string; component: (props: { event: SessionEvent }) => JSX.Element }>
```

## `stash`

- Drafts set aside with `ctrl+s`, one list per workspace folder; `/pop` opens the stashes picker.
- Previous code: `inbox` (stash).

## `slash`

- The `/` draft trigger: as the draft's first character, it lists the reachable commands that have a slash name.

## `palette`

- Command palette over the `@opentui/keymap` commands that have a category, filtered with `fuzzysort`. A command carries `title`, `category` and `slash` fields on the keymap's own `Command` (OpenCode `tui/src/context/keymap.tsx`).
- Previous code: `palette`.

## `theme`

- Colors shared by the TUI and desktop: role names and `Palette` in the contract; OKLCH math, ramps, palettes and the palette-to-role mapping in `view.ts`.
- `tui` entry: OpenTUI's `SyntaxStyle`, fills the UI kit's color context; switching.
- Server: the theme setting, `theme/get` and `theme/set`.
- Previous code: `theme`.

## Model picker

- `model-choice`: `/model`, the model line in chat's `status` slot and `shift+tab` thinking levels. Each session logs a `model-choice/pick` event when its model changes; a new session runs `model-choice.default`, else the newest pick in any session, else the first signed-in provider's default. `ctrl+d` in the picker saves the default.
- `model-favorites`: a Favorites section in the picker and `ctrl+f`.
- Print mode's `--model provider/model` sets the `model-choice/pick` attribute.

## `/connect` in the TUI

- The `accounts` TUI entry: `/connect` runs the same login methods and saves to the same credentials as `liminal connect`.
- Previous code: `logins`.
