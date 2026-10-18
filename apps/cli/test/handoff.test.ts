/** The handoff file carries kept values to the next process once, then is gone. */

import { expect } from "bun:test";

import { Effect, FileSystem, Path } from "effect";

import { Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { giveHandoff, takeHandoff } from "../src/handoff.ts";

effectTest(
  "a handoff given is taken once; with no file, the handoff is empty",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join((yield* Directories).data, "handoff.json");
    const handoff = { "chat/session": "s1", "inbox/drafts": { s1: "half written" } };

    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* giveHandoff(file, handoff);

    expect(yield* takeHandoff(file)).toEqual(handoff);
    expect(yield* fs.exists(file)).toBe(false);
    expect(yield* takeHandoff(file)).toEqual({});
  }),
  testBaseServices,
);
