/**
 * The checks that send calls to approval: shell commands outside the safe list, and writes and
 * edits outside the workspace. In `full` mode they allow everything.
 */

import { Effect, Option, Path, Schema } from "effect";

import type { WorkspaceFiles } from "@liminal/files/contract";
import type { Tool } from "@liminal/sdk";
import type { ShellSafety } from "@liminal/shell-safety/contract";
import { EditParams, WriteParams } from "@liminal/tools-edit/contract";
import { ShellCommand } from "@liminal/tools-shell/contract";
import { type ToolCall, type ToolCheck, ToolDecision } from "@liminal/tools/contract";

import type { Modes } from "./modes.ts";

/** What the checks read. */
export interface CheckDeps {
  readonly modes: Modes;
  readonly safety: ShellSafety["Service"];
  readonly files: WorkspaceFiles["Service"];
  readonly path: Path.Path;
  readonly workspace: string;
}

const decodeShell = Schema.decodeUnknownOption(ShellCommand);
const decodePath = Schema.decodeUnknownOption(Schema.Union([EditParams, WriteParams]));

/** The command line of a `shell` call, if it is one with valid params. */
export const commandOf = (call: ToolCall) =>
  call.name === "shell"
    ? Option.map(decodeShell(call.params), (params) => params.command)
    : Option.none<string>();

const shellDecision = Effect.fn("approval.shellDecision")(function* (
  deps: CheckDeps,
  command: string,
) {
  const settings = yield* deps.modes.settings;

  if (deps.safety.matchesAny(command, settings.askCommands))
    return ToolDecision.Ask({ reason: "the command matches askCommands" });

  return deps.safety.isSafe(command, settings.safeCommands)
    ? ToolDecision.Allow()
    : ToolDecision.Ask({ reason: "the command is not on the safe list" });
});

const isOutside = (deps: CheckDeps, file: string) => {
  const relative = deps.path.relative(deps.workspace, deps.files.resolve(file));

  return (
    relative === ".." || relative.startsWith(`..${deps.path.sep}`) || deps.path.isAbsolute(relative)
  );
};

/** A write or edit outside the workspace asks; any other call is allowed. */
const fileDecision = (deps: CheckDeps, call: ToolCall) => {
  if (call.name !== "write" && call.name !== "edit") return ToolDecision.Allow();

  return Option.match(decodePath(call.params), {
    onNone: () => ToolDecision.Allow(),
    onSome: ({ path: file }) =>
      isOutside(deps, file)
        ? ToolDecision.Ask({ reason: `it changes ${file}, outside the workspace` })
        : ToolDecision.Allow(),
  });
};

/** The one check approval registers; calls whose params do not decode fail in the tool's run. */
export const approvalCheck =
  (deps: CheckDeps): ToolCheck =>
  (call: ToolCall, _tool: Tool) =>
    Effect.gen(function* () {
      if ((yield* deps.modes.get(call.sessionId)) === "full") return ToolDecision.Allow();

      return yield* Option.match(commandOf(call), {
        onNone: () => Effect.succeed(fileDecision(deps, call)),
        onSome: (command) => shellDecision(deps, command),
      });
    });
