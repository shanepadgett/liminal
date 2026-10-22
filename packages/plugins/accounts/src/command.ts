/** Runs key commands with `sh -c`; each command's output is kept for the process once it succeeds. */
import { Cache, Context, Duration, Effect, Exit, Layer, Redacted, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export class CommandFailed extends Schema.TaggedError<
  CommandFailed,
  { readonly brand: unique symbol }
>()("CommandFailed", { message: Schema.String }) {}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** The key a command prints; one that succeeded is not run again in this process. */
export class KeyCommands extends Context.Service<
  KeyCommands,
  (command: string) => Effect.Effect<Redacted.Redacted, CommandFailed>
>()("accounts/KeyCommands") {}

const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const run = Effect.fn("KeyCommands.run")(
    function* (command: string) {
      const handle = yield* spawner.spawn(
        ChildProcess.make("/bin/sh", ["-c", command], { stdin: "ignore" }),
      );

      const [stdout, stderr, code] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );

      if (code !== 0) {
        return yield* new CommandFailed({
          message: [`The key command exited with ${code}.`, stderr.trim()].join(" ").trim(),
        });
      }

      const key = stdout.trim();

      if (key === "")
        return yield* new CommandFailed({ message: "The key command printed nothing." });

      return Redacted.make(key);
    },
    Effect.scoped,
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(
        new CommandFailed({ message: `The key command could not run: ${error.message}` }),
      ),
    ),
  );

  // A failure is not kept, so the next call runs the command again.
  const cache = yield* Cache.makeWith(run, {
    capacity: 64,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
  });

  return KeyCommands.of((command) => Cache.get(cache, command));
});

export const keyCommandsLayer = Layer.effect(KeyCommands, make);
