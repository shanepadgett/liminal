# Plugins

A plugin is a package that adds one feature to Liminal: a tool, a transcript entry, a turn hook, a model provider. Built-in features are plugins too, so anything they do, your plugin can do or replace. Write a plugin's server part here; its screen part is in [tui.md](tui.md).

## Create a plugin

1. Make a folder with this layout. Built-in plugins live in `packages/plugins/<name>/`.

   ```text
   <name>/
     package.json
     plugin.ts          manifest
     src/contract.ts    what other plugins import
     src/server.ts      exports `layer`
     src/tui.tsx        optional TUI part
     test/
   ```

2. Write `package.json`. `liminal` lists the manifests the host loads; `./contract` is the only other export.

   ```json
   {
     "name": "@liminal/notices",
     "version": "0.1.0",
     "type": "module",
     "exports": { ".": "./plugin.ts", "./contract": "./src/contract.ts" },
     "peerDependencies": {
       "@liminal/sdk": "workspace:*",
       "@liminal/session-log": "workspace:*",
       "effect": "4.0.5"
     },
     "liminal": ["./plugin.ts"]
   }
   ```

3. Write the manifest with `definePlugin` from `@liminal/sdk`.

   ```ts
   export default definePlugin({
     name: "notices",
     provides: [],
     requires: [EntryKinds],
     uses: [],
     enabledByDefault: true,
     server: () => import("./src/server.ts"),
     tui: () => import("./src/tui.tsx"),
   });
   ```

4. Export `layer` from `src/server.ts`. The layer runs in the plugin's scope: anything it registers is removed when the plugin unloads or reloads.

   ```ts
   export const layer = Layer.effectDiscard(
     Effect.flatMap(EntryKinds, (kinds) => kinds.register(NoticeEntry)),
   );
   ```

Rules:

- Name the package `@liminal/<name>` for built-in plugins; outside plugins use any name, such as `@acme/liminal-pins`.
- List other plugins, `@liminal/sdk`, `effect`, `@opentui/*` and `solid-js` as `peerDependencies`. Plugins needed only by tests go in `devDependencies`.
- Keep the package public. Plugin packages are never `"private": true`.
- Load your own files only through `server` and `tui`. No `import()` anywhere else.
- `server` and `tui` never import each other. Shared types go in `src/contract.ts`.
- Plugin packages must not form a cycle: if two plugins need each other, move the shared part into one contract both import.

Example: `packages/plugins/notices/`.

## Choose what to require, provide and use

The manifest's three lists are service tags. The type check fails unless `layer` provides every tag in `provides` and needs nothing outside `requires`, `uses` and the base services.

| List | Meaning |
| --- | --- |
| `provides` | Services this plugin's layer builds, such as `Tools` or `Context` |
| `requires` | Services the plugin cannot run without; with one missing, the plugin stays inactive |
| `uses` | Services read when present, with `Effect.serviceOption(Tag)` |

Every plugin gets these base services without listing them:

| Service | From | Gives |
| --- | --- | --- |
| `FileSystem`, `Path` | `effect` | Files and paths |
| `ChildProcessSpawner` | `effect/process` | Child processes |
| `Crypto` | `effect` | Random bytes and hashes |
| `Directories` | `@liminal/sdk` | `global` (`~/.liminal`), `workspace` (`<cwd>`), `project` (`<cwd>/.liminal`), `data` (`~/.liminal/data`) |
| `ProjectTrust` | `@liminal/sdk` | Whether the user trusts the workspace, and trusting it |
| `EventBus`, `TurnGate`, `Work` | `@liminal/sdk` | Kernel events, the turn gate, and background work |

Examples: `packages/plugins/model-openrouter/plugin.ts` (`uses: [DecisionModels]`), `packages/plugins/model-openrouter/src/server/provider.ts` (`Effect.serviceOption(DecisionModels)`).

## Write the contract

`src/contract.ts` holds everything another plugin needs to call or extend yours: service tags, registries, entry kinds, schemas, errors, RPC groups, and small helpers such as `notice()`.

Rules:

- Import only `effect`, `@liminal/sdk`, and other plugins' contracts. Never import `@liminal/sdk/tui` or `@opentui/*` here or in `plugin.ts`.
- Prefix every string id with the plugin name: entry kinds `notices/notice`, service keys `liminal/tools/Tools`, RPC names `cancel/turn`.
- Expected failures are `Schema.TaggedError` classes, exported so callers can match them.
- A helper another plugin calls to write your entries, such as `notice()`, works with your plugin off, because it only builds a draft.

Example: `packages/plugins/notices/src/contract.ts`.

## Choose an extension point

