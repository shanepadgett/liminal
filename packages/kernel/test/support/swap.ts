/**
 * Plugins for graph change tests: `source` reads its value from a file when it builds, `reader`
 * needs `source`, and `steady` needs nothing. Each build gets a new id, recorded when it closes.
 */

import { Context, Effect, FileSystem, Layer, Path } from "effect";

import { Directories } from "@liminal/sdk";

/** One build of a plugin that carries a value. */
interface Valued {
  readonly id: number;
  readonly value: string;
}

export class Source extends Context.Service<Source, Valued>()("fixture/Source") {}

export class Reader extends Context.Service<Reader, Valued>()("fixture/Reader") {}

export class Steady extends Context.Service<Steady, { readonly id: number }>()("fixture/Steady") {}

let made = 0;

/** The ids of the builds that have closed. */
export const closed = new Set<number>();

/** A new build id, recorded in `closed` when the build's scope closes. */
const buildId = Effect.gen(function* () {
  made += 1;
  const id = made;
  yield* Effect.addFinalizer(() => Effect.sync(() => closed.add(id)));

  return id;
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

    return { id: yield* buildId, value };
  }),
);

export const readerLayer = Layer.effect(
  Reader,
  Effect.gen(function* () {
    const source = yield* Source;

    return { id: yield* buildId, value: source.value };
  }),
);

export const steadyLayer = Layer.effect(
  Steady,
  Effect.map(buildId, (id) => ({ id })),
);
