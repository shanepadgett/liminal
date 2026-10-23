# Write a plugin

A plugin is a package whose Effect `Layer` provides services to other plugins. A host builds its plugins with `compose`.

## Create the package

```json
{
  "name": "@shanepadgett/liminal-<name>",
  "type": "module",
  "exports": { ".": "./src/index.ts", "./contract": "./src/contract.ts" },
  "liminal": { "plugins": ["./src/index.ts"] },
  "peerDependencies": { "@shanepadgett/liminal-core": "^0.1.0", "effect": "^4.0.5" }
}
```

- `src/index.ts` default-exports the plugin. `src/contract.ts` holds what other plugins import: service tags, schemas, errors.
- Lay out the rest of `src/` as you like.
- Add a `README.md`: what the plugin provides and requires.
- Liminal packages and `effect` are peer dependencies; the host supplies them.
- Import another plugin only from its `/contract` export.
- A contract imports only `effect`, core and other contracts, and runs no code.
- Leave out `contract.ts` when no other plugin uses yours.

## Declare the plugin

```ts
// contract.ts
export class Greeter extends Context.Service<
  Greeter,
  { readonly greet: (name: string) => Effect.Effect<string> }
>()("greeter/Greeter") {}

// index.ts
export default definePlugin({
  name: "greeter",
  provides: [Greeter],
  requires: [Settings],
  layer: Layer.effect(Greeter, make),
});
```

- Prefix service keys with the plugin's name.
- The layer fails to type-check when it misses a `provides` tag or needs a service outside `requires`.
- A plugin is built only from services other plugins provide. A host composes a plugin of its own that provides Effect's runtime services, such as `Path`, `FileSystem` and `HttpClient` (Effect's `FetchHttpClient.layer` works on every runtime).
- `compose` builds plugins in dependency order. It fails with a `CompositionError` when a service has no provider or two, or plugins require each other in a cycle.

## Add to a list

A `Registry` is a list other plugins add to. An item is removed when the scope that added it closes; the list runs lowest `order` first.

```ts
// the owner's contract and layer
export class Greetings extends Registry.Service<Greetings, string>()("greeter/Greetings") {}
Layer.effect(Greetings, Registry.make<string>());

// another plugin's layer
yield* (yield* Greetings).add("Hello", { order: 10 });
const greetings = yield* (yield* Greetings).list;
```

## Wrap a step

A `Pipeline` is an operation other plugins wrap. A middleware gets the input and `next`; it may change either side or skip `next`. Lower `order` runs outer.

```ts
export class Greet extends Pipeline.Service<Greet, string, string>()("greeter/Greet") {}
Layer.effect(Greet, Pipeline.make((name: string) => Effect.succeed(`Hello, ${name}`)));

yield* (yield* Greet).wrap((name, next) => next(name.toUpperCase()));
const greeting = yield* (yield* Greet).run("sam");
```

## Attach data

An `Attribute` is a typed key for data a plugin puts on records it does not own.

```ts
const Mood = Attribute.make("greeter/Mood", Schema.String);
const attributes = yield* Attribute.set({}, Mood, "cheerful");
const mood = yield* Attribute.get(attributes, Mood); // Option<string>
```

## Replace a plugin

Write a plugin that provides the same service tag, and compose it in place of the original. A composition has one provider per service.

## Declare a setting

A setting is the plugin's top-level key in `settings.json`. Its schema is an object schema; a missing key reads as `{}`, so make its fields optional.

```ts
const GreeterSetting = Setting.make(
  "greeter",
  Schema.Struct({ greeting: Schema.optionalKey(Schema.String) }),
);

yield* (yield* DeclaredSettings).add(GreeterSetting);
const { greeting = "Hello" } = yield* (yield* Settings).get(GreeterSetting);
```

- `Settings.get` reads the files on each call, so a change applies without a restart.
- `Settings.write(scope, path, value)` sets a value in the `"global"` or `"project"` file and keeps its comments.

## Store data

