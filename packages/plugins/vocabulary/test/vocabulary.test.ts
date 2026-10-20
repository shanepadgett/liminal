/**
 * Vocabulary: the tool sets, renames, reads and removes terms in `.liminal/vocabulary.json`; the
 * prompt lists their names; an untrusted folder's file is not read or written; a bad file is told
 * once.
 */

import { expect } from "bun:test";

import { Context as EffectContext, Effect, FileSystem, Layer, Path, Predicate } from "effect";

import context from "@liminal/context";
import { Context } from "@liminal/context/contract";
import notices from "@liminal/notices";
import { NoticeEntry } from "@liminal/notices/contract";
import { Directories, ProjectTrust, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import tools from "@liminal/tools";
import { ToolPipeline, Tools } from "@liminal/tools/contract";

import vocabulary from "../plugin.ts";
import { vocabularyTool } from "../src/contract.ts";

const stack = serverOf(vocabulary).pipe(
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(serverOf(notices)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const id = SessionId.make("s1");

/** The tool and the prompt, over a fresh session in a trusted folder unless `trusted` is false. */
const session = Effect.fn("session")(function* (trusted = true) {
  const services = yield* Layer.build(stack);
  const log = EffectContext.get(services, SessionLog);
  const registry = EffectContext.get(services, Tools);
  const pipeline = EffectContext.get(services, ToolPipeline);
  const build = EffectContext.get(services, Context).build;
  const { project } = yield* Directories;
  if (trusted) yield* (yield* ProjectTrust).trust;
  yield* log.create(id);

  let calls = 0;

  const call = (params: Record<string, string>) =>
    Effect.gen(function* () {
      calls += 1;

      return yield* pipeline.run(
        { sessionId: id, callId: `c${calls}`, name: vocabularyTool, params },
        yield* registry.get(vocabularyTool),
      );
    });

  /** The tool's text, whether it finished or failed. */
  const said = (params: Record<string, string>) =>
    Effect.map(call(params), (outcome) => {
      if (outcome.status !== "done") return outcome.message;
      const { result } = outcome.output;

      return Predicate.isString(result) ? result : JSON.stringify(result);
    });

  /** Every text part of a request made now. */
  const prompt = Effect.gen(function* () {
    yield* log.append(id, [userMessage("hello")]);
    const request = yield* build(id, { provider: "scripted", id: "scripted" });

    return request.messages
      .flatMap(({ parts }) => parts.flatMap((part) => (part.type === "text" ? [part.text] : [])))
      .join("\n");
  });

  const notes = Effect.map(log.read(id, {}), (entries) =>
    entries.filter(({ kind }) => kind === NoticeEntry.kind),
  );

  const file = Effect.gen(function* () {
    const path = yield* Path.Path;

    return path.join(project, "vocabulary.json");
  });

  return { call, said, prompt, notes, file };
});

effectTest(
  "a saved term is read back, sorted, and its name is in the prompt but not its definition",
  Effect.gen(function* () {
    const { call, said, prompt } = yield* session();

    expect(
      (yield* call({ op: "set", term: "Prompt", definition: "What the user types" })).status,
    ).toBe("done");

    yield* call({ op: "set", term: "annex", definition: "A plugin's extra folder" });

    expect(yield* said({ op: "get" })).toBe(
      "- annex: A plugin's extra folder\n- Prompt: What the user types",
    );

    expect(yield* said({ op: "get", term: "PROMPT" })).toBe("- Prompt: What the user types");

    const text = yield* prompt;

    expect(text).toContain("- annex\n- Prompt");
    expect(text).not.toContain("What the user types");
  }),
  testBaseServices,
);

effectTest(
  "setting a term again replaces it, `was` renames it, and remove deletes it",
  Effect.gen(function* () {
    const { said } = yield* session();
    yield* said({ op: "set", term: "Dialog", definition: "A popup" });
    yield* said({ op: "set", term: "dialog", definition: "An overlay for picking" });
    expect(yield* said({ op: "get" })).toBe("- dialog: An overlay for picking");

    yield* said({ op: "set", term: "Overlay", definition: "Picks from a list", was: "dialog" });
    expect(yield* said({ op: "get" })).toBe("- Overlay: Picks from a list");

    expect(yield* said({ op: "set", term: "X", definition: "y", was: "missing" })).toContain(
      'no term "missing"',
    );

    expect(yield* said({ op: "remove", term: "overlay" })).toBe("Removed term: overlay");
    expect(yield* said({ op: "get" })).toBe("No terms yet.");
    expect(yield* said({ op: "remove", term: "overlay" })).toContain("no term");
  }),
  testBaseServices,
);

effectTest(
  "set needs a term and a definition",
  Effect.gen(function* () {
    const { said } = yield* session();

    expect(yield* said({ op: "set", term: "Only" })).toContain("needs definition");
    expect(yield* said({ op: "remove" })).toContain("needs term");
  }),
  testBaseServices,
);

effectTest(
  "an untrusted folder's terms are not sent and cannot be changed",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { said, prompt, file } = yield* session(false);
    const path = yield* file;
    yield* fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true });

    yield* fs.writeFileString(
      path,
      JSON.stringify({ terms: [{ term: "Secret", definition: "x" }] }),
    );

    expect(yield* said({ op: "set", term: "A", definition: "b" })).toContain("not trusted");
    expect(yield* prompt).not.toContain("Secret");
  }),
  testBaseServices,
);

effectTest(
  "a file that does not parse fails the tool and is told once",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { said, prompt, notes, file } = yield* session();
    const path = yield* file;
    yield* fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    yield* fs.writeFileString(path, "{ not json");

    expect(yield* said({ op: "get" })).toContain("Could not read");

    yield* prompt;
    yield* prompt;

    const told = yield* notes;

    expect(told).toHaveLength(1);
    expect(told[0]?.text).toContain("vocabulary");
  }),
  testBaseServices,
);
