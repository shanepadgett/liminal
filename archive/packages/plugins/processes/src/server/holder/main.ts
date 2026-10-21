/**
 * The holder program: `bun main.ts <socket>`. It serves the commands of every session until none
 * runs and no server has been connected for a while, then stops.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Duration, Effect } from "effect";

import { serveHolder } from "./serve.ts";

const IDLE = Duration.seconds(10);

const program = Effect.gen(function* () {
  const path = process.argv[2];
  if (path === undefined) return yield* Effect.logError("The holder needs its socket path.");

  return yield* serveHolder(path, IDLE).pipe(
    Effect.scoped,
    Effect.catchTag("AlreadyServing", () => Effect.void),
  );
});

// oxlint-disable-next-line liminal/no-effect-run -- the holder program's entry point.
BunRuntime.runMain(
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the holder program's entry point.
  program.pipe(Effect.provide(BunServices.layer)),
);
