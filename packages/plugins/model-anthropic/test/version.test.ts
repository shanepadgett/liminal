/** The kept Claude Code version: used at once when kept, read when not, read again daily. */

import { expect } from "bun:test";

import { Effect, Exit, FileSystem, Path, Ref } from "effect";
import { TestClock } from "effect/testing";

import { Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { makeClaudeCode } from "../src/server/version.ts";
import { type Sent, stubHttp } from "./support.ts";

/** A registry listing each version in `versions` in turn, then the last again. */
const registry = (sent: Ref.Ref<ReadonlyArray<Sent>>, versions: ReadonlyArray<string>) => {
  let reads = 0;

  return stubHttp(sent, () => {
    const version = versions[Math.min(reads, versions.length - 1)];
    reads += 1;

    return version === undefined ? new Response("", { status: 503 }) : Response.json({ version });
  });
};

const keptFile = Effect.gen(function* () {
  const path = yield* Path.Path;

  return path.join((yield* Directories).data, "claude-code.json");
});

effectTest(
  "uses the kept version without reading npm",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(yield* keptFile, JSON.stringify({ version: "1.0.0", checkedAt: 0 }));
    const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);
    const claudeCode = yield* makeClaudeCode(registry(sent, ["2.0.0"]));

    expect(yield* claudeCode.version).toBe("1.0.0");
    expect(yield* Ref.get(sent)).toEqual([]);
  }).pipe(Effect.scoped),
  testBaseServices,
);

effectTest(
  "reads and keeps the version while none is kept, then reads it again a day later",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);
    const claudeCode = yield* makeClaudeCode(registry(sent, ["2.0.0", "2.1.0"]));

    expect(yield* claudeCode.version).toBe("2.0.0");

    expect((yield* Ref.get(sent)).map((each) => each.url.href)).toEqual([
      "https://registry.npmjs.org/@anthropic-ai/claude-code/latest",
    ]);

    expect(JSON.parse(yield* fs.readFileString(yield* keptFile))).toEqual({
      version: "2.0.0",
      checkedAt: 0,
    });

    yield* TestClock.adjust("24 hours");

    expect(yield* claudeCode.version).toBe("2.1.0");
    expect(yield* Ref.get(sent)).toHaveLength(2);
  }).pipe(Effect.scoped),
  testBaseServices,
);

effectTest(
  "fails as a network error when none is kept and npm cannot be read",
  Effect.gen(function* () {
    const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);
    const claudeCode = yield* makeClaudeCode(registry(sent, []));
    const exit = yield* Effect.exit(claudeCode.version);

    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("network");
  }).pipe(Effect.scoped),
  testBaseServices,
);
