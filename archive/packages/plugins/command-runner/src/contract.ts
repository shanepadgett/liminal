/** Command-runner: the replaceable service tools start commands through. */

import { Context, type Duration, type Effect, Schema } from "effect";

/** One command line, run by a shell in `cwd`. */
export interface CommandSpec {
  readonly command: string;
  readonly cwd: string;
  /** The command is stopped once this passes. */
  readonly timeout: Duration.Duration;
  /** Added to the runner's own environment, replacing names it already has. */
  readonly env?: Readonly<Record<string, string>>;
}

/** How a command ended. */
export type CommandEnd =
  | { readonly type: "exited"; readonly code: number }
  | { readonly type: "timed-out" };

/** A command that ran to its end; output is everything it wrote, as text. */
export interface CommandResult {
  readonly end: CommandEnd;
  readonly stdout: string;
  readonly stderr: string;
}

/** The command could not start, such as a missing `cwd`, or a signal ended it. */
export class CommandFailed extends Schema.TaggedError<
  CommandFailed,
  { readonly brand: unique symbol }
>()("CommandFailed", { message: Schema.String, cause: Schema.Defect() }) {}

export class CommandRunner extends Context.Service<
  CommandRunner,
  {
    /** Runs `spec` to its end; interrupting the run stops the command and all it started. */
    readonly run: (spec: CommandSpec) => Effect.Effect<CommandResult, CommandFailed>;
  }
>()("liminal/command-runner/CommandRunner") {}
