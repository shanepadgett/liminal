/**
 * Plugins for graph change tests: `source` reads its value from a file when it builds, `reader`
 * needs `source`, and `steady` needs nothing. Each graph loads its own copy of this module, so a
 * build carries a flag its scope sets on close, for the test to read.
 */

import { Context, Effect, FileSystem, Layer, Path, Ref } from "effect";

import { Directories, TurnGate } from "@liminal/sdk";

/** One build of a plugin; `closed` turns true when the build's scope closes. */
interface Built {
  readonly closed: Ref.Ref<boolean>;
}

/** One build of a plugin that carries a value. */
interface Valued extends Built {
  readonly value: string;
}

export class Source extends Context.Service<Source, Valued>()("fixture/Source") {}

export class Reader extends Context.Service<Reader, Valued>()("fixture/Reader") {}

export class Steady extends Context.Service<
  Steady,
  Built & { readonly hold: TurnGate["Service"]["hold"] }
>()("fixture/Steady") {}

/** A plugin whose value comes from a file in its own package. */
export class Fresh extends Context.Service<Fresh, { readonly value: string }>()("fixture/Fresh") {}

/** A flag set when the build's scope closes. */
const closedFlag = Effect.gen(function* () {
  const closed = yield* Ref.make(false);
  yield* Effect.addFinalizer(() => Ref.set(closed, true));

  return closed;
});

/** The file `source` reads; the text `fail` makes its build fail. */
export const sourceFile = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join((yield* Directories).data, "source.txt");
});

export const sourceLayer = Layer.effect(
  Source,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const value = yield* fs.readFileString(yield* sourceFile);
    if (value === "fail") return yield* Effect.fail("source refused to build");

    return { closed: yield* closedFlag, value };
  }),
);

export const readerLayer = Layer.effect(
  Reader,
  Effect.gen(function* () {
    const source = yield* Source;

    return { closed: yield* closedFlag, value: source.value };
  }),
);

export const steadyLayer = Layer.effect(
  Steady,
  Effect.gen(function* () {
    const gate = yield* TurnGate;

    return { closed: yield* closedFlag, hold: gate.hold };
  }),
);
