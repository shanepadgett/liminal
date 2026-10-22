# @shanepadgett/liminal-chat

The chat screen: a landing until the first send opens a session, then the session's transcript, a composer and a sidebar. It fills the TUI's `screen` slot. It has no backend and no contract.

## View

`./view` has no frontend framework, so any frontend can use it:

- `buildTranscript(state, kinds)`: a session view's events and deltas as turns of items: later inputs, replies, tool rows, notices, and events of the `kinds` other plugins draw. Reasoning never shows. A tool call and its result share one row.
- `contextUsed(state)`: the latest step's input tokens, for the share of the context window in use.
- `isWriting(state)`: whether reply text is streaming now.

## TUI

`./tui` exports what other plugins add to the chat screen:

| Export | What it is |
| --- | --- |
| `ItemRenderer` | A registry of `{ kind, component }`: how saved events of `kind` show in the transcript. Add to it from a `tui` entry |
| `sidebar` | The column beside the transcript once a session starts; every fill shows, in order. Props: `session`, `state` |
| `composer` | Where the user writes; the last fill wins. Props: `running`, `send(text, mode?)`, `cancel()`, `screenHints` (keys the screen adds to the hints, such as `ctrl+b` while the sidebar is hidden) |

Chat fills `sidebar` with the Session section (folder, git branch, context share) and `composer` with its own composer.

Keys:

| Key | Does |
| --- | --- |
| Enter | Send; while a turn runs, steer it |
| Shift+Enter | New line |
| Tab | While a turn runs, send as a follow-up |
| Esc | Close the open sidebar; otherwise, while a turn runs, stop it |
| Ctrl+C | Clear the draft; with no draft, quit |
| Ctrl+B | Open or close the sidebar, below 110 columns |

`@` at the start of the draft or after whitespace opens the list of tags above the draft. It loads `tags/list` once each time it opens, and ranks rows by their `fuzzysort` match times one plus their frecency, 50 at most. While it is open, Up and Down move, Enter tags the row, Tab opens a folder (and tags a file), and Esc closes it until the cursor leaves the tag. A picked tag is a virtual extmark: the cursor steps over it and Backspace removes it whole. `buildTranscript` leaves out the parts `tags` added to a message, by its `tags/attached` attribute.

The `tui` entry requires `Slots` and `Renderer`, and calls `session/*`, `loop/*`, `tags/list`, `directories/workspace` and `model/main`.
