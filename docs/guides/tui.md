# TUI parts

A plugin's TUI part adds to the terminal screen: a view for an entry in the transcript, a slash command, a dialog, a key, a footer item. It runs in the frontend process and talks to the server only through RPCs. Write one when your plugin has something to show or a command to offer; the server part is in [plugins.md](plugins.md).

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

`setup` can read five services:

| Service | Gives |
| --- | --- |
| `TuiHost` | `register` into slots, `client` for RPCs, `follow` a session, `sessionState`, `keep` |
| `TuiCommands` | `register` commands and keys, `run`, `listed` |
| `TuiDialogs` | `show` and `close` a dialog |
| `TuiToasts` | `show` a toast |
| `TuiTheme` | `palette` on screen, `select` an id; `useColor` follows it |
| `TuiInputWaits` | Register input waits for attention notifications |

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
| `ChatSlots.footer` | list | | none |
| `ChatSlots.entry` | keyed | entry kind, `meta: EntryLook` | `{ entry: SavedEntry, sessionId }` |
| `ChatSlots.tool` | keyed | tool name, `meta: ToolRows` | `{ call: ToolCall, sessionId }` |
| `ChatSlots.live` | keyed | live kind | `{ live: LiveState, sessionId }` |
| `ChatSlots.composer` | chain | | `{ running, sessionId, matched }` |
| `ChatSlots.composerHints` | chain | | `{ running, sessionId, matched }` |
| `ChatSlots.hints` | list | | `{ running, sessionId }` |
| `ChatSlots.sidebar` | list | | `{ sessionId }` |

- Take `ChatSlots.composer` and `ChatSlots.composerHints` with the same `select` and a priority below 0, so your keys replace the composer's.

- A chain's component stays mounted while the same registration matches; new owner props and `matched` arrive as prop changes.

- A sidebar section is a `ChatSlots.sidebar` registration drawn with `SidebarSection`, `SidebarStat` and `SidebarNote` from `@liminal/sdk/tui`; the sidebar is 42 columns wide, its border and padding included. `order` may be negative; environment's Session section is first at -10. Example: `packages/plugins/usage/src/tui.tsx`.
- To add rows to the Context section instead of a section of your own, register `SidebarStat` rows in `UsageSlots.contextRows` from `@liminal/usage/contract` (list, `{ sessionId }`). Example: `packages/plugins/memory/src/tui/ContextRows.tsx`.

- To declare your own slot, export `Slot.single|list|keyed|chain("<plugin>/<place>", { scope })` from your contract and pass it as `declares` when you register the component that draws it. `scope` is `"root"` or `"session"`; session slots get `sessionId`.

Examples: `packages/plugins/chat/src/contract.ts`, `packages/sdk/src/core/slot.ts`.

## Draw an entry in the transcript

The transcript draws each saved entry with the component registered under its kind. `chat` draws only user, text and reasoning entries; every other plugin registers its own.

1. Decode `props.entry.data` with your kind's schema.
2. Fall back to `props.entry.text` when it does not decode, such as data from an older build.
3. Register it: `host.register(ChatSlots.entry, { key: YourEntry.kind, meta: {} }, View)`.

Example: `packages/plugins/notices/src/tui/Notice.tsx`.

The transcript draws your entry on the prompt's text edge. An entry that is a raised band with its own bar and padding, like the prompt, registers `meta: { isBand: true }` to start at the column edge. Example: `packages/plugins/questions/src/tui.tsx`.

Entries of a kind defined with `user: "debug"` draw only while the debug view is on: `/debug` flips it for the run, and `{ "chat": { "debug": true } }` in `settings.json` starts it on. Draw them as one `text.faint` line. Example: `packages/plugins/approval/src/tui/AnswerRow.tsx`.

## Draw live state

- Register a component under the live kind: `host.register(ChatSlots.live, { key: LiveReply.kind, meta: {} }, Reply)`. It draws at the transcript's end while the server keeps that live state set. Decode `props.live.data` the same way as an entry.

Example: `packages/plugins/agent-loop/src/tui/live.tsx`.

## Show a tool call

