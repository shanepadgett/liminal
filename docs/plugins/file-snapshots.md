# file-snapshots

Rolls files on disk back when a session rewinds.

Status: planned

## Requires

- `SessionLog`

## Requirements

- Keeps a hidden git history per project, separate from the user's
- Takes a snapshot at each step
- Designed in from the start, so every session can rewind its files

## Open

- Where the hidden history lives, and how it handles several workspace folders

## References

- OpenCode `packages/core/src/git.ts`, `packages/core/src/session/revert.ts`
