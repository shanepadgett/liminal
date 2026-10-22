# @shanepadgett/liminal-client

How a frontend reaches plugins. Each plugin's contract declares an RPC group: the functions its screens may call. `Host.client(Group)` gives a client for one.

- `Host`: the service a frontend asks for clients.
- `inMemory`: a `Host` layer for a frontend in the same process as the plugins. Provide it the composition; each call goes straight to the plugin's handler.

```ts
const host = yield* Host;
const sessions = yield* host.client(SessionRpc);
const loop = yield* host.client(LoopRpc);

const session = yield* sessions["session/open"]();
yield* loop["loop/send"]({ session, input });
```

A client stays open for the caller's scope. Frontend code is the same whatever `Host` layer the app provides.

## Session view

`SessionView.open(session)` follows a session for the caller's scope. It needs `Host`.

```ts
const view = yield* SessionView.open(session);

view.state; // SubscriptionRef<{ events, streaming, running }>
yield* view.loadOlder; // adds the page before the oldest event held
```

- `events`: saved events, oldest first. The view opens with the latest 100, adds each new one, and keeps every page `loadOlder` loads. There is more history while `events[0].seq` is above 1.
- `streaming`: every delta since the last saved event, of any kind, such as the reply being written. A saved event clears it.
- `running`: whether a turn runs, from `loop/state`.

The view knows no event kinds beyond telling saved events from deltas; a screen decodes the kinds it draws. If a stream behind the view fails, the error is logged and the view stops updating.
