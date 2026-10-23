# @shanepadgett/liminal-tools-edit

The `edit` tool: exact text replacements in one file.

`edit` takes `path` and `edits`, a list of `{ oldText, newText }`. The path is relative to the workspace, or absolute.

- Each `oldText` is found in the file as it was before the call, exactly once. When the exact text is not there, the edit is found line by line with trailing whitespace dropped and smart quotes, dashes and odd spaces made plain; that match changes only the lines it covers.
- The call fails, and the file stays as it was, when an `oldText` is empty, not found or found more than once, when two edits overlap, or when the edits change nothing. A missing file fails with a pointer to `write`; a folder or binary file fails.
- The file keeps its BOM and its line endings: a file with CRLF is written back with CRLF.
- The model sees `Edited <path>: N changes`. Beside it the tool saves `tools-edit/changed` `{ callId, path, patch }`, a unified patch from `diff`, which the model never sees.
- Its `access` is a write of `path`. It is `sequential`, so two edits in one reply never race on a file.

Requires `Tools`, `Directories`, `SessionLog`, `FileSystem` and `Path`.

## Contract

- `Changed`: the `tools-edit/changed` event.
- `editName`: the tool's name.

## `tui` entry

Adds the `edit` row to `ToolRows`: the path, the number of edits while the call streams, then the lines added and removed, such as `+3 -1`. A click opens the diff, drawn with `kit.Diff`.

## Replace it

Add a tool named `edit` after `tools-edit`; of two tools with one name, the one added last is used.
