# files

Reads and writes files in the workspace for the tools that work on them, and offers the workspace's files and folders as `@` tags.

Status: built

## Provides

- `WorkspaceFiles`

## Uses

- `TagSources`

## Requirements

- A relative path resolves in the workspace
- A write replaces the whole file and makes its folders
- A failure is `FileFailed` with the path as given
- `@` rows come from `git ls-files -co --exclude-standard`, with the folders above them; outside a git repository it finds none
- Rows rank by fewest match runs, then shortest path; picture files are `image` rows with their size
- A folder tag attaches a one-level listing without git-ignored names; a picture tag attaches its bytes; a file tag attaches nothing
