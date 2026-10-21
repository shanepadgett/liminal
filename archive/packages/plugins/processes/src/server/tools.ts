/**
 * The `process_*` tools: start a command and leave it running, wait on it, read its output, type
 * into it, stop it and list them. Each call reaches the holder through the link.
 */

import { Effect, Match, Option, Schema, type Scope } from "effect";

import { defineTool, Directories, type Tool, ToolFailed } from "@liminal/sdk";

import {
  IdParams,
  ProcessSummary,
  processTools,
  StartParams,
  UnknownProcess,
  WaitParams,
  type WaitResult,
  WriteParams,
} from "../contract.ts";
import type { HolderClient, HolderLink } from "./link.ts";

/** Seconds `process_start` waits for a quick exit when the model sets none. */
const START_WAIT = 1;
const QUIET = 30;
const DEADLINE = 300;

/** `Command p1 (npm run dev) is running.`, or how it ended. */
export const stateLine = (process: ProcessSummary) => {
  const named = `Command ${process.id} (${process.command})`;

  return Match.valueTags(process.state, {
    Running: () => `${named} is running.`,
    Exited: ({ code }) => `${named} exited with code ${code}.`,
    Stopped: () => `${named} was stopped.`,
  });
};

const REASONS: Readonly<Record<WaitResult["reason"], string>> = {
  exited: "",
  stopped: "",
  matched: "A line matched the pattern.",
  quiet: "Its output went quiet.",
  deadline: "The wait reached its deadline.",
};

const outputText = (output: string, tail?: string) => {
  if (output !== "") return `Output since the last read:\n${output}`;
  if (tail === undefined || tail === "") return "No new output.";

  return `No new output. Its last lines:\n${tail}`;
};

/** What the model reads after a start or a wait. */
const waitText = (result: WaitResult) =>
  [stateLine(result.process), REASONS[result.reason], outputText(result.output, result.tail)]
    .filter((part) => part !== "")
    .join("\n");

const encodeSummary = Schema.encodeSync(Schema.toCodecJson(ProcessSummary));

/** The call's text, with the command's summary as details for its row. */
const summarized = (result: string, process: ProcessSummary) => ({
  result,
  details: encodeSummary(process),
});

const waited = (result: WaitResult) => summarized(waitText(result), result.process);

const failed = (error: { readonly message: string }) => new ToolFailed({ message: error.message });

/** Runs `use` on the holder; with no holder running there is no command `id`. */
const onHolder = <A, E extends { readonly message: string }>(
  link: HolderLink,
  id: string,
  use: (client: HolderClient) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.scoped(
    Effect.flatMap(link.connect, (client): Effect.Effect<A, E | UnknownProcess, Scope.Scope> =>
      Option.match(client, { onNone: () => Effect.fail(new UnknownProcess({ id })), onSome: use }),
    ),
  ).pipe(Effect.mapError(failed));

const startTool = (link: HolderLink, workspace: string) =>
  defineTool({
    name: processTools.start,
    description: `Starts a command line with /bin/sh in ${workspace} and leaves it running across turns, for commands that keep running or need input, such as dev servers, watchers and REPLs; \`shell\` runs commands that finish. Waits briefly, then returns its id, its state and its output so far. Stop each command with \`process_stop\` once it is no longer needed. The command starts in ${workspace}, so do not cd into it.`,
    parameters: StartParams,
    offer: "search",
    runAlongside: false,
    safeToRerun: false,
    run: ({ command, pty = false, waitSeconds = START_WAIT }, { sessionId }) =>
      Effect.scoped(
        Effect.flatMap(link.ensure, (client) =>
          client["holder/start"]({ session: sessionId, command, cwd: workspace, pty, waitSeconds }),
        ),
      ).pipe(Effect.mapError(failed), Effect.map(waited)),
  });

const waitTool = (link: HolderLink) =>
  defineTool({
    name: processTools.wait,
    description:
      "Waits on a running command until it exits, a line matches `pattern`, its output goes quiet for `quietSeconds`, or `deadlineSeconds` pass. Returns the output since the last read.",
    parameters: WaitParams,
    offer: "search",
    hints: { readOnlyHint: true },
    runAlongside: true,
    safeToRerun: true,
    run: ({ id, pattern, quietSeconds = QUIET, deadlineSeconds = DEADLINE }, { sessionId }) =>
      onHolder(link, id, (client) =>
        client["holder/wait"]({
          session: sessionId,
          id,
          quietSeconds,
          deadlineSeconds,
          ...Option.match(Option.fromUndefinedOr(pattern), {
            onNone: () => ({}),
            onSome: (text) => ({ pattern: text }),
          }),
        }),
      ).pipe(Effect.map(waited)),
  });

const readTool = (link: HolderLink) =>
  defineTool({
    name: processTools.read,
    description: "Returns a command's state and the output since the last read, without waiting.",
    parameters: IdParams,
    offer: "search",
    hints: { readOnlyHint: true },
    runAlongside: true,
    safeToRerun: false,
    run: ({ id }, { sessionId }) =>
      onHolder(link, id, (client) => client["holder/read"]({ session: sessionId, id })).pipe(
        Effect.map(({ process, output }) =>
          summarized(`${stateLine(process)}\n${outputText(output)}`, process),
        ),
      ),
  });

const writeTool = (link: HolderLink) =>
  defineTool({
    name: processTools.write,
    description:
      "Types text into a running command's input. End a line with \\n to send it; process_wait or process_read shows the answer.",
    parameters: WriteParams,
    offer: "search",
    runAlongside: false,
    safeToRerun: false,
    run: ({ id, text }, { sessionId }) =>
      onHolder(link, id, (client) => client["holder/write"]({ session: sessionId, id, text })).pipe(
        Effect.as({ result: `Typed into ${id}.` }),
      ),
  });

const stopTool = (link: HolderLink) =>
  defineTool({
    name: processTools.stop,
    description: "Stops a command and every process it started.",
    parameters: IdParams,
    offer: "search",
    runAlongside: false,
    safeToRerun: true,
    run: ({ id }, { sessionId }) =>
      onHolder(link, id, (client) => client["holder/stop"]({ session: sessionId, id })).pipe(
        Effect.map((process) => summarized(stateLine(process), process)),
      ),
  });

/** The session's commands, none when no holder runs. */
export const listOf = (link: HolderLink, session: string) =>
  Effect.scoped(
    Effect.flatMap(
      link.connect,
      Option.match({
        onNone: () => Effect.succeed<ReadonlyArray<ProcessSummary>>([]),
        onSome: (client) => client["holder/list"]({ session }),
      }),
    ),
  );

const listTool = (link: HolderLink) =>
  defineTool({
    name: processTools.list,
    description: "Lists this session's commands with their ids and states.",
    parameters: Schema.Struct({}),
    offer: "search",
    hints: { readOnlyHint: true },
    runAlongside: true,
    safeToRerun: true,
    run: (_params, { sessionId }) =>
      listOf(link, sessionId).pipe(
        Effect.mapError(failed),
        Effect.map((processes) => ({
          result:
            processes.length === 0
              ? "This session has no commands."
              : processes.map(stateLine).join("\n"),
        })),
      ),
  });

export const makeTools = Effect.fn("processes.makeTools")(function* (link: HolderLink) {
  const { workspace } = yield* Directories;

  const tools: ReadonlyArray<Tool> = [
    startTool(link, workspace),
    waitTool(link),
    readTool(link),
    writeTool(link),
    stopTool(link),
    listTool(link),
  ];

  return tools;
});
