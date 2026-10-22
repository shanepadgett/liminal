# @shanepadgett/liminal-session

The session log: each session's events in order, saved through `SqlClient`, and deltas streamed live without saving.

- `SessionLog.open(attributes?)`: starts a session and returns its `SessionId`.
- `SessionLog.append(session, events)`: saves events, all or none, numbering them with `seq`.
- `SessionLog.read(session, after?)`: every saved event after a seq.
- `SessionLog.page(session, before?)`: the latest 100 events, or the 100 before a seq.
- `SessionLog.live(session, after?)`: saved events after a seq, the deltas since the last append, then each new event and delta. Covers writes made in the same process.
- `SessionLog.publish(session, delta)`: streams a delta to `live` viewers.
- `defineEvent(kind, schema)`: an event or delta kind, with `make` and `decode`.
- `MessageEvent`: the `session/message` kind, holding `model`'s `Message`.
- `Notice`: the `session/notice` kind, a message for the user that the model never sees.
- `SessionRpc`: the RPC group screens call: `session/open`, `session/page` for `page`, and `session/live` streaming `live`.

Requires `SqlClient`. Keeps its tables, `sessions` and `session_events`, in that database.
