# Testing

Plugin tests run under `bun test` with helpers from `@liminal/sdk/testing`. Test the server part by building it over the real plugins it requires, providers over a stub HTTP client, and TUI components in OpenTUI's test renderer. Put tests in the plugin's `test/` folder.

## Run tests

- Run one plugin's tests from the repo root: `bun test packages/plugins/<name>`.
- Run the app's tests from the repo root: `bun test ./apps/cli`. Running from inside `apps/cli` skips the root `bunfig.toml`, which preloads `@opentui/solid/preload`, and TSX tests fail.

## Test a server plugin

1. Build a stack: your plugin's `serverOf(plugin)`, then each plugin it requires, merged down with `Layer.provideMerge`, ending in `testBaseServices`.

   ```ts
   const stack = serverOf(notices).pipe(
     Layer.provideMerge(serverOf(context)),
     Layer.provideMerge(serverOf(toolRegistry)),
     Layer.provideMerge(serverOf(sessionLog)),
     Layer.provideMerge(serverOf(sessionStore)),
     Layer.provideMerge(testBaseServices),
   );
   ```

2. Write each case with `effectTest(name, effect, stack)`. The effect reads services as production code does.

   ```ts
   effectTest(
     "a notice saves shown to the user with no model content",
     Effect.gen(function* () {
       const log = yield* SessionLog;
       yield* log.create(s1);
       yield* log.append(s1, [userMessage("hello"), notice({ kind: "warning", title: "Skipped a file" })]);

       const saved = (yield* log.read(s1, {})).at(-1);
       expect(saved?.user).toBe("shown");
     }),
     stack,
   );
   ```

Rules:

- Prefer real plugins over fakes. Add plugins needed only by tests to `devDependencies`.
- `testBaseServices` gives fresh temporary folders for `Directories`, so `session-store` and `credential-store` write real SQLite files that the test removes.
- `effectTest` runs on the `TestClock`: time stands still until the test moves it with `TestClock.adjust`. Wrap code that must wait on the real clock in `TestClock.withLive`.
- Pass `Layer.empty` when the effect needs no services.
- Test what the user or another plugin sees: saved entries, model requests, RPC results. Not private functions.

Examples: `packages/plugins/notices/test/notices.test.ts`, `packages/plugins/agent-loop/test/agent-loop.test.ts`.

## Fake a required service

- Use `testPlugin(plugin, fakes)` when a real plugin is too heavy. `fakes` is a layer that must cover every tag in `requires`; build one with `Layer.succeed(Tag, Tag.of({ ... }))`.

```ts
const fakeCatalog = Layer.succeed(
  ModelCatalog,
  ModelCatalog.of({ models: () => Effect.succeed([catalogModel]) }),
);
```

Examples: `packages/plugins/models/test/models.test.ts`, `packages/plugins/tools/test/registry.test.ts`.

## Run a turn on the scripted model

`@liminal/model-scripted` registers provider `scripted`, which answers each model call with the next script you give it.

1. Add `serverOf(modelScripted)`, `models`, `model-catalog`, `agent-loop`, `tools`, `context`, `session-log`, `session-store` and `settings` to the stack.
2. Queue the replies with `(yield* ScriptedModel).enqueue(...scripts)`; `repeat(script)` answers every call after the queue runs out.
3. Run the turn with `AgentLoop.run(session, { model: { provider: scriptedProvider, id: "scripted" } })`.
4. Check the saved entries with `SessionLog.read`, and the requests the model got with `ScriptedModel.requests`.

| Script helper | Gives |
| --- | --- |
| `replyText(text)` | A reply of one text part |
| `reply(parts, { reason?, usage? })` | A reply of text, reasoning and tool-call parts |
| `{ type: "fail", error }` | A failed call |
| `{ type: "hang" }` | A call that waits until interrupted |
| `{ type: "gate", gate }` | A call that waits until the test opens a `Latch` |

Example: `packages/plugins/agent-loop/test/agent-loop.test.ts`.

## Test a provider

Build the provider layer over a stub HTTP client and check what it sends and what it streams back.

