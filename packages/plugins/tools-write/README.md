# @shanepadgett/liminal-tools-write

The `write` tool: a whole file, made or replaced.

`write` takes `path` and `content`. The path is relative to the workspace, or absolute.

- Missing folders are made. A file that exists is replaced; a folder at the path fails the call.
- `content` is written as given, line endings included.
- The model sees `Wrote <path>: N lines`. Beside it the tool saves `tools-write/written` `{ callId, path, patch }`, a unified patch from `diff` against what the file held before, which the model never sees.
- Its `access` is a write of `path`. It is `sequential`, so two writes in one reply never race on a file.

Requires `Tools`, `Directories`, `SessionLog`, `FileSystem` and `Path`.

## Contract

- `Written`: the `tools-write/written` event.
- `writeName`: the tool's name.

## `tui` entry

Adds the `write` row to `ToolRows`: the path, then the lines added and removed, such as `+40 -0`. A click opens the diff, drawn with `kit.Diff`.

## Replace it

Add a tool named `write` after `tools-write`; of two tools with one name, the one added last is used.
