/** `shell`'s params and the progress its row draws while a command runs. */
import { Schema } from "effect";

export const shellName = "shell";

/** The longest a command may run, in seconds. */
export const MAX_TIMEOUT = 3600;

/** How long a command runs when the call leaves `timeout` out, in seconds. */
export const DEFAULT_TIMEOUT = 120;

export const ShellParams = Schema.Struct({
  command: Schema.String.annotate({ description: "The command line bash runs." }),
  description: Schema.String.annotate({
    description:
      'What the command does in 5 to 10 words, such as "List the files changed on this branch". The user sees it.',
  }),
  timeout: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_TIMEOUT })).annotate({
      description: `Seconds before the command is stopped. Default ${DEFAULT_TIMEOUT}, most ${MAX_TIMEOUT}.`,
    }),
  ),
});

export type ShellParams = typeof ShellParams.Type;

/** The last lines a running command wrote. */
export const ShellProgress = Schema.Struct({ tail: Schema.Array(Schema.String) });