Require `SqlClient.SqlClient` from `effect/sql`. Your plugin owns its tables; name them after it. Run your migrations when the layer builds, with a migrations table of your own.

```ts
const createNames = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE greeter_names (name TEXT NOT NULL)`;
});

yield* Migrator.make({})({
  loader: Migrator.fromRecord({ "0001_create_names": createNames }),
  table: "greeter_migrations",
});
```

## Log to a session

State that must survive a restart is a session event. Define each kind once with `defineEvent`; its schema encodes to JSON.

```ts
const Greeted = defineEvent("greeter/greeted", Schema.Struct({ name: Schema.String }));

const log = yield* SessionLog;
yield* log.append(session, [yield* Greeted.make({ name: "sam" })]);

for (const event of yield* log.read(session)) {
  const greeted = yield* Greeted.decode(event); // none for other kinds
}
```

- `append` numbers the events with `seq` inside the write.
- `publish` streams a delta, such as text as it arrives, to viewers. Nothing saves it. Make one with the same `defineEvent`.
- `live(session, after?)` streams the saved events after `after`, the deltas since the last append, then everything new.
- `MessageEvent` (`session/message`) holds a `Message` the model sees.
- `Notice` is a message for the user that the model never sees.

## Add a tool

`defineTool` from `@shanepadgett/liminal-tools/contract` checks the model's params with your schema before `run` sees them.

```ts
const add = defineTool({
  name: "add",
  description: "Adds two numbers.",
  input: Schema.Struct({ a: Schema.Finite, b: Schema.Finite }),
  run: ({ a, b }) => Effect.succeed({ content: [{ type: "text", text: String(a + b) }] }),
});

yield* (yield* Tools).add(add);
```

- A result's `content` holds text and image parts. The model reads the text as the result; images reach models that take them.
- With `tool-output` composed, text over 2,000 lines or 50 KB is cut to its first and last halves, and the whole text is saved to a file the model can `read`. Page long output yourself, as `read` does, to keep it whole.

- Fail with `ToolFailed` for a failure the model should read; a crash also reaches the model as a failed result.
- Every call goes through the `ToolCall` pipeline; wrap it to see or change each call.
- To change what the model is told about another plugin's tool, wrap `ToolDefinitions` from `@shanepadgett/liminal-tool-definitions/contract`.
- Tools added or removed mid-session reach the model before its next call, in the provider's own form or as a note.
- A `deferred` tool is left out until you offer it in a session with `ToolList.offer(session, names)` from `@shanepadgett/liminal-tool-definitions/contract`, such as from a `BeforeCall` hook; `ToolList.withdraw` takes it away again. A call to a tool the session is not offered fails.
- The `tools` README covers schema choices and the `deferred` and `sequential` marks.

## Ask the user

`defineQuestion` from `@shanepadgett/liminal-questions/contract` makes a kind of question with schemas for what it asks and how it is answered. Its `ask` logs the question for a tool call and waits for the answer.

```ts
const Confirm = defineQuestion(
  "greeter/confirm",
  Schema.Struct({ text: Schema.String }),
  Schema.Struct({ yes: Schema.Boolean }),
);

