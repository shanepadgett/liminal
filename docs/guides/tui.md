# TUI parts

A plugin's TUI part adds to the terminal screen: a view for an entry in the transcript, a slash command, a dialog, a key, a header item. It runs in the frontend process and talks to the server only through RPCs. Write one when your plugin has something to show or a command to offer; the server part is in [plugins.md](plugins.md).

## Create a TUI part

1. Add `tui: () => import("./src/tui.tsx")` to the manifest.
2. Add peers `@opentui/core` `0.6.6`, `@opentui/solid` `0.6.6` and `solid-js` `1.9.12` to `package.json`, plus `@liminal/chat` when you register into the chat screen.
3. Default-export `defineTui` from `src/tui.tsx`. `setup` runs each time the part loads, in a scope that closes when it unloads; everything it registers goes away with it.

   ```tsx
   export default defineTui({
     setup: Effect.gen(function* () {
       const host = yield* TuiHost;
       yield* host.register(ChatSlots.entry, { key: NoticeEntry.kind, meta: {} }, NoticeEntryView);
     }),
   });
   ```

Rules:

- Import screen helpers from `@liminal/sdk/tui`. Never import them in `plugin.ts` or `src/contract.ts`.
- Components are Solid components rendered by OpenTUI (`<box>`, `<text>`, `<markdown>`).
- Never import your server files. Share types and schemas through `src/contract.ts`.

`setup` can read four services:

| Service | Gives |
| --- | --- |
| `TuiHost` | `register` into slots, `client` for RPCs, `follow` a session, `sessionState`, `keep` |
| `TuiCommands` | `register` commands and keys, `run`, `listed` |
| `TuiDialogs` | `show` and `close` a dialog |
| `TuiToasts` | `show` a toast |

Example: `packages/plugins/notices/src/tui.tsx`.

## Register into a slot

A slot is a named place on screen that some plugin declares and others fill. `host.register(slot, options, Component)` adds your component; the options depend on the slot's kind.

| Kind | Options | Shows |
| --- | --- | --- |
| `single` | `{ priority? }` | One component; the lowest priority wins |
| `list` | `{ id, order? }` | Every registration, by `order` |
| `keyed` | `{ key, meta }` | One component per key; the owner reads `meta` |
| `chain` | `{ select, priority? }` | The first registration whose `select` matches the owner's props |

The chat screen's slots, from `@liminal/chat/contract`:

| Slot | Kind | Key | Component props |
| --- | --- | --- | --- |
| `ChatSlots.header` | list | | none |
| `ChatSlots.entry` | keyed | entry kind | `{ entry: SavedEntry, sessionId }` |
| `ChatSlots.tool` | keyed | tool name, `meta: ToolRows` | `{ call: ToolCall, sessionId }` |
| `ChatSlots.live` | keyed | live kind | `{ live: LiveState, sessionId }` |
| `ChatSlots.composer` | chain | | `{ running, sessionId, matched }` |
| `ChatSlots.composerHints` | chain | | `{ running, sessionId, matched }` |
| `ChatSlots.hints` | list | | `{ running, sessionId }` |
| `ChatSlots.sidebar` | list | | `{ sessionId }` |

- Take `ChatSlots.composer` and `ChatSlots.composerHints` with the same `select` and a priority below 0, so your keys replace the composer's.

- A chain's component stays mounted while the same registration matches; new owner props and `matched` arrive as prop changes.

- A sidebar section is a `ChatSlots.sidebar` registration drawn with `SidebarSection`, `SidebarStat` and `SidebarNote` from `@liminal/sdk/tui`; the sidebar is 42 columns wide, its border and padding included. Example: `packages/plugins/usage/src/tui.tsx`.

- To declare your own slot, export `Slot.single|list|keyed|chain("<plugin>/<place>", { scope })` from your contract and pass it as `declares` when you register the component that draws it. `scope` is `"root"` or `"session"`; session slots get `sessionId`.

Examples: `packages/plugins/chat/src/contract.ts`, `packages/sdk/src/core/slot.ts`.

## Draw an entry in the transcript

The transcript draws each saved entry with the component registered under its kind. `chat` draws only user, text and reasoning entries; every other plugin registers its own.