The transcript shows tool calls as work rows such as `Read src/kernel.ts`. The row leads with the tool's friendly label, such as `Shell`, `Read` or `Web search`, which is the same while the call runs and after. Rows with the same `joins.label` in a row merge into one, such as `Read 3 files`.

1. Word the row. For a tool whose params have a `path`, use `pathRows({ label, joins })` from `@liminal/chat/contract`. Otherwise write a `fold(call)` that returns a `WorkRow`: `label`, `subject`, optional `detail`, `joins: { label, noun }` and `oneLine` to cut a long subject to one line with `…`. Never word the label by tense: while `call.outcome` is absent the row turns an arc in place of its mark and shimmers its label, and shows the same label after.
2. Pick the opened row's component. It gets `call`, with `outcome.result` and `outcome.details` once done, and `text`, the result when it is text. The SDK's `Tail` shows the end of `text`, 8 lines unless given `lines`.
3. Register both under the tool name: `host.register(ChatSlots.tool, { key: "read", meta: rows }, Tail)`.

A tool whose calls the transcript shows as its own entry registers `meta: ToolRows.Hidden()`, and its calls draw no row. Wrap a hand-written `fold` in `ToolRows.Rows({ fold })`. Example: `packages/plugins/memory/src/tui.tsx`.

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
| `slash` | `{ name, aliases?, arguments? }`; with `arguments` the text after the command goes to `run(args)`; picking it in the command menu fills `/name ` for `true` and runs it at once for `"optional"` |
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
| `SelectDialog` | A filterable list; options are `{ title, value, description?, trailing?, category?, keys?, tag?, tone? }`; `onHighlight` runs as the highlight moves; `actions` bind other keys to the highlighted option, and one with `keepsOpen` runs without closing the dialog |
| `ConfirmDialog` | A yes or no; `title`, `question`, `action`, `onConfirm` |
| `PromptField` | A line of input; `question`, `isSecret`, `onSubmit` |
| `DialogFrame` | Your own dialog body with the standard title, hints and close |

- Set `screen` on `SelectDialog` to identify its current screen. Opening or changing screens highlights `current` when it matches the filtered list, otherwise the first row; screen changes retain the filter. Keep the identity unchanged for refreshes so they preserve the highlighted value. Omit `current` for lists such as sessions that always start at the top.
- Set `width` on `SelectDialog` or `DialogFrame` to request columns; the default is 60 and the terminal width caps it.
- Set an option's `trailing` for right-aligned dimmed metadata and a shrinking title with a trailing `…`. Existing descriptions, tags and keys retain their layout without it.
- Use `dialogActions: [{ key, label, run }]` for keys that work with an empty list; use `actions` for highlighted-row keys. Async option updates keep the highlighted value or select its next row, then the previous at the end. Use `emptyMessage` for an empty unfiltered list.
- Format activity labels with `formatRelativeDate(at, now)` from `@liminal/sdk/tui`, passing both UTC timestamps explicitly. It uses English elapsed minutes/hours/days, then a local calendar date after seven days.

Examples: `packages/plugins/chat/src/tui/SessionsDialog.tsx`, `packages/plugins/agent-loop/src/tui.tsx`, `packages/plugins/logins/src/tui/`.

## Ask the user in the composer's place

Use a custom prompt, not a dialog, when the app needs a decision from the user: it takes the composer's draft area, keeps the model line and leaves the draft alone. Use a dialog for a list the user opened to browse or pick from.

1. Keep a signal for what waits (the asks, the running flow) and a `select` that returns `true` while something does.
2. Register the prompt on `InboxSlots.input` and its key hints on `ChatSlots.composerHints`, both with `PromptPriority.<yours>` (hints at `hintsPriority(priority)`); the lowest priority shows.
3. Bind keys with `priority: PROMPT_KEYS_PRIORITY` and no bindings while `dialogs.top()` is set; `esc` is the cancel.
4. Show choices as `ListRow`s, and end the prompt body with `marginBottom={1}`.
5. Key the prompt with `<Show when={...} keyed>` so a new ask starts afresh; keep the same ask's state when it arrives again.

Examples: `packages/plugins/approval/src/tui/ApprovalPrompt.tsx`, `packages/plugins/commit/src/tui/CommitPrompt.tsx`, `packages/plugins/questions/src/tui.tsx`.