Plugins extend each other through registries and services that the owning plugin declares in its contract. Register into an existing one before you declare your own.

| Extension point | Owner | Kind | Register |
| --- | --- | --- | --- |
| `Tools` | `tools` | keyed by tool name | A tool the model can call |
| `ToolChecks` | `tools` | ordered | Allow, deny or ask before a call |
| `ToolWrappers` | `tools` | ordered middleware | Code around an allowed call's run |
| `EntryKinds` | `session-log` | keyed by kind | Your entry kinds |
| `PromptSections` | `context` | keyed by key | A part of the system prompt |
| `ViewSteps` | `context` | ordered | Rewrite entries before they become messages |
| `RequestSteps` | `context` | ordered | Rewrite the finished model request |
| `BeforeCallHooks` | `agent-loop` | ordered | Add input or end the turn before a model call |
| `AfterFailureHooks` | `agent-loop` | ordered | Retry or give up after a failed call |
| `TurnEndingHooks` | `agent-loop` | ordered | Continue a turn that would end |
| `ModelProviders` | `models` | keyed by id | A model provider; see [providers.md](providers.md) |
| `LoginMethods` | `logins` | keyed by id | An API key or sign-in flow |

Every registration is scoped: call `register` inside your layer and it lasts until your plugin unloads.

```ts
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const steps = yield* RequestSteps;
    yield* steps.register((_sessionId, request) => Effect.succeed(marksOf(request)), { order: 1000 });
  }),
);
```

Example: `packages/plugins/cache-hints/src/server.ts`.

## Declare an extension point

Declare one when other plugins should add to your feature.

1. Pick the kind. `Registry<A>` from `@liminal/sdk` keeps items sorted by `order`; `KeyedRegistry<A>` keeps one item per name, the newest registration winning. Use a plain `Context.Service` for one implementation, such as `WorkspaceFiles`.
2. Declare the tag in your contract.

   ```ts
   export class Tools extends KeyedRegistry.Service<Tools, Tool>()("liminal/tools/Tools") {}
   export class ViewSteps extends Registry.Service<ViewSteps, ViewStep>()("liminal/context/ViewSteps") {}
   ```

3. Provide the empty registry from your layer and list the tag in `provides`.

   ```ts
   export const layer = KeyedRegistry.layer(Tools, (tool) => tool.spec.name);
   ```

4. Read it where you run: `list` for the current items, `changes` for a stream of them. A caller sees only the registrations of the builds in the graph it holds, so a reloaded plugin's items appear once the reload applies.

Rules:

- For middleware, type items as `Pipeline.Middleware<In, Out, E>` from `@liminal/sdk`; each one wraps the rest of the chain.
- Hooks return a tagged enum answer, such as `BeforeCall.Proceed` or `BeforeCall.EndTurn`, never a boolean.

Examples: `packages/plugins/tools/src/server.ts`, `packages/plugins/context/src/server.ts` (several registries merged with `Layer.provideMerge`), `packages/plugins/tools/src/contract.ts`.

## Save entries in a session

A session is an append-only log of entries. Each entry has a kind your plugin defines, data decoded by its schema, plain text for the user, and optional content for the model.

1. Define the kind in your contract with `defineEntry`.

   ```ts
   export const NoticeEntry = defineEntry({
     kind: "notices/notice",
     data: Notice,
     model: false,
     user: "shown",
   });
   ```

2. Register it with `EntryKinds` in your layer, so reads decode it.
3. Build drafts with `draft(definition, { data, text, model? })` and save them with `SessionLog.append(session, [draft, ...])`. All drafts save or none do.

| Field | Values |
| --- | --- |
| `model` | `true` when entries carry `ModelContent` the model sees |
| `user` | `"shown"`, `"hidden"`, `"debug"` (drawn only while `/debug` is on), or `"per-entry"` when each draft sets `user` |

Rules:

