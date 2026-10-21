/** Notices: saved and shown to the user, read back decoded, and never in a model request. */

import { expect } from "bun:test";

import { Effect, Layer } from "effect";

import context from "@liminal/context";
import { Context } from "@liminal/context/contract";
import { SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import notices from "../plugin.ts";
import { notice, NoticeEntry } from "../src/contract.ts";

const stack = serverOf(notices).pipe(
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

effectTest(
  "a notice saves shown to the user with no model content, and the model request leaves it out",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);

    yield* log.append(s1, [
      userMessage("hello"),
      notice({ kind: "warning", title: "Skipped a file", body: "notes.md is too large" }),
    ]);

    const saved = (yield* log.read(s1, {})).at(-1);

    expect(saved?.kind).toBe(NoticeEntry.kind);
    expect(saved?.user).toBe("shown");
    expect(saved?.model).toBeUndefined();
    expect(saved?.text).toBe("Skipped a file\n\nnotes.md is too large");

    expect(saved?.data).toEqual({
      kind: "warning",
      title: "Skipped a file",
      body: "notes.md is too large",
    });

    const request = yield* (yield* Context).preview(s1, { provider: "scripted", id: "scripted" });
    const texts = request.messages.flatMap((message) => message.parts);

    expect(JSON.stringify(texts)).not.toContain("Skipped a file");
    expect(JSON.stringify(texts)).toContain("hello");
  }),
  stack,
);
