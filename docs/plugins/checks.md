# checks

Runs the project's own commands: fixers after each writing call, checks through the `checks` tool and when a turn would end with unchecked changes.

Status: built

## Requires

- `BeforeCallHooks`, `TurnEndingHooks`
- `CommandRunner`
- `EntryKinds`, `SessionLog`
- `LongOutput`
- `Tools`, `ToolWrappers`

## Requirements

- Checks live in `.liminal/checks.json` with `fix`, `check` and `commit` lists; ignored in an untrusted workspace
- Each entry has `name`, `command`, and optional `details`, `include`, `exclude`, `cwd`, `env`, `timeoutSeconds` (default 120)
- `include` and `exclude` are globs on paths from the workspace; `{files}` in a command becomes the matching changed files
- Changed files come from git snapshots before and after each writing call; outside git the changes are unknown and every check is due
- Fixers run silently on a call's changed files; the debug view shows a line for each run
- `CommitChecks` gives `/commit` the `check` and `commit` lists due on the files it will commit, minus the checks that already passed on them
- Checks run together, not one at a time; fixers run one at a time, in order
- A pass is saved as a hidden `checks/passed` entry whose key covers the check's definition, the repository's HEAD and the version of each file it covered: a whole-project check covers every changed file its globs match, a `{files}` check the files it was given
- A check whose latest pass has the same key is not run again, by turn-end settling, the `checks` tool or `/commit`; the report names it as passed earlier
- Outside git nothing is skipped
- The `checks` tool exists only while the file has `check` commands, and follows edits to the file from the next model call
- Call `checks` directly as the final action before the summary; it is unavailable inside `run` and draws its own tool row
- The `checks` tool is the only way to run checks; its description and system prompt guidance forbid running a check by any other command, tool or script, in whole or in part, and say that a check which does not exist is worked out with the user and added to the checks file
- When the model ends its turn with changes no report covers, the due checks that have not passed run and save a report entry
- A failed report goes back to the model; after three failed reports in one turn, the turn ends
- `commit` runs only in `/commit`

## References

- Tau `src/core/internal/checks/`, `src/core/internal/loop/settle-checks.ts`, `src/workspace/Snapshot.ts`