1. Decode `props.entry.data` with your kind's schema.
2. Fall back to `props.entry.text` when it does not decode, such as data from an older build.
3. Register it: `host.register(ChatSlots.entry, { key: YourEntry.kind, meta: {} }, View)`.

Example: `packages/plugins/notices/src/tui/Notice.tsx`.

Entries of a kind defined with `user: "debug"` draw only while the debug view is on: `/debug` flips it for the run, and `{ "chat": { "debug": true } }` in `settings.json` starts it on. Draw them as one `text.faint` line. Example: `packages/plugins/approval/src/tui/AnswerRow.tsx`.

## Draw live state

- Register a component under the live kind: `host.register(ChatSlots.live, { key: LiveReply.kind, meta: {} }, Reply)`. It draws at the transcript's end while the server keeps that live state set. Decode `props.live.data` the same way as an entry.

Example: `packages/plugins/agent-loop/src/tui/live.tsx`.

## Show a tool call

The transcript shows tool calls as work rows such as `Read src/kernel.ts`. Rows with the same `joins.verb` in a row merge into one, such as `Explored 3 files`.

1. Word the row. For a tool whose params have a `path`, use `pathRows({ running, done, joins })` from `@liminal/chat/contract`. Otherwise write a `fold(call)` that returns a `WorkRow`: `verb`, `subject`, optional `detail` and `joins: { verb, noun }`. `call.outcome` is absent while the call runs, so pick the running verb then.
2. Pick the opened row's component. It gets `call`, with `outcome.result` and `outcome.details` once done, and `text`, the result when it is text. The SDK's `Tail` shows the end of `text`, 8 lines unless given `lines`.
3. Register both under the tool name: `host.register(ChatSlots.tool, { key: "read", meta: rows }, Tail)`.

A tool whose calls the transcript shows as its own entry registers `meta: ToolRows.Hidden()`, and its calls draw no row. Wrap a hand-written `fold` in `ToolRows.Rows({ fold })`. Example: `packages/plugins/compaction/src/tui.tsx`.

Example: `packages/plugins/tools-read/src/tui.tsx`.

## Call the server

1. Get a client for your RPC group: `const cancel = yield* host.client(CancelRpcs)`.
2. Make a bridge: `const bridge = yield* makeBridge`.
3. Run a call from an event handler with `bridge.run(cancel["cancel/turn"]({ session }))`.
4. Turn a stream into a Solid accessor with `bridge.watch(stream, initial)`.

```tsx
const kernel = yield* host.client(KernelRpcs);
const state = bridge.watch(kernel["kernel/reload"](), ReloadCurrent.make({}));
```

Rules:

- `bridge.run` and `bridge.watch` run inside the part's scope; work stops when the part unloads.
- `host.follow(session)` streams a session's saved entries, then `Synced`, then new entries and live changes.
- State that must survive the part reloading goes in `host.sessionState(key, initial)` (per session) or `host.keep(key, schema, initial)` (also handed to the next process when the app restarts).

Examples: `packages/plugins/cancel/src/tui.tsx`, `packages/plugins/reload/src/tui.tsx`, `packages/plugins/inbox/src/tui.tsx`.

## Add a command

Commands run from a slash command in the composer, the command palette, or a key.

```tsx
const commands = yield* TuiCommands;

yield* commands.register(
  [
    {
      name: "reload.now",
      title: "Reload",
      desc: "Apply a reload that waits",
      category: "Liminal",
      slash: { name: "reload" },
      palette: true,
      run: () => bridge.run(kernel["kernel/reload-now"]()),
    },
  ],
  [{ key: "ctrl+r", cmd: "reload.now" }],
);
```

| Field | Meaning |
| --- | --- |
| `name` | `<area>.<action>`, unique |
| `slash` | `{ name, aliases?, arguments? }`; with `arguments: true` the text after the command goes to `run(args)` |
| `palette` | `true` to list it in the palette |
| `category` | The palette group |

- To run on both enter and the keypad's enter, pass `enterKeys(cmd)` as the keys.

Examples: `packages/plugins/reload/src/tui.tsx`, `packages/plugins/agent-loop/src/tui.tsx` (`/model`).

## Bind a key inside a component

- Call `useBindings` when a key applies only while a component shows. Return the commands and bindings as plain objects; pass an empty `bindings` array to turn them off.

