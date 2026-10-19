# session-log

Appends, reads and streams a session's entries.

Status: built

## Provides

- `SessionLog` service: create, list, append, read, subscribe, live slot, newest entry of given kinds per session
- `SessionFeed` service: saved entries and the live slot in wire form, for the kernel
- Commands: `session-log/create`, `session-log/list`
- Event: `session-log/sessions-changed`

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
- A turn's start (with its settings) and end (with its reason) are core entries, `session-log/turn-started` and `session-log/turn-ended`; steps are derived from the order of entries
- Each entry saves, when written, the text the model sees and a plain text for the user, so it keeps its place in the transcript and context when its plugin is off
- A plugin that is on may show its entries with a richer display
- An entry carries the plugin's structured data, the model content and the plain user text
- Model content is saved in Liminal's own part types, not a dependency's message format
- A writer passes its own entry definition with each entry; `append` checks the data against that definition
- Reading back decodes with the newest registered definition of a kind
- The store numbers entries inside its own write; `session-log` holds no write lock
- A batch of entries saves in one transaction
- Subscribers are told the newest sequence number and read new entries from the store
- An entry is visible to subscribers only after it is saved
- Subscribing replays the entries after a given sequence number, marks when it has caught up, then sends each entry as it is saved
- Following a session not created yet reads as empty until its first entries are saved
- A subscriber that falls behind reads the missed entries from the store; no entry is skipped
- Live state is a separate feed that delivers only the newest value, and becomes an entry when saved
- Creating a session stamps the `Directories` workspace; listing shows only that workspace's sessions
- The first user message names its session
- A user message keeps its pictures' paths and media types; what its tags attach follows its text for the model

## Open

- An entry kind for usage outside a reply

## References

- Pi `docs/session-format.md`
- Tau `src/session/Entry.ts`
- OpenCode `packages/schema`
- DeepSeek Harness `docs/subsystems/session.md`
- Codex `history/src/lib.rs` (`RolloutItem`)
- Goose `conversation/message.rs`
