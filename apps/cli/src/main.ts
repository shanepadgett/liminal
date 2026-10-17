#!/usr/bin/env bun
/**
 * Liminal command-line entry point: starts the kernel over the built-in plugins and prints each
 * one's state, read through the protocol.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Layer, Path, Predicate } from "effect";
import { RpcClient } from "effect/rpc";

import { start } from "@liminal/kernel";
import { Directories, KernelRpcs } from "@liminal/sdk";

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

  const kernel = yield* start({
    folders: [path.resolve(import.meta.dir, "../../../packages/plugins")],
  });

  const client = yield* RpcClient.make(KernelRpcs).pipe(
    Effect.provideService(RpcClient.Protocol, yield* kernel.connect),
  );

  for (const plugin of yield* client["kernel/plugins"]()) {
    yield* Console.log(
      Predicate.isTagged(plugin, "Active")
        ? `${plugin.name}: active`
        : `${plugin.name}: ${plugin.reason}`,
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
