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
