# @shanepadgett/liminal-commit

`/commit` turns every changed file of the git repository holding the workspace into conventional commits.

- `commit/start`: the repository root, its changed files (untracked ones included), the `commit.push` setting and the `small` model's id. Fails with `Nothing to commit.` when no file changed.
- `commit/plan`: the `small` model groups the files into commits through `Models.generateObject`. It reads each file's diff (48,000 characters in all, 400 to 4,000 per file), the last 12 commit subjects and the text after `/commit`. A plan must put every file in exactly one commit with a conventional subject; a wrong plan goes back to the model, up to 3 times.
- `commit/apply`: commits each group in order, staging exactly its files, and streams progress. A failure says which commits were made.
- `commit/push-target` and `commit/push`: the branch's upstream, or `origin/<branch>` for a new branch, and the push.
- `commit.push` in `settings.json`: `ask` (the default), `always` or `never`.
- `./contract` exports the schemas, `CommitSetting` and `CommitRpc`.

Git runs directly with no shell and `GIT_TERMINAL_PROMPT=0`. Requires `Directories`, `Models`, `Settings`, `DeclaredSettings` and `ChildProcessSpawner`.

## TUI

The `tui` entry registers `/commit` (`commit.run`), which runs only while no turn runs. While a flow runs, its ask covers the composer: Porter while the model plans (esc stops), the plan for review (enter commits, esc cancels, up and down scroll past 4 commits), progress while git commits, then the push question with No first. Each ending is one notification. It requires `Host`, `Keymap`, `Notifications`, `ChatScreen` and `ComposerCovers`.
