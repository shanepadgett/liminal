# environment

The facts of the workspace and its files, kept current in the prompt.

Status: built

## Requires

- `PromptSections`
- `CommandRunner`

## Requirements

- `environment/facts`, order 100: workspace, git repository or not, platform, shell, date; read on every request
- `environment/files`, order 110: the workspace two levels deep, folders ending in `/`, capped at 200 lines
- In a git repository the listing leaves out what git ignores; elsewhere it leaves out names starting with a dot
- Updates send only changed facts, and only added and removed files
- A failed read keeps the saved value
