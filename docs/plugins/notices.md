# notices

Session notices: what happened in a session, saved in the transcript for the user; the model never sees them.

Status: built

## Requires

- `EntryKinds`

## Requirements

- A notice is a `notices/notice` entry: kind (`info`, `success`, `warning`, `error`), title, optional body
- Saved and shown in the transcript; never sent to the model
- Server plugins write a notice with `notice()` from the contract, appended through `SessionLog`; it saves with `notices` off
- A plugin that ends a turn writes its own notice when the user should know
- Its TUI part draws notices in the chat transcript: the kind's mark and color, a bold title, the muted body, and a copy button that copies the title and body as plain text
