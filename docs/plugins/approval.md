# approval

Decides the tool calls a check asks about: a decision model, then a reviewer model, then the user.

Status: built

## Provides

- `Approval`: each session's waiting asks and mode, and the user's answers

## Requires

- `ToolChecks`, `Approvers`
- `ShellSafety`
- `Settings`
- `SessionLog`, `EntryKinds`
- `Models`, `ModelTask`
- `WorkspaceFiles`, `CommandRunner`

## Uses

- `Decisions`

## Requirements

### Checks

- Registers the only approval check in `ToolChecks`
- `shell`: a command matching `askCommands` asks; a line `ShellSafety` calls safe with `safeCommands` runs; any other asks
- `write` and `edit` ask only for a path outside the workspace
- `full` mode allows every call

### Chain

- `auto`: the decision model, then the reviewer, then the user
- `ask` mode and `askCommands` calls skip the decision model's and the reviewer's approval; the reviewer's summary still shows
- Decision questions: does the call run code the state does not show; the widest thing it can change; is it part of what the user asked
- The decision model approves when unseen code is at most 0.5 likely, nothing or the workspace is at least 0.8 likely, and the call either likely changes nothing or is likely on task; anything else hands off
- Decision model and reviewer see the call, the reason it asks, and the last two user prompts and assistant texts
- The reviewer is the newest turn's provider's small model, through `ModelTask`
- The reviewer may read files and run safe-list shell commands; other commands are refused
- The reviewer approves or writes a summary and reason for the user
- A failed review goes to the user without a summary
- Each answer is saved as a debug `approval/answer` entry the model never sees
- The transcript draws an `approval/answer` entry only in the debug view: tool, approved or rejected, who answered, the reason
- A rejection's note goes to the model as the denial reason
- An interrupted call withdraws its ask

### Settings

- Section `approval`: `mode` (`auto`, `ask`, `full`; default `auto`), `decisionModel` (`auto`, `jev`, `luna`, `off`; default `auto`), `safeCommands`, `askCommands`
- Invalid settings act as mode `ask`, decision model `off` and no added commands, with a logged warning
- `full` and project `safeCommands` apply only in a trusted project

### TUI

- The composer's model line shows the session's mode; `full` in the warning color
- `shift+tab` cycles the mode; `/approvals` chooses it in a dialog
- A session mode lives in memory over the settings' mode
- The session's oldest waiting ask opens the approval dialog: the command or path, the reviewer's summary, the reason, approve or reject with an optional note; esc rejects
