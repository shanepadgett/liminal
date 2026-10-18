/**
 * A session turn on provider `codex`, replayed: the model reads a real file with the `read` tool,
 * then answers from it.
 */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Path, Ref } from "effect";

import agentLoop from "@liminal/agent-loop";
import { AgentLoop, StepOutcome } from "@liminal/agent-loop/contract";
import context from "@liminal/context";
import { Directories, type Entry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, TextEntry, ToolResultEntry, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settings from "@liminal/settings";
import toolPipeline from "@liminal/tool-pipeline";
import toolRegistry from "@liminal/tool-registry";
import toolsFile from "@liminal/tools-file";

import { codexProvider } from "../src/contract.ts";
import { replay, type SentRequest, sentBody } from "./replay.ts";
import { codexStack, fakeAccessToken, firstMessages, noteText, oauth } from "./support.ts";

const sent = Ref.makeUnsafe<ReadonlyArray<SentRequest>>([]);

const http = replay({ responses: [{ fixture: "tool-call.sse" }, { fixture: "reply.sse" }] }, sent);

const stack = serverOf(agentLoop).pipe(
  Layer.provideMerge(serverOf(toolsFile)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(toolPipeline)),
  Layer.provideMerge(serverOf(toolRegistry)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settings)),
  Layer.provideMerge(codexStack(http, oauth(fakeAccessToken("acc-1"), Number.MAX_SAFE_INTEGER))),
);

const s1 = SessionId.make("s1");

const question = firstMessages[1]?.parts[0];

/** Writes `notes.txt` in the workspace, the parent of the project folder. */
const writeNotes = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspace = path.dirname((yield* Directories).project);

  yield* fs.writeFileString(path.join(workspace, "notes.txt"), noteText);
});

const dataOf = (entries: ReadonlyArray<Entry>, kind: string) =>
  entries.flatMap((entry) => (entry.kind === kind ? [entry.data] : []));

effectTest(
  "a turn reads a workspace file with the read tool and answers from it",
  Effect.gen(function* () {
    yield* writeNotes;

    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage(question?.type === "text" ? question.text : "")]);

    const end = yield* (yield* AgentLoop).run(s1, {
      model: { provider: codexProvider, id: "gpt-5.6-luna" },
      thinking: "high",
    });

    expect(StepOutcome.$is("Answered")(end)).toBe(true);

    const entries = yield* log.read(s1, {});

    expect(dataOf(entries, ToolResultEntry.kind)).toMatchObject([{ name: "read", status: "done" }]);

    expect(JSON.stringify(dataOf(entries, ToolResultEntry.kind))).toContain(noteText);
    expect(JSON.stringify(dataOf(entries, TextEntry.kind).at(-1))).toContain("Thursday");

    const second = yield* sentBody(sent, 1);
    expect(JSON.stringify(second.input)).toContain(noteText);
  }),
  stack,
);
