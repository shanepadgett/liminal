# @shanepadgett/liminal-environment

Where Liminal runs, as the `environment` section of the system prompt (`order` 100), read again before each model call: the workspace folder, the Git repository and branch, the platform, the date, and the workspace root's entries. In a repository the entries come from Git, so ignored files are left out; at most 200 are listed.

Requires `Sections` from `system-prompt` and `Directories`, plus `FileSystem`, `Path` and `ChildProcessSpawner` for running `git ls-files`.

## Replace it

Leave `environment` out of the composition and add a section named `environment`.