```tsx
useBindings(() => ({
  commands: [{ name: "cancel.turn", run: () => bridge.run(cancel["cancel/turn"]({ session })) }],
  bindings: props.running ? [{ key: "escape", cmd: "cancel.turn" }] : [],
}));
```

- A `run` that returns `false` marks the key as rejected.
- Show the key under the composer with `<Hints color={color} hints={[["esc", "interrupt"]]} />` in a `ChatSlots.hints` registration.

Example: `packages/plugins/cancel/src/tui.tsx`.

## Open a dialog

1. Get `TuiDialogs` in `setup`.
2. Call `dialogs.show` with a component that takes `DialogProps` (`close`).

```tsx
dialogs.show((props: DialogProps) => (
  <SelectDialog
    title="Models"
    options={modelOptions(listed)}
    current={currentKey(defaults())}
    close={props.close}
    onSelect={pickOf(listed, pickThinking)}
  />
));
```

| Component | Use for |
| --- | --- |
| `SelectDialog` | A filterable list; options are `{ title, value, description?, category?, keys?, tone? }` |
| `ConfirmDialog` | A yes or no; `title`, `question`, `action`, `onConfirm` |
| `PromptField` | A line of input; `question`, `isSecret`, `onSubmit` |
| `DialogFrame` | Your own dialog body with the standard title, hints and close |

Examples: `packages/plugins/agent-loop/src/tui.tsx`, `packages/plugins/logins/src/tui/`.

## Show a toast

A toast is short feedback on something the user just did in the TUI. Something that happened in a session is a transcript notice instead.

1. Get `TuiToasts` in `setup`.
2. Call `toasts.show({ kind, title, message? })`; `kind` is `info`, `success`, `warning` or `error`.

One toast shows at a time, top right of the chat column, and a new one replaces it. It disappears after 4 seconds, or later while the mouse is over it.

Example: `/debug` in `packages/plugins/chat/src/tui.tsx`.

## Use theme colors

- Call `const color = useColor()` and pass role names: `fg={color("text.muted")}`. Never write a color value.

| Group | Roles |
| --- | --- |
| `surface` | `base`, `raised`, `overlay`, `selected` |
| `border` | `subtle`, `base`, `focus` |
| `text` | `base`, `muted`, `faint`, `ghost`, `accent`, `heading`, `inverse` |
| `fill` | `accent`, `danger`, `warning`, `success`, `info` |
| `feedback` | `danger`, `warning`, `success`, `info` |
| `gradient` | `from`, `to` |

Other helpers from `@liminal/sdk/tui`:

| Helper | Does |
| --- | --- |
| `useMarkdownStyle(() => color)` | The `syntaxStyle` for `<markdown>` |
| `Tail` | The last `lines` lines of `text` |
| `Hints` | Key hints, `[key, action]` pairs |
| `useCopy()` | `copy(text)` to the terminal clipboard and `isCopied()` for feedback |
| `wrapText`, `wrapWords`, `clampLines` | Text cut into lines of a width, and the first lines ending in `…` |
| `createPin()` | Which prompt of a scrolled column stays pinned at its top, and how far the next pushes it |
| `inkRunsAt`, `wordEndAt`, `FRESH_CHARS` | Streaming text as colored runs, the newest `FRESH_CHARS` characters warming up from the background and the rest of the word laid out unseen |
| `fadeAt(text, head)`, `inkedOf`, `markdownOf` | A streaming answer split into settled Markdown and the inked paragraph being written; all Markdown while a code fence is open |

Examples: `packages/plugins/notices/src/tui/Notice.tsx` (colors, `useCopy`), `packages/plugins/agent-loop/src/tui/live.tsx` (markdown).

## Design in the gallery

The gallery (`apps/gallery`) shows every screen and component with sample data. Build a new look there first and get it agreed, then build the plugin's component.

- The gallery and the TUI keep separate components. A visual change updates both in the same change.

Example: `apps/gallery/src/transcript/Notice.tsx` beside `packages/plugins/notices/src/tui/Notice.tsx`.

## See also

- [plugins.md](plugins.md): entries, live state and RPCs on the server.
- [testing.md](testing.md#test-a-tui-part): TUI tests.
