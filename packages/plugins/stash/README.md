# @shanepadgett/liminal-stash

Stashes: drafts the user sets aside, one list per workspace folder.

## Contract

`./contract` exports `StashRpc`:

- `stash/save`: stashes a text and its marks in the workspace folder's list; the same text again keeps one stash.
- `stash/list`: the folder's stashes, newest first, each with its `id`, `text`, `marks` and `createdAt`.
- `stash/drop`: deletes the stash with an `id`.

Each fails with `StashesFailed` when the `stashes` table cannot be read or written. The plugin requires `Directories` and `SqlClient`, and keeps its migrations in `stash_migrations`.

## TUI

| Key | Does |
| --- | --- |
| Ctrl+S | While the draft has focus and text: stash it, then clear it once saved. A failure is logged and the draft stays |
| `/pop` | Open the stashes picker; listed only while the folder has stashes |

In the picker, Enter puts the stash after the draft, with its marks, and drops it; Ctrl+D asks, then drops it. The `tui` entry requires `Host`, `Dialogs`, `Pickers`, `Keymap` and `ChatScreen`.
