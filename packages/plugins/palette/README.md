# @shanepadgett/liminal-palette

The command palette. Its `tui` entry binds `ctrl+p`, on while no dialog shows, to a picker of every command reachable now that has a `category`, grouped under its category. Each row shows the command's keys, else its `/name`. Enter closes the picker and runs the command.

A plugin puts a command in the palette by giving it `category` in `registerCommands` or `ChatScreen.registerDraftCommands`; a command without one is a key only. The picker is named `palette/commands`, so a `Pickers` wrap can change its rows.

The entry requires `Host`, `Keymap`, `Dialogs` and `Pickers`.