1. Keep the requests it sends in a `Ref<ReadonlyArray<Sent>>` and stub the client with `stubHttp(sent, (url) => response)`.
2. Write the reply as server-sent events: `dataEvent(json)` for Chat Completions chunks, `event(type, fields)` for named events, `eventStream(events)` for the `Response`.
3. Stack the provider layer over the stub, `logins`, `models`, `credential-store` and `testBaseServices`. Reset the `Ref` when the stack builds.
4. Set the key's environment variable with `Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: { ... } }))`.

```ts
const sent = Ref.makeUnsafe<ReadonlyArray<Sent>>([]);
const stub = Layer.succeed(HttpClient.HttpClient, stubHttp(sent, () => eventStream(replyEvents)));

const stack = Layer.unwrap(
  Effect.as(
    Ref.set(sent, []),
    openRouterLayer.pipe(
      Layer.provideMerge(stub),
      Layer.provideMerge(serverOf(logins)),
      Layer.provideMerge(serverOf(models)),
      Layer.provideMerge(serverOf(credentialStore)),
      Layer.provideMerge(testBaseServices),
    ),
  ),
);
```

Rules:

- Stream through `Models.stream(request)`, so the test covers registration as well as the call.
- Check the URL, the auth header and the body fields you map, such as thinking and cache marks.
- Hand-write the reply events when recording one would spend a key's credit. Recorded replies go in `test/fixtures/`.
- Never put a real key in a test or fixture.

Examples: `packages/plugins/model-openrouter/test/openrouter.test.ts`, `packages/plugins/model-opencode-go/test/opencode-go.test.ts`, `packages/plugins/model-codex/test/replay.ts` (recorded replies).

## Test a TUI part

Draw a component in OpenTUI's test renderer and check the text of the frame.

1. Create the renderer with `createTestRenderer({ width, height })` from `@opentui/core/testing`.
2. Render the component with `render` from `@opentui/solid`, inside a `KeymapProvider` (`createDefaultOpenTuiKeymap(renderer)`) and a `ColorContext.Provider` (`resolveRoles(PALETTES[0])`).
3. Call `renderOnce()`, then read `captureCharFrame()`.
4. Destroy the renderer at the end.

```tsx
const setup = await createTestRenderer({ width: 80, height: 30 });
const keymap = createDefaultOpenTuiKeymap(setup.renderer);

await render(
  () => (
    <KeymapProvider keymap={keymap}>
      <ColorContext.Provider value={resolveRoles(PALETTES[0])}>
        <SelectDialog title="Models" options={options} current="c/2" close={() => {}} onSelect={() => {}} />
      </ColorContext.Provider>
    </KeymapProvider>
  ),
  setup.renderer,
);
await setup.renderOnce();
expect(setup.captureCharFrame()).toContain("GPT 2");
setup.renderer.destroy();
```

Rules:

- Type with `setup.mockInput`: `typeText`, `pressEnter`, `pressEscape`, `pressKey("r", { ctrl: true })`. The keypad's enter is `pressKey("\x1b[57414u")`.
- Click with `setup.mockMouse.click(x, y)`.
- Clipboard writes fail in the test renderer, so copy buttons cannot be tested. Check them by hand.
- Test pure helpers, such as a fold or a text cut, with plain `test` and no renderer.

Examples: `apps/cli/test/select-dialog.test.tsx`, `packages/plugins/reload/test/status.test.ts`, `apps/gallery/test/connect.test.tsx` (`testRender` from `@opentui/solid`).

## Test the whole app

`apps/cli/test/tui.test.tsx` boots the kernel with every built-in plugin and the test plugins in `apps/cli/test/plugins/`, mounts the TUI in the test renderer, and drives it on the scripted model.

- Add a case there when the behavior crosses parts, such as a prompt typed in the composer running a turn.
- Wait for frames with `frameWith(setup, text)`; it polls on the real clock because the kernel's work arrives between frames.

## See also

- [plugins.md](plugins.md): what the server tests cover.
- [tui.md](tui.md): what the TUI tests cover.
- [providers.md](providers.md): providers.
