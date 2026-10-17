/**
 * Starts the kernel over fixture plugins and talks to it as a client over the in-memory socket, so
 * every message is serialized as ndjson.
 */

import { describe, expect } from "bun:test";

import { Effect, FileSystem, Fiber, Path, Schema, Stream } from "effect";
import { RpcClient } from "effect/rpc";

import { ActivePlugin, FeedMissing, InactivePlugin, KernelRpcs, SessionId } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { start } from "../src/index.ts";
import { EchoRpcs, Refused, Said } from "./fixtures/echo.ts";

const echoUrl = import.meta.resolve("./fixtures/echo.ts");

const manifest = (name: string, enabled: boolean) =>
  [
    `import { EchoRpcs } from "${echoUrl}";`,
    "export default {",
    `  name: "${name}",`,
    "  provides: [],",
    "  requires: [],",
    "  uses: [],",
    `  enabledByDefault: ${enabled},`,
    "  rpcs: EchoRpcs,",
    `  server: () => import("${echoUrl}"),`,
    "};",
  ].join("\n");

/** A folder with the `echo` plugin and a disabled copy named `off`. */
const writeFixtures = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-protocol-" });

  for (const [name, enabled] of [
    ["echo", true],
    ["off", false],
  ] as const) {
    const dir = path.join(folder, name);
    yield* fs.makeDirectory(dir);
    yield* fs.writeFileString(path.join(dir, "package.json"), '{ "liminal": ["./plugin.ts"] }');
    yield* fs.writeFileString(path.join(dir, "plugin.ts"), manifest(name, enabled));
  }

  return folder;
});

/** A client of the kernel's and the echo plugin's commands. */
const connected = Effect.gen(function* () {
  const kernel = yield* start({ folders: [yield* writeFixtures] });
  const protocol = yield* kernel.connect;

  return yield* RpcClient.make(KernelRpcs.merge(EchoRpcs)).pipe(
    Effect.provideService(RpcClient.Protocol, protocol),
  );
});

describe("protocol", () => {
  effectTest(
    "a client reads plugin states, calls a plugin command and receives its typed error",
    Effect.gen(function* () {
      const client = yield* connected;

      expect(yield* client["kernel/plugins"]()).toEqual([
        InactivePlugin.make({ name: "off", reason: "disabled by default" }),
        ActivePlugin.make({ name: "echo" }),
      ]);

      expect(yield* client["echo/say"]({ text: "hi" })).toBe("HI");

      const refused = yield* Effect.flip(client["echo/say"]({ text: "" }));
      expect(refused).toBeInstanceOf(Refused);
    }),
    testBaseServices,
  );

  effectTest(
    "a client receives bus events published after it subscribed",
    Effect.gen(function* () {
      const client = yield* connected;

      const events = yield* client["kernel/events"]().pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild,
      );

      // The subscription starts on the server some time after the call; say until it sees one.
      const saying = Effect.forever(
        Effect.andThen(client["echo/say"]({ text: "hi" }), Effect.yieldNow),
      );

      const [event] = yield* Effect.race(Fiber.join(events), saying);

      expect(event?.name).toBe(Said.name);
      expect(yield* Schema.decodeUnknownEffect(Said.data)(event?.data)).toEqual({ text: "hi" });
    }),
    testBaseServices,
  );

  effectTest(
    "following a session with no SessionFeed fails with FeedMissing",
    Effect.gen(function* () {
      const client = yield* connected;

      const error = yield* Effect.flip(
        Stream.runCollect(client["kernel/follow"]({ session: SessionId.make("s1") })),
      );

      expect(error).toBeInstanceOf(FeedMissing);
    }),
    testBaseServices,
  );
});