## Request user attention

1. Read `TuiInputWaits` in `setup` and pass its `waitForUser` function to your workflow.
2. Install the answer callback, then wrap the effect that waits for its answer. Register only when the prompt can accept input, not while its dialog shows work.
3. Keep `source` (your plugin name) and `id` stable for the same pending request within a session. Give separate questions separate ids.

```ts
const inputWaits = yield* TuiInputWaits;
const approved = yield* inputWaits.waitForUser(
  { sessionId, source: "commit", id: "review" },
  Deferred.await(answer),
);
```

The wrapper releases the wait on answer, failure or interruption. Use `register` in a request-owned scope when a stream supplies pending requests instead of an answer effect. Retain registrations across unchanged snapshots and close their scopes when requests disappear or the stream stops. Watch that stream through `makeBridge` so component disposal and plugin unload stop it.

The attention plugin handles sound and filters waits to the on-screen session. Your plugin does not depend on attention, and still works when it is disabled. Forms that end the agent turn use the existing turn-end notification; do not register a second wait for them. In tests, inject `waitForUser` from `makeTuiInputWaits` and observe `changes`.

Examples: `packages/plugins/commit/src/tui/flow.ts`, `packages/plugins/approval/src/tui/input-waits.ts`.

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
| `useMarkdownDiagrams(() => color)` | The `renderNode` for `<markdown>` that draws closed mermaid fences as box diagrams; source while open, unparsable or too wide |
| `Tail` | The last `lines` lines of `text` |
| `Hints` | Key hints, `[key, action]` pairs |
| `useCopy()` | `copy(text)` to the terminal clipboard and `isCopied()` for feedback |
| `wrapText`, `wrapWords`, `clampLines` | Text cut into lines of a width, and the first lines ending in `…` |
| `createPin()` | Which prompt of a scrolled column stays pinned at its top, and how far the next pushes it |
| `inkRunsAt`, `wordEndAt`, `FRESH_CHARS` | Streaming text as colored runs, the newest `FRESH_CHARS` characters warming up from the background and the rest of the word laid out unseen |
| `shimmerColors(length, phase, dim, bright)`, `SHIMMER_PERIOD_MS` | Each character's color as a band of light sweeps across a live line |
| `useClock(periodMs)` | Milliseconds into a loop, updated as frames draw, for motion that is a function of time |
| `formatDuration(seconds)` | `12s`, `2m 5s` |
| `formatRelativeDate(at, now)` | `just now`, `12 minutes ago`, `Oct 17`, `Oct 17, 2025` |
| `EllipsizedText` | A shrinking one-line `text` title, cut by display cells at grapheme boundaries; pass `fg` and optional children to style the visible text |
| `LiveLine` | What the assistant is doing now: a turning arc, a shimmering `label`, and `seconds` once past 3 |
| `Vapor` | A thought's newest three lines in faint italic, inked up to `head`, older lines paler |
| `WorkWords`, `workColor(color, part, dim)` | One work row (mark or running arc, bold label that shimmers while running, subject, bracketed detail, failure) and each part's color, `dim` of the way to dimmed |
| `fadeAt(text, head)`, `inkedOf`, `markdownOf` | A streaming answer split into settled Markdown and the inked paragraph being written; all Markdown while a code fence is open |

Examples: `packages/plugins/notices/src/tui/Notice.tsx` (colors, `useCopy`), `packages/plugins/agent-loop/src/tui/live.tsx` (markdown, `LiveLine`, `Vapor`), `packages/plugins/chat/src/tui/WorkRows.tsx` (`WorkWords`).

## Design in the gallery

The gallery (`apps/gallery`) shows every screen and component with sample data. Build a new look there first and get it agreed, then build the plugin's component.

- The gallery and the TUI keep separate components. A visual change updates both in the same change.

Example: `apps/gallery/src/transcript/Notice.tsx` beside `packages/plugins/notices/src/tui/Notice.tsx`.

## See also

- [plugins.md](plugins.md): entries, live state and RPCs on the server.
- [testing.md](testing.md#test-a-tui-part): TUI tests.
