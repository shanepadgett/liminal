# @shanepadgett/liminal-sqlite

Effect's `SqlClient` over `~/.liminal/liminal.db`, through Bun's SQLite. The file is readable only by the user and uses WAL, so the CLI, TUI and desktop app can share it.

Runs on Bun. Requires `Directories`, `FileSystem` and `Path`. To store data elsewhere, compose a plugin that provides `SqlClient` instead.
