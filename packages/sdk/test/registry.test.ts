/** Registries show a caller only the registrations of the builds in the graph it holds. */

import { describe, expect } from "bun:test";

import { Effect, Option, Stream } from "effect";

import { HeldBuilds, KeyedRegistry, RegisteringBuild } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";

interface Named {
  readonly name: string;
  readonly build: number;
}

class Kinds extends KeyedRegistry.Service<Kinds, Named>()("test/Kinds") {}

/** Registers `item` as build `build` would while its layer builds. */
const registerAs = (kinds: Kinds["Service"], item: Named) =>
  kinds.register(item).pipe(Effect.provideService(RegisteringBuild, Option.some(item.build)));

/** Runs `effect` as a holder of the graph made of `builds`. */
const holding = <A>(builds: ReadonlyArray<number>, effect: Effect.Effect<A>) =>
  effect.pipe(Effect.provideService(HeldBuilds, Option.some(new Set(builds))));

const kindsLayer = KeyedRegistry.layer(Kinds, (item: Named) => item.name);

describe("keyed registry", () => {
  effectTest(
    "a holder sees its own builds' items, and a caller with no graph sees the newest",
    Effect.gen(function* () {
      const kinds = yield* Kinds;
      yield* registerAs(kinds, { name: "note", build: 1 });
      yield* registerAs(kinds, { name: "note", build: 2 });

      expect(yield* holding([1], kinds.get("note"))).toEqual(
        Option.some({ name: "note", build: 1 }),
      );

      expect(yield* holding([2], kinds.list)).toEqual([{ name: "note", build: 2 }]);
      expect(yield* holding([3], kinds.list)).toEqual([]);
      expect(yield* kinds.get("note")).toEqual(Option.some({ name: "note", build: 2 }));

      const first = yield* holding([1], Stream.runHead(kinds.changes));
      expect(first).toEqual(Option.some([{ name: "note", build: 1 }]));
    }),
    kindsLayer,
  );
});
