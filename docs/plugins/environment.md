# environment

The facts of the workspace and its root entries, kept current in the prompt, and the sidebar's Session section.

Status: built

## Requires

- `PromptSections`
- `CommandRunner`

## Requirements

- `environment`, order 100, one section: workspace, git repository or not, platform, shell, date, then the workspace root's entries; read on every request
- The listing holds the root only, folders ending in `/`, capped at 200 lines
- In a git repository the listing leaves out what git ignores; elsewhere it leaves out names starting with a dot
- Updates send only changed facts, and only added and removed entries
- A failed read keeps the saved value
- The sidebar's Session section sits above Context (order -10): the folder Liminal runs in with the home folder written as `~`, and the git branch
- On a detached HEAD the branch row shows the short hash; outside a repository it is left out
- The branch is read on subscribe and every 5 seconds; the section updates only when the folder or branch changed
