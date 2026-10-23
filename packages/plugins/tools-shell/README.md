# @shanepadgett/liminal-tools-shell

Adds `shell`, which runs one foreground command with `bash` in the workspace.

`shell` takes `command`, `description` and `timeout`.

- Each call starts a fresh non-login `bash -c`, with no rc files, so nothing carries over between calls.
- stdin is closed, and `PAGER=cat`, `GIT_PAGER=cat` and `GIT_TERMINAL_PROMPT=0` are set, so a command that would wait for input fails or finishes instead of hanging.
- stdout and stderr come back merged in the order they were written, then a line for how the command ended: `[exit code N]`, `[ended by a signal]` or `[stopped after N seconds]`. A nonzero exit is a result, not a failed call. `tool-output` cuts long output; past 10 MB, `shell` keeps the first and last 5 MB itself.
- `timeout` is in seconds: 120 when left out, 3,600 at most. A command past it, or one whose call is interrupted, is stopped with everything it started: `SIGTERM` to its process group, then `SIGKILL` after 3 seconds.
- `description` is 5 to 10 words saying what the command does. The transcript row shows it as the label.
- The tool's description lists which of `rg`, `fd`, `jq`, `git`, `gh`, `bun`, `node` and `python3` are on `PATH` when the plugin starts.

While a command runs, its last 5 lines are published through `ToolContext.progress`. The `tui` entry adds `shell`'s row to chat's `ToolRows`: the description as the label, the last lines under it while it runs, and the command and the end of its output when opened.

Requires `Tools`, `Directories` and `ChildProcessSpawner`; the `tui` entry requires `ToolRows`.

## Contract

- `ShellParams`: the params `shell` takes.
- `ShellProgress`: `{ tail }`, the progress data the row reads.
- `shellName`, `DEFAULT_TIMEOUT`, `MAX_TIMEOUT`.

## Replace it

Add a tool named `shell` after `tools-shell`; of two tools with one name, the one added last is used.
