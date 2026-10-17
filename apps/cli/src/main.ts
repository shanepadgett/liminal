#!/usr/bin/env bun
/** Liminal command-line entry point: boots the built-in plugins and prints each one's status. */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Layer, Path, Predicate } from "effect";

import { boot } from "@liminal/kernel";
import { Directories } from "@liminal/sdk";

const directories = Layer.effect(
  Directories,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const global = path.join(process.env["HOME"] ?? ".", ".liminal");

    return {
      global,
      project: path.join(process.cwd(), ".liminal"),
      data: path.join(global, "data"),
    };
  }),
);

const main = Effect.gen(function* () {
  const path = yield* Path.Path;

  const booted = yield* boot({
    folders: [path.resolve(import.meta.dir, "../../../packages/plugins")],
  });

  for (const plugin of booted.status) {
    yield* Console.log(
      Predicate.isTagged(plugin, "Active")
        ? `${plugin.name}: active`
        : `${plugin.name}: ${plugin.reason["_tag"]}`,
    );
  }
});

BunRuntime.runMain(
  main.pipe(
    Effect.scoped,
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the CLI's entry point.
    Effect.provide(directories.pipe(Layer.provideMerge(BunServices.layer))),
  ),
);
