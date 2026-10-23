# @shanepadgett/liminal-chat

The chat screen: a landing until the first send opens a session, then the session's transcript, a composer and a sidebar. It fills the TUI's `screen` slot. The plugin has only a `tui` entry.

## View

`./view` has no frontend framework, so any frontend can use it:

- `buildTranscript(state, kinds)`: a session view's events and deltas as turns of items: later inputs, replies, tool rows, notices, each closed turn's end (done, stopped or interrupted, with the model and how long it ran; a failed turn ends in its error notice), and events of the `kinds` other plugins draw. Reasoning never shows. A tool call and its result share one row.
- `contextUsed(state)`: the latest step's input tokens, for the share of the context window in use.
- `isWriting(state)`: whether reply text is streaming now.
- `draftTextOf(input)`: what the user wrote in an input, such as a queued message, without the parts plugins added; none for other inputs.

## TUI

`./tui` exports what other plugins add to the chat screen:

| Export | What it is |
| --- | --- |
| `ItemRenderer` | A registry of `{ kind, component }`: how saved events of `kind` show in the transcript. Add to it from a `tui` entry |
| `ToolRows` | A registry of `{ tool, component }`: how calls to `tool` show in the transcript, in place of the plain row. Props: `item` (the call, its result and whether it runs), `state` |
| `ComposerCovers` | A registry of `{ active(props), component }`: something that takes the composer's place while it is active, such as a question to answer. The first active cover shows. Props: the composer's, plus `session` and `state` |
| `Moods` | A registry of `{ active(props), words(props), poses?, header? }`: how the screen looks while a turn runs and the mood is active. `words` and `poses` are what Porter, the face that murmurs below the transcript, says and does; `header: "still"` stops the header's scanning diagonals. The first active mood wins, else the screen's own look. Props: `session`, `state` |
| `WorkRow` | The plain row a tool call shows as, for a `ToolRows` view that keeps its look. `note` is a short fact after the input, such as `+3 -1`. `details()` draws what a click opens under the row, each time it opens; a row with details brightens under the mouse, one without stays still |
| `Gutter` | The composer's left bar, `rows` high, for a cover that keeps the composer's look |
| `sidebar` | The column beside the transcript once a session starts; every fill shows, in order. Props: `session`, `state` |
| `composer` | Where the user writes; the last fill wins. Props: `running`, `queued`, `send(text, mode?)`, `cancel()` (also puts the queued inputs back into the draft), `pullBack()` |
| `status` | The left of the hint row under the draft, such as the model line; every fill shows, in order, at its own width, and the hints take the rest. Props: `session`, undefined on the landing |
| `ChatSend` | The pipeline every send from the screen runs through, with `session`, `input` and `mode`, before the screen shows the session. A wrap still sees the screen it was sent from, so it can add what was chosen there |
| `ChatScreen` | The screen as commands reach it: `session()`, `show(session)`, `startNew()` (back to the landing; nothing is saved until the next send), `draft` with `text()`, `insert(text)`, `prepend(text)` and `clearIf(text)`, and `registerDraftCommands(commands, keys)`: commands that work only while the draft has focus |
| `DraftTriggers` | A registry of menus a character opens in the draft. See below |
| `replaceToken(draft, token, text)` | Puts `text` in place of a trigger's token |

Chat fills `sidebar` with the Session section (folder, git branch, and the share of the context window the latest step's model used, read with `model/details`) and `composer` with its own composer.

### Draft triggers

A `DraftTrigger` is `{ char, where, open }`. `where` is `any-word` (the start of the draft or after whitespace) or `draft-start`. Each time the character starts a token there, chat runs `open` and shows a menu above the draft with its `rows(query)` for the text after the character, or its `empty` line when none match. Up and Down move; each of its `keys` runs with the row, the textarea and the token, and edits the draft itself. A key works only while a row matches and its `enabled(row)`, if any, is true; otherwise Enter and Tab reach the composer. Esc closes the menu until the cursor leaves the token. The first trigger added wins a character.

Keys:

| Key | Does |
| --- | --- |
| Enter | Send; while a turn runs, steer it |
| Shift+Enter | New line |
| Tab | While a turn runs, send as a follow-up |
| Esc | Close the open sidebar; otherwise, while a turn runs, stop it |
| Ctrl+C | Clear the draft; with no draft, quit |
| Ctrl+B | Open or close the sidebar, below 110 columns |
| Ctrl+N, `/new` | New session: back to the landing screen |

The line under the draft shows a hint for each key that would do something now, while the draft has focus: Enter appears once the draft has text, Esc only while a turn runs. Enter and Esc come first; when the rest do not fit, the line ends with `ctrl+g more`. `buildTranscript` leaves out the parts plugins added to a message on send, by `loop`'s `loop/added` attribute.

The `tui` entry requires `Host`, `Slots`, `Renderer` and `Keymap`, and calls `session/*`, `loop/*`, `directories/workspace` and `model/details`.
