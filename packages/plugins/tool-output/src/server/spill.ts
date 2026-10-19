/**
 * The spill wrapper: a result or failure message past the limits keeps its first and last halves,
 * with a line naming the private file that holds the whole text.
 */

import { Effect, FileSystem, Option, Path, Schema } from "effect";

import { Directories, type Pipeline } from "@liminal/sdk";
import type { AllowedCall, ToolCall, ToolOutcome } from "@liminal/tools/contract";

import { outputLimits } from "../contract.ts";

const PRIVATE_FOLDER = 0o700;
const PRIVATE_FILE = 0o600;

const halfLines = outputLimits.lines / 2;
const halfCharacters = outputLimits.characters / 2;

const isOver = (text: string, lines: ReadonlyArray<string>) =>
  text.length > outputLimits.characters || lines.length > outputLimits.lines;

/** The first half of the lines, cut to half the characters. */
const headOf = (lines: ReadonlyArray<string>) =>
  lines.slice(0, halfLines).join("\n").slice(0, halfCharacters);

/** The last half of the lines, cut to half the characters from the end. */
const tailOf = (lines: ReadonlyArray<string>) =>
  lines.slice(-halfLines).join("\n").slice(-halfCharacters);

const counted = (count: number, noun: string) => `${count.toLocaleString("en-US")} ${noun}`;

/** `text` cut to its halves around `where`, a line saying where the whole text is. */
export const cutText = (text: string, where: string): string => {
  const lines = text.split("\n");
  const size = `${counted(lines.length, "lines")}, ${counted(text.length, "characters")}`;

  return `${headOf(lines)}\n[Output cut: ${size}. ${where}]\n${tailOf(lines)}`;
};

/** Whether `text` is past the limits. */
export const isLong = (text: string): boolean => isOver(text, text.split("\n"));

const asString = Schema.decodeUnknownOption(Schema.String);

const textOf = (outcome: ToolOutcome): string => {
  if (outcome.status !== "done") return outcome.message;

  const { result } = outcome.output;

  return Option.getOrElse(asString(result), () => JSON.stringify(result, undefined, 2));
};

const withText = (outcome: ToolOutcome, text: string): ToolOutcome =>
  outcome.status === "done"
    ? { status: "done", output: { ...outcome.output, result: text } }
    : { ...outcome, message: text };

export const spillWrapper = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { temp } = yield* Directories;

  /** Writes `text` to the call's private file and returns its path. */
  const save = Effect.fn("ToolOutput.save")(function* (call: ToolCall, text: string) {
    const root = path.join(temp, "tool-output");
    const folder = path.join(root, encodeURIComponent(call.sessionId));
    yield* fs.makeDirectory(folder, { recursive: true, mode: PRIVATE_FOLDER });

    const file = path.join(folder, `${encodeURIComponent(call.callId)}.txt`);
    yield* fs.writeFileString(file, text, { mode: PRIVATE_FILE });

    return file;
  });

  const spill = (call: ToolCall, text: string) =>
    save(call, text).pipe(
      Effect.map((file) => `Full output saved at ${file}; read or search it for the rest.`),
      Effect.catch((error) =>
        Effect.succeed(`The full output could not be saved: ${error.message}`),
      ),
      Effect.map((where) => cutText(text, where)),
    );

  const wrapper: Pipeline.Middleware<AllowedCall, ToolOutcome, never> = ({ call }, next) =>
    Effect.flatMap(next, (outcome) => {
      if (outcome.status === "denied") return Effect.succeed(outcome);

      const text = textOf(outcome);
      if (!isLong(text)) return Effect.succeed(outcome);

      return Effect.map(spill(call, text), (cut) => withText(outcome, cut));
    });

  return wrapper;
});