const { yes } = yield* Confirm.ask({ session: ctx.session, callId: ctx.callId }, { text: "Go on?" });
```

- A cancelled turn interrupts the wait; an answer the schema rejects fails with `AnswerInvalid`.
- In the TUI, add a view for the kind to `AskViews` from `@shanepadgett/liminal-questions/tui`; it takes the composer's place while the question waits. Draw it in the `Ask` frame, and call its `answer` with the JSON answer.

## Add a prompt section

`Sections` from `@shanepadgett/liminal-system-prompt/contract` holds the parts of the system prompt. Lower `order` comes first: `persona` -100, `agents-files` 0, `instruction-files` 10, `environment` 100.

```ts
yield* (yield* Sections).add({ name: "project", text: (session) => readProject(session) }, { order: 20 });
```

- `text` takes the session and returns an `Effect<string>`, run before each model call. Empty text leaves the section out. The session lets a section tell it of a problem with a `Notice`.
- The prompt is logged once. When a section's text changes, the model gets a note with its full new text, so keep text that changes often out of sections.

## Send events to the model

An event kind reaches the model only through a converter. `defineConverter` from `@shanepadgett/liminal-history/contract` reads the event's data with its schema.

```ts
yield* (yield* Converters).add(
  defineConverter(Reminder, ({ text }) => [{ role: "user", parts: [{ type: "text", text }] }]),
);
```

## Join a turn

`BeforeCall` and `TurnEnd` from `@shanepadgett/liminal-loop/contract` hold hooks that take the turn's `session` and `attributes`. A `BeforeCall` hook runs before each model call and logs its own records, such as a reminder with a converter. A `TurnEnd` hook runs when the model answers without tool calls.

```ts
const inbox = yield* Inbox;

yield* (yield* TurnEnd).add((turn) => inbox.send(turn.session, checkResults, "follow-up"));
```

- A follow-up sent from a `TurnEnd` hook continues the turn.
- `Inbox.send` is how any input reaches a session; wrap `Send` to see or change every input.

## Call a model

`Models` from `@shanepadgett/liminal-model/contract` makes one call outside the turn loop. `model` is `small`, the side-call role, or a `provider/model` id.

```ts
const models = yield* Models;
const reply = yield* models.generate({ model: "small", prompt: [{ type: "text", text: "Hi" }] });

const Verdict = Schema.Struct({ approve: Schema.Boolean });
const verdict = yield* models.generateObject({ prompt, schema: Verdict });
```

- With `prefix`, such as `Turns.request(id)`, the call starts from a session's request and shares its cache. The reply is not logged.
- `classify` asks a classifier Effect AI `Decision` questions about an input. Effect AI checks the answers; the call is not retried, so set a deadline with `Effect.timeout`.

```ts
const Triage = Decision.make({
  input: Schema.Struct({ command: Schema.String }),
  decisions: { risky: Decision.probability({ instructions: "The command changes files" }) },
});

const { answers } = yield* models.classify(Triage, { input: { command: "rm -rf build" } });
```

- Every call goes through the `ModelCall` pipeline; wrap it to see or change each request and its deltas.
- A provider adds a `ModelProvider` to `ModelProviders`; see the `model` README.

## Draw in the TUI

A plugin draws in the terminal UI from a `tui` entry: a module that default-exports a plugin of its own, built only when the TUI opens. Point `entries.tui` at it and export it as `./tui`.

```ts
// index.ts
export default definePlugin({ ..., entries: { tui: () => import("./tui.tsx") } });

// tui.tsx
export default definePlugin({
  name: "greeter-tui",
  provides: [],
  requires: [Slots],
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      yield* (yield* Slots).fill(screen, () => <Greeting />);
    }),
  ),
});
```

- `@shanepadgett/liminal-tui` holds the slots, `Dialogs`, the hooks and the UI kit. A fill stays until the layer's scope closes.
- A fill's component returns one element that stays, such as a `<box>` around a `<Switch>`. When the element it returns changes, the slot draws the component again from fresh state.
- In a component, `useColor()` reads the theme's role colors, `useRun()` runs an Effect with `Host` and `Dialogs`, `useWatch` reads a stream as a signal, and `useSessionView` reads a session.
- Reach your plugin's server through `Host` and its RPC group; a `tui` entry imports other plugins only through `/contract`, `/view` and `/tui`.
- Code shared with other frontends goes in `view.ts`, exported as `./view`, with no Solid or OpenTUI imports.
- `@shanepadgett/liminal-chat/tui` holds the chat screen's extension points: `ItemRenderer` for your event kinds, `ToolRows` for your tool's transcript row, `ComposerCovers` for something that takes the composer's place, `Moods` for what Porter murmurs while a turn works, the `sidebar`, `composer` and `status` slots, and `ChatSend` to wrap every send. The `chat` README lists them.
