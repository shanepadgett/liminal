/** Shell tool: the params of `shell`, which runs one command line in the workspace. */

import { Schema } from "effect";

/** The part of a call that names what ran; calls saved before `timeout` was required have it alone. */
export const ShellCommand = Schema.Struct({
  command: Schema.String.annotate({ description: "Command line run by /bin/sh in the workspace" }),
});

export const ShellParams = Schema.Struct({
  ...ShellCommand.fields,
  timeout: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3600 })).annotate({
    description:
      "Seconds before the command is stopped; about 30 for a quick command, 300 for a build or a test run",
  }),
});
