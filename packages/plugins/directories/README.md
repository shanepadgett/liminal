# @shanepadgett/liminal-directories

The folders Liminal reads and writes, as the `Directories` service.

| Field | Folder |
| --- | --- |
| `global` | `~/.liminal`, shared by every project |
| `workspace` | The folder Liminal works in |
| `project` | `<workspace>/.liminal` |

Requires `Path`. To keep files elsewhere, compose a plugin that provides `Directories` instead.
