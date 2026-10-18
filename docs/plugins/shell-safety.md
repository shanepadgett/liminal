# shell-safety

Tells read-only shell commands apart from ones that can change things.

Status: built

## Provides

- `ShellSafety`

## Requirements

- A line is safe only when every command in it is on the read-only list or starts with an extra prefix
- A line that does not parse is never safe
- Writes are allowed only to `/dev/null`
- Background jobs, assignments before a command, process substitution and function definitions are never safe
- Commands inside command substitutions and heredocs must be safe too
- `cd` and `git` in one line are never safe
- Commands that can write through options (`find`, `fd`, `rg`, `sort`, `sed`, `git` and others) are safe only with read-only options and known arguments
- `git` is safe only for read verbs, branch and tag listing, and `remote` show and get-url
- Prefixes match word by word from the command name
- Reads no settings and registers no tool check
