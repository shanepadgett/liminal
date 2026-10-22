# @shanepadgett/liminal-directories

The folders Liminal reads and writes, as the `Directories` service.

| Field | Folder |
| --- | --- |
| `global` | `~/.liminal`, shared by every project |
| `workspace` | The folder Liminal works in |
| `project` | `<workspace>/.liminal` |

`DirectoriesRpc` serves `directories/workspace`: the workspace folder, the home folder written `~`, and the Git branch checked out, read from `.git/HEAD` on each call.

Requires `Path` and `FileSystem`. To keep files elsewhere, compose a plugin that provides `Directories` instead.
