# @shanepadgett/liminal-tools-processes

Adds four tools for commands that keep running, such as dev servers, watchers and REPLs: `process_start`, `process_output`, `process_input` and `process_stop`.

- `process_start` takes `command`, `description` and `wait`. It runs `bash -c` in the workspace inside a terminal 120 columns by 40 rows, with `TERM=xterm-256color`, `PAGER=cat` and `GIT_PAGER=cat`, and gives the process an id such as `p1`.
- `process_output` takes `id` and `wait`, and returns what is new since the last call.
- `process_input` takes `id`, `text`, `keys` and `wait`. It types the text, where `\n` presses Enter, then presses the keys: `enter`, `tab`, `escape`, `backspace`, `up`, `down`, `left`, `right`, `ctrl+c`, `ctrl+d`.
- `process_stop` takes `id`. It stops the process and everything it started, `SIGTERM` to its process group and then `SIGKILL` after 3 seconds, and returns its last output.

A call returns at once when the process has exited. Otherwise it returns once new output has come and then 1 second passes with none, or after `wait` seconds: 5 by default for `process_start` and `process_input`, 0 for `process_output`, 600 at most.

`@xterm/headless` keeps each process's screen and 5,000 lines above it. A call returns the lines from the first one that changed since the last call: new lines at the end, or from the first line a program redrew. A full-screen program returns its whole screen. When the last call's lines have scrolled out of the 5,000 kept, the result starts with `[earlier output dropped]`. Every result ends with `[p1 running]` or `[p1 exited with code N]`; a signal gives 128 plus its number.

Each session numbers its own processes, and another session's ids are unknown to it. Processes keep running between turns and stop when Liminal exits; an unknown id fails the call.

The `tui` entry adds `process_start`'s row to chat's `ToolRows`, labelled by the description. The other three tools use chat's plain row.

Requires `Tools` and `Directories`; the `tui` entry requires `ToolRows`.

## Contract

- `ProcessStartParams`: the params `process_start` takes, which its row reads.
- The four tool names, `START_WAIT`, `MAX_WAIT` and `waitParam`.

## Replace it

Add a tool with one of these names after `tools-processes`; of two tools with one name, the one added last is used.
