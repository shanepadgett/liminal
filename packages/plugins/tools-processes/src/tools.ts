/** The four process tools, over the session's processes. */
import { Effect, Schema } from "effect";

import { defineTool, type Tool, type ToolOutput } from "@shanepadgett/liminal-tools/contract";

import {
  MAX_WAIT,
  ProcessStartParams,
  processInputName,
  processOutputName,
  processStartName,
  processStopName,
  START_WAIT,
  waitParam,
} from "./contract.ts";
import type { Processes } from "./processes.ts";
import { COLUMNS, ROWS } from "./pty.ts";
import { DROPPED } from "./screen.ts";

/** How long `process_input` waits when the call leaves `wait` out, in seconds. */
const INPUT_WAIT = 5;

const Key = Schema.Literals([
  "enter",
  "tab",
  "escape",
  "backspace",
  "up",
  "down",
  "left",
  "right",
  "ctrl+c",
  "ctrl+d",
]);

/** What each key sends to the terminal. */
const KEYS: { readonly [key in typeof Key.Type]: string } = {
  enter: "\r",
  tab: "\t",
  escape: "\u001B",
  backspace: "\u007F",
  up: "\u001B[A",
  down: "\u001B[B",
  right: "\u001B[C",
  left: "\u001B[D",
  "ctrl+c": "\u0003",
  "ctrl+d": "\u0004",
};

const Id = Schema.String.annotate({ description: "The process's id, such as p1." });

const OutputParams = Schema.Struct({ id: Id, wait: waitParam(0) });

const InputParams = Schema.Struct({
  id: Id,
  text: Schema.optionalKey(
    Schema.String.annotate({ description: 'Text to type. A "\\n" in it presses Enter.' }),
  ),
  keys: Schema.optionalKey(
    Schema.Array(Key).annotate({ description: "Keys to press after the text, in order." }),
  ),
  wait: waitParam(INPUT_WAIT),
});

const StopParams = Schema.Struct({ id: Id });

const textOutput = (text: string): ToolOutput => ({ content: [{ type: "text", text }] });

const READS = `The call returns once new output has come and then 1 second passes with none, when the process exits, or after \`wait\` seconds. It returns the output that is new since the last call: lines added at the end, or from the first line a program redrew. A full-screen program returns its whole screen. When more than 5,000 lines came since the last call, the oldest are gone and the result starts with \`${DROPPED}\`. Every result ends with where the process stands, such as \`[p1 running]\` or \`[p1 exited with code 0]\`.`;

const startDescription = `Start a command that keeps running, such as a dev server, a watcher, a REPL or a program that asks for input, and return its id, such as p1, and its first output. For a command that finishes on its own, a tool that runs it in the foreground fits better.

The command runs with \`bash -c\` in the workspace, in a terminal ${COLUMNS} columns wide and ${ROWS} rows high. Pagers are off. Processes keep running between turns and stop when Liminal exits; stop one with \`${processStopName}\` once it is not needed.

${READS} \`wait\` defaults to ${START_WAIT} seconds.`;

/** The tools, each finding its process in the calling session. */
export const processTools = (processes: Processes): ReadonlyArray<Tool> => [
  defineTool({
    name: processStartName,
    description: startDescription,
    input: ProcessStartParams,
    run: (params, context) =>
      processes.start(context.session, params.command).pipe(
        Effect.flatMap((running) => processes.settle(running, params.wait ?? START_WAIT)),
        Effect.map(textOutput),
      ),
  }),
  defineTool({
    name: processOutputName,
    description: `Read what a process started with \`${processStartName}\` printed since the last call. ${READS} \`wait\` defaults to 0, which returns at once; at most ${MAX_WAIT}.`,
    input: OutputParams,
    run: (params, context) =>
      processes.find(context.session, params.id).pipe(
        Effect.flatMap((running) => processes.settle(running, params.wait ?? 0)),
        Effect.map(textOutput),
      ),
  }),
  defineTool({
    name: processInputName,
    description: `Type text, then press keys, in a process started with \`${processStartName}\`, and return what it printed. ${READS} \`wait\` defaults to ${INPUT_WAIT} seconds.`,
    input: InputParams,
    run: (params, context) =>
      Effect.gen(function* () {
        const running = yield* processes.find(context.session, params.id);
        const typed = (params.text ?? "").replaceAll("\n", KEYS.enter);
        const pressed = (params.keys ?? []).map((key) => KEYS[key]).join("");
        yield* running.pty.write(`${typed}${pressed}`);

        return textOutput(yield* processes.settle(running, params.wait ?? INPUT_WAIT));
      }),
  }),
  defineTool({
    name: processStopName,
    description: `Stop a process started with \`${processStartName}\` and everything it started, and return its last output.`,
    input: StopParams,
    run: (params, context) =>
      processes
        .find(context.session, params.id)
        .pipe(Effect.flatMap(processes.stop), Effect.map(textOutput)),
  }),
];
