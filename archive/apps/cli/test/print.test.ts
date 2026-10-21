/**
 * Print mode over the built-in plugins: `--model` picks the scripted model through the launch
 * settings, the prompt runs on a new session, and the turn's last reply or its notices come back.
 */

import { expect } from "bun:test";

import { Context, Effect, Layer, Option, Path } from "effect";

import { start } from "@liminal/kernel";
import {
  ScriptedModel,
  type Script,
  replyText,
  scriptedProvider,
} from "@liminal/model-scripted/contract";
import { LaunchSettings, ModelError, SessionId } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";
import { SessionLog } from "@liminal/session-log/contract";

import { parseModel } from "../src/args.ts";
import { runTurn } from "../src/print.ts";
import { bootOptions } from "./support.ts";

const s1 = SessionId.make("s1");

/** The base services with the scripted model chosen as `--model scripted/scripted` would. */
const launched = Layer.merge(
  testBaseServices,
  Layer.succeed(
    LaunchSettings,
    LaunchSettings.of({
      sections: { "agent-loop": { model: { provider: scriptedProvider, id: "scripted" } } },
    }),
  ),
);

/** Boots the kernel with the model answering with `scripts`, then runs `prompt` on `s1`. */
const printed = Effect.fn("printed")(function* (prompt: string, ...scripts: ReadonlyArray<Script>) {
  const path = yield* Path.Path;

  // The test plugins turn the scripted model on.
  const kernel = yield* start(
    bootOptions(path, { extra: [path.resolve(import.meta.dir, "plugins")] }),
  );

  yield* kernel.use((services) => Context.getUnsafe(services, ScriptedModel).enqueue(...scripts));

  const output = yield* runTurn(kernel.connect, { session: s1, prompt });

  const sessions = yield* kernel.use((services) => Context.getUnsafe(services, SessionLog).list);

  return { output, sessions };
});

effectTest(
  "print mode returns the turn's reply and names the new session after the prompt",
  Effect.gen(function* () {
    const { output, sessions } = yield* printed("say hi\nplease", replyText("hi there"));

    expect(output).toEqual({ reply: ["hi there"], notices: [], end: "answered" });
    expect(sessions.map((session) => [session.id, session.title])).toEqual([[s1, "say hi"]]);
  }),
  launched,
);

effectTest(
  "a turn stopped by an error returns its notice and how it ended",
  Effect.gen(function* () {
    const error = new ModelError({ reason: "auth", message: "bad key" });
    const { output } = yield* printed("hello", [{ type: "fail", error }]);

    expect(output.end).toBe("stopped");
    expect(output.notices.join("\n")).toContain("bad key");
  }),
  launched,
);

effectTest(
  "--model splits at the first slash",
  Effect.sync(() => {
    expect(parseModel("openrouter/anthropic/claude")).toEqual(
      Option.some({ provider: "openrouter", id: "anthropic/claude" }),
    );

    expect(parseModel("gpt")).toEqual(Option.none());
    expect(parseModel("/gpt")).toEqual(Option.none());
    expect(parseModel("openai/")).toEqual(Option.none());
  }),
  Layer.empty,
);
