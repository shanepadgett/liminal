# files

Reads and writes files in the workspace for the tools that work on them.

Status: built

## Provides

- `WorkspaceFiles`

## Requirements

- A relative path resolves in the workspace
- A write replaces the whole file and makes its folders
- A failure is `FileFailed` with the path as given
