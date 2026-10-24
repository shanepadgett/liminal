# @shanepadgett/liminal-slash

The `/` menu in the chat draft. Its `tui` entry adds a `draft-start` trigger to chat's `DraftTriggers`: `/` as the draft's first character lists every reachable command that has a slash name or alias, read each time the menu opens and ranked with `fuzzysort`.

Each row shows the text its command takes, dimmed after the name: `[hint]` when optional, `<hint>` when required. Enter completes the name and sends the draft as if it were typed. Tab completes the name; for a command that takes text it adds a space and the menu closes, otherwise the menu stays open. A plugin gives a command a slash name with `slash: { name, aliases? }` and the text it takes with `argument: { kind, hint }` in `registerCommands`.

A sent draft that starts with a reachable command's slash name, such as `/commit fix the docs first`, runs that command through a `ChatSend` wrap with the rest of the text, in place of starting a turn. A blocked command, or a required one sent with no text, posts its warning and puts `/name` and any text after it back in the draft, from the menu or a send; the menu stays closed.

The entry requires `Keymap`, `DraftTriggers`, `ChatScreen` and `ChatSend`.
