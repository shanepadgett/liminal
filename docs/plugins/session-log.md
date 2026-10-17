# session-log

Appends, reads and streams a session's entries.

Status: planned

## Provides

- `SessionLog` service: append, read, subscribe

## Requires

- `SessionStore`

## Adds

- Entry kinds: user message, assistant text, reasoning, tool call, tool result

## Requirements

- Holds only the minimum mechanism; other plugins add their entry kinds through their contracts
- Entries are immutable and carry timestamps
- Every entry has a sequence number that memories and checkpoints can point at
- Sequence numbers are per session and start at 1; a fork continues from its cut point
- A plugin defines its entry kinds in its contract with `defineEntry`; kind names carry the plugin's name as a prefix
- Entry kinds have no version field before release
- Each kind sets whether the model sees its entries and whether the user sees them shown, hidden or only in debug; a kind may let each entry set the user setting
- Turns and steps are derived from the order of entries; the log stores no boundaries or turn labels
- Each entry saves, when written, the text the model sees and a plain text for the user, so it keeps its place in the transcript and context when its plugin is off
- A plugin that is on may show its entries with a richer display
- An entry carries the plugin's structured data, the model content and the plain user text
- Model content is saved in Liminal's own part types, not a dependency's message format
- One writer per session at a time; a batch of entries saves in one transaction
- Subscribers are told the newest sequence number and read new entries from the store
- An entry is visible to subscribers only after it is saved
- Subscribing replays the entries after a given sequence number, marks when it has caught up, then sends each entry as it is saved
- A subscriber that falls behind reads the missed entries from the store; no entry is skipped
- Live state is a separate feed that delivers only the newest value, and becomes an entry when saved

## Open

- Entry kinds for session metadata such as the title, usage outside a reply, and context edits that hide or replace an earlier entry for the model (Pi `context_edit`)

## References

- Pi `docs/session-format.md`
- Tau `src/session/Entry.ts`
- OpenCode `packages/schema`
- DeepSeek Harness `docs/subsystems/session.md`
- Codex `history/src/lib.rs` (`RolloutItem`)
- Goose `conversation/message.rs`
