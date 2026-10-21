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
- A plugin is built only from services other plugins provide. A host composes a plugin of its own that provides Effect's runtime services, such as `Path` and `FileSystem`.
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
- `Notice` is a message for the user that the model never sees.
