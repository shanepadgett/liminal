# @shanepadgett/liminal-slash

The `/` menu in the chat draft. Its `tui` entry adds a `draft-start` trigger to chat's `DraftTriggers`: `/` as the draft's first character lists every reachable command that has a slash name or alias, read each time the menu opens and ranked with `fuzzysort`.

Enter clears the draft and runs the command; Tab completes its name and keeps the menu open. A plugin gives a command a slash name with `slash: { name, aliases? }` in `registerCommands`.

The entry requires `Keymap` and `DraftTriggers`.
