# @shanepadgett/liminal-session-picker

The list of saved sessions. Its `tui` entry adds `ctrl+o` and `/sessions`, active while the chat draft has focus: a picker of this folder's latest 100 sessions from `session/list`, newest first, each titled by the first line of its first user message.

Rows sit under Today, Yesterday and Earlier by local date; the detail says how long ago today (`2h ago`), the time yesterday (`18:20`) and the date before (`Oct 14`). The session on screen starts selected. Enter shows the pick on the chat screen with `ChatScreen.show`. The picker is named `session-picker/sessions`.

The entry requires `Host`, `Keymap`, `Dialogs`, `Pickers` and `ChatScreen`.
