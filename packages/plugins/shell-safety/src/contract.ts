/** Shell safety: decides whether a shell command line only reads, so it can run without asking. */

import { Context } from "effect";

export class ShellSafety extends Context.Service<
  ShellSafety,
  {
    /**
     * True when every command in `command` only reads: each is on the built-in read-only list or
     * starts with one of the `extra` prefixes, and the line writes nowhere but `/dev/null`. A line
     * that does not parse is never safe.
     */
    readonly isSafe: (command: string, extra: ReadonlyArray<string>) => boolean;
    /**
     * True when any command in `command` starts with one of `prefixes`, matched word by word,
     * wherever it sits: in a pipeline, a background job or a command substitution.
     */
    readonly matchesAny: (command: string, prefixes: ReadonlyArray<string>) => boolean;
  }
>()("liminal/shell-safety/ShellSafety") {}
