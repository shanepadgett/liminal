# commit

`/commit` turns every changed file of the workspace's repository into conventional commits, then asks before pushing.

Status: built

## Provides

- RPCs: `commit/start`, `commit/check`, `commit/plan`, `commit/apply`, `commit/push-target`, `commit/push`

## Requires

- `CommitChecks`, `CommandRunner`, `AgentLoop`, `Models`, `ModelTask`, `Inbox`, `SessionLog`

## Adds

- TUI: `/commit [instruction]`, the commit dialog and one toast at the end

## Requirements

### Checks

- The `check` and `commit` lists due on the changed files run first, together, and skip a check that already passed in the session on the same files; a check that changes files stops the commit
- Failed checks go to the session as a `[commit checks]` follow-up and nothing is committed

### Plan

- The cheap model of the default provider groups every changed file into conventional commits; it answers up to three times, each time shown its last plan and why it broke a rule (a file left out or repeated, a bad subject)
- A single commit of every file is asked for with `allFiles`, not by listing each number
- The planner reads the numbered files, each file's diff against HEAD under its number and cut to an even share of the total, recent subjects, the user's prompts since the last commit and the text after `/commit`
- The dialog lists one line per commit; enter commits, esc cancels

### Commit and push

- Each commit stages exactly its files; hooks run, and a failure names the commits already made
- Push is always asked, No first; a branch without an upstream pushes to `origin` and sets it
- Esc answers no to a question and stops checks and planning; committing and pushing finish

## References

- Tau `src/tui/internal/CommitPanel.tsx`, `src/tui/internal/commit-flow.ts`, `src/core/internal/commit/`