- `data` must encode to JSON, so the entry still reads back with your plugin off.
- Use the core kinds from `@liminal/session-log/contract` instead of new ones when they fit: `UserEntry` (`userMessage(text)`), `TextEntry`, `ReasoningEntry`, `ToolCallEntry`, `ToolResultEntry`, `TurnStartedEntry`, `TurnEndedEntry`.
- To tell the user something happened without the model seeing it, append `notice({ kind, title, body? })` from `@liminal/notices/contract`.
- To draw your kind in the transcript, register a view in the TUI part; see [tui.md](tui.md#draw-an-entry-in-the-transcript).

Other `SessionLog` calls: `read(session, range)`, `subscribe(session, { after })`, `lastOfKinds(kinds)` for each session's newest entry of those kinds.

Examples: `packages/plugins/notices/src/contract.ts`, `packages/plugins/session-log/src/contract.ts`.

## Show live state

Live state is one unsaved value per session that frontends draw while it is set, such as a reply still streaming.

1. Define it in your contract as `{ kind, data }`, with `kind` prefixed by your plugin name.
2. Set it with `SessionLog.setLive(session, { kind, data })`; call `setLive(session)` with no value to clear it.
3. Register a view for the kind in the TUI part; see [tui.md](tui.md#draw-live-state).

Example: `LiveReply` and `LiveRetry` in `packages/plugins/agent-loop/src/contract.ts`, set in `src/server/model-call.ts`.

## Join a turn

A turn is the loop of model calls and tool calls that answers one user message. `agent-loop` runs it and calls three hook registries. Each hook gets the `Turn` (`sessionId`, `settings`).

| Registry | Hook returns | Effect |
| --- | --- | --- |
| `BeforeCallHooks` | `BeforeCall.Proceed({ input })` or `BeforeCall.EndTurn({ reason })` | `input` drafts are saved before the call; `EndTurn` stops later hooks and the turn |
| `AfterFailureHooks` | `AfterFailure.Retry({ after })` or `AfterFailure.GiveUp()` | The first `Retry` wins; `attempt` counts from 1 |
| `TurnEndingHooks` | Drafts | Any draft saved continues the turn |

```ts
yield* (yield* BeforeCallHooks).register((turn) => lock.withPermit(beforeCall(state, turn)), {
  order: hookOrder,
});
```

Rules:

- Read turn starts and ends from the log: `TurnStartedEntry` and `TurnEndedEntry` in `@liminal/session-log/contract`. `TurnEndedEntry`'s `end` is `answered`, `ended-by-plugin`, `cancelled` or `stopped`.
- To start or cancel a turn, call `AgentLoop.start` or `AgentLoop.cancel` from `@liminal/agent-loop/contract`.

Example: `packages/plugins/inbox/src/server.ts`.

## Run work in the background

For work that should not hold up a turn, such as summarizing history with a small model, keep a `FiberMap` keyed by session in the server's scope and start the work with `FiberMap.run(map, sessionId, work, { onlyIfMissing: true })`. A session then runs one at a time, and a reload interrupts it with the server's scope.

- Start the work from a request, a turn or a hook, so it keeps that graph's registrations.
- A fiber forked while your layer builds holds no graph and sees every build's registrations. To read another plugin's registry from it, call `Work.use(tag, f)`, which holds the current graph while `f` runs.
- Catch the work's failures and log them with `Effect.logWarning`; the next start tries again.
- Save each result in one write, so an interrupted run leaves nothing half-written.

Example: `packages/plugins/memory/src/server/before-call.ts`.

## Register a tool

1. Define the parameters as a Schema in your contract. Annotate each field with a description; the model reads it.
2. Build the tool with `defineTool` from `@liminal/sdk`.

   ```ts
   defineTool({
     name: "read",
     description: "Reads a text file. Long files come back in windows of lines.",
     parameters: ReadParams,
     guidance: ["Use `read` to look at a file, not `cat`, `head` or `tail` through a shell."],
     hints: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
     runAlongside: true,
     safeToRerun: true,
     run: ({ path, offset = 1, limit = 2000 }) =>
       fs.readFileString(resolve(path)).pipe(
         Effect.mapError((error) => new ToolFailed({ message: error.message })),
         Effect.map((content) => ({ result: window(content, offset, limit) })),
       ),
   });
   ```

3. Register it in your layer with `(yield* Tools).register(tool)` and add `Tools` to `requires`.

| Field | Meaning |
| --- | --- |
| `hints` | MCP tool hints; permission checks read them. Unset hints take MCP defaults: not read-only, may be destructive, open world |
| `offeredAtStart` | Optional; whether the model sees the tool from the first request |
| `guidance` | Optional rule lines for the system prompt, such as when to prefer this tool; `tools` lists each line once across all tools |
| `runAlongside` | Can run at the same time as other calls in the same step |
| `safeToRerun` | Can run again after a crash without harm |
| `run` | Gets the decoded params and `{ sessionId, callId }`; returns `{ result, details? }` or fails with `ToolFailed` |

Rules:

- `parameters` is a `Schema.Struct`; a tool that takes no params uses `Schema.Struct({})`, sent as an object with no properties.
- `result` is what the model reads. `details` is JSON for the TUI only.
- Fail with `ToolFailed({ message })` for anything the model should see and react to. Never let a tool die.
- To word the call in the transcript, register a tool row in the TUI part; see [tui.md](tui.md#show-a-tool-call).
- To stop a tool without changing the request's cached tool list, keep it listed and register a `ToolChecks` check that denies it; example: `packages/plugins/session-name/src/server/once.ts`.

Example: `packages/plugins/tools-read/`.

## Add a prompt section

A prompt section is one part of the system prompt, such as tool guidance or project instructions. `context` reads every section on each request. The first request saves the system prompt; later changes reach the model as a user-role `<reminder kind="instructions">` message, so the cached prefix stays.

1. Define it with `definePromptSection` from `@liminal/context/contract`.

   | Field | Meaning |
   | --- | --- |
   | `key` | `<plugin>/<name>` |
   | `order` | Base 0, tool guidance 50, environment 100 to 110, instructions 200 to 220, skills 300, others 900 |
   | `codec` | Saves the value to compare with the next read |
   | `read` | Gets `{ sessionId, model }`; returns `{ type: "present", value }`, `{ type: "unavailable" }` to keep the saved value, or `{ type: "removed" }` |
   | `render.initial` | The text for the first request |
   | `render.changed` | The reminder text when the value changes |
   | `render.removed` | Optional; the reminder text when the section goes away |

2. Register it in your layer with `(yield* PromptSections).register(section)`.

- For sections made of files, use `FileTexts` as the codec and `fileTextsRender` as `render`.
- For sections of one line per item, such as rules or paths, use `Lines` as the codec and `linesRender({ initial, added, removed? })` as `render`; each line renders as a `-` bullet and updates send only added and removed lines.

Example: the section tests in `packages/plugins/context/test/context.test.ts`.

## Expose an RPC to frontends

Frontends call the server through RPC groups. A plugin's TUI part reaches only RPCs, never server services.

1. Declare the group in your contract with `RpcGroup.make` and `Rpc.make` from `effect/rpc`.

   ```ts
   export class CancelRpcs extends RpcGroup.make(
     Rpc.make("cancel/turn", {
       payload: { session: SessionId },
       error: Schema.Union([SessionNotFound, InvalidEntry, StoreError]),
     }),
   ) {}
   ```

2. Implement it as your layer.

   ```ts
   export const layer = CancelRpcs.toLayer(
     Effect.gen(function* () {
       const loop = yield* AgentLoop;
       return CancelRpcs.of({ "cancel/turn": ({ session }) => loop.cancel(session) });
     }),
   );
   ```

3. Set `rpcs: CancelRpcs` in the manifest.
4. Call it from the TUI part with `host.client(CancelRpcs)`; see [tui.md](tui.md#call-the-server).

Example: `packages/plugins/cancel/`.

## Read and write settings

Settings are JSONC files: `~/.liminal/settings.json` and, in a trusted project, `<project>/.liminal/settings.json`. Each plugin reads its own section, named after the plugin.

1. Define the section schema in your contract. Make every field optional or give it a default; a missing section decodes from `{}`.
2. Read it with `Settings.section("<plugin>", Schema)` each time you need it, not once at startup, so edits apply without a reload.
3. Write a value with `Settings.write("global" | "project", ["<plugin>", "field"], value)`. Pass no value to remove it. Comments in the file are kept.

Rules:

- Add `Settings` from `@liminal/settings/contract` to `requires`.
- Project settings load only in a trusted project; `Settings.section` already leaves them out otherwise.

Example: `AgentLoopSection` in `packages/plugins/agent-loop/src/contract.ts`, read in `src/server/defaults.ts`.

## Store data on disk

1. Get a path in the data folder (`~/.liminal/data`) with `yield* dataFile(name)` from `@liminal/sdk`, naming the file or folder after your plugin. It makes the data folder when missing.
2. For SQLite, use `SqliteClient.layer({ filename, busyTimeout: 0 })` from `@effect/sql-sqlite-bun`, and wrap queries that can meet a locked database in `whileLocked` from `@liminal/sdk`.
3. Run migrations at startup with `SqliteMigrator.run` and `SqliteMigrator.fromRecord({ "0001_create_tables": ... })`.

Rules:

- Two builds of your plugin can share the database during a reload. Open it through the layer's scope, set `busyTimeout: 0`, and wait on locks with `whileLocked`.
- Until the first release, keep one migration per database and edit it in place.

Examples: `packages/plugins/session-store/src/server/`, `packages/plugins/credential-store/src/server/sqlite-store.ts`.

## See also

- [tui.md](tui.md): the plugin's TUI part.
- [providers.md](providers.md): model providers.
- [packaging.md](packaging.md): plugins loaded from outside the repository.
- [testing.md](testing.md): tests for all of the above.
