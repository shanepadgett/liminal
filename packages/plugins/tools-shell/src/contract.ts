/** Shell tool: the params of `shell`, which runs one command line in the workspace. */

import { Schema } from "effect";

export const ShellParams = Schema.Struct({
  command: Schema.String.annotate({ description: "Command line run by /bin/sh in the workspace" }),
  timeout: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3600 })).annotate({
      description: "Seconds before the command is stopped; 120 when left out",
    }),
  ),
});
