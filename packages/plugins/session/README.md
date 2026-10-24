# @shanepadgett/liminal-session

The session log: each session's events in order, saved through `SqlClient`, and deltas streamed live without saving.

- `SessionLog.open(attributes?)`: starts a session in the workspace folder and returns its `SessionId`.
- `SessionLog.list`: the workspace folder's latest 100 sessions with a user message, newest first, as `SessionSummary`: the id, the latest `session/name` or else the first line of the first user message as title, and the time of the latest event.
- `SessionLog.append(session, events)`: saves events, all or none, numbering them with `seq`.
- `SessionLog.read(session, after?)`: every saved event after a seq.
- `SessionLog.page(session, before?)`: the latest 100 events, or the 100 before a seq.
- `SessionLog.latest(kind)`: the newest event of a kind in any session, or none.
- `SessionLog.live(session, after?)`: saved events after a seq, the deltas since the last append, then each new event and delta. Covers writes made in the same process.
- `SessionLog.publish(session, delta)`: streams a delta to `live` viewers.
- `defineEvent(kind, schema)`: an event or delta kind, with `make`, `decode`, and `decodeOption`, which gives none for data its schema rejects.
- `MessageEvent`: the `session/message` kind, holding `model`'s `Message`.
- `Notice`: the `session/notice` kind, a message for the user that the model never sees.
- `SessionNamed`: the `session/name` kind, the session's name, which `list` shows over the first message.
- `SessionRpc`: the RPC group screens call: `session/open`, `session/list`, `session/page` for `page`, and `session/live` streaming `live`.

Requires `SqlClient` and `Directories`. Keeps its tables, `sessions` and `session_events`, in that database.
