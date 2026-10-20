# Sessions

What a chat session is and the rules every session plugin follows. Each part belongs to a plugin; see the Session, Turns and Context areas in [plugins/](../plugins/_index.md).

## Nouns

| Noun | Meaning |
| --- | --- |
| Session | The durable container: id, workspace, origin (new or fork), title |
| Entry | One immutable record in a session's log |
| Turn | A prompt or a set of answers, through the final answer or a question form |
| Step | One model call and the tool calls it asked for |
| Inbox | Input sent while a turn runs: a steer joins the turn after the next tool round, a follow-up starts the next turn |
| Live state | Work in progress (partial text, running tool output, thinking); watched by clients, not yet an entry |
| Context | What the model sees, built from entries |
| Views | Values derived from the log: transcript, session list, titles, usage |

## Log

- A session is an append-only log of immutable entries; the log is the source of truth
- Session metadata lives in an index rebuilt from the log
- Entries hold model-level records with timestamps; turns and steps are derived from their order
- Plugins add their own entry kinds through their contracts
- Model and thinking-level changes are entries the model does not see
- Transcript groups and wording are derived, never stored
- Each session is one line; a fork is a new session that reads its parent's entries up to a point
- Rewinding a session also rolls back files
- Visible history is never removed; a checkpoint changes only what the model sees
- JSONL is only an export format
- Until release, the storage format changes through one-off migrations that are periodically condensed

## Durability

- Nothing is shown until it is saved; unfinished output is saved about every 100 ms while it streams
- A running turn resumes after a restart; tools declare whether they are safe to rerun, and an unsafe one reports as interrupted
- Durability covers the running turn only, not a general task system

## Workspaces

- A session works in a workspace: one or more folders, one of them primary
- The TUI uses one folder, the one it started in; the desktop app can build workspaces of several

## Archive

- Sessions have Active and Archived views; archiving is reversible and never deletes history
- Sessions archive automatically after seven days without conversation activity; viewing does not count as activity
- Sending a message in an archived session makes it active; opening it does not
- Manually restoring a session grants a fresh seven-day window without changing its conversation timestamp or order
- Archive and restore actions do not count as conversation activity

## References

- Pi `packages/durable` (`docs/spec.md`) and `docs/session-format.md`
- OpenCode `packages/schema`, `packages/core/src/session`
- Codex `app-server-protocol` v2, `thread-store`
- DeepSeek Harness `packages/session`, `docs/subsystems/session.md`
- Tau `src/session/Entry.ts`, `src/session/Sessions.ts`
- Crush `internal/session`, `internal/message`
