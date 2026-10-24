# @shanepadgett/liminal-session-name

The model names its session in the normal course of work.

- `name_session`: a deferred tool, offered before each model call while the session has no `session/name` event and withdrawn once it has one. It appends `session/name` with the trimmed name. Its description asks for a name of 3 to 8 words, given as soon as the model knows what the session is about, and never mentioned to the user.
- `session-name/name`: the session's name once it has one, then each new one.
- `./contract` exports `nameSessionName` and `SessionNameRpc`.

Requires `SessionLog`, `ToolList`, `Tools` and `BeforeCall`.

## TUI

The `tui` entry fills `chat`'s `title` slot with the session's name, nothing until it has one, and hides `name_session` calls in the transcript through `ToolRows`. It requires `ToolRows` and `Slots` and calls `session-name/name`.
