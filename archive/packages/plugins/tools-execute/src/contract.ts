/** Execute tool: the params of `execute`, which runs a script of calls to the other tools. */

import { Schema } from "effect";

/**
 * The part of a call that holds the script; calls saved before `timeout` was required have it
 * alone.
 */
export const ExecuteScript = Schema.Struct({
  code: Schema.String.annotate({
    description: "JavaScript to execute; call tools as `await tools.<name>(params)`",
  }),
});

export const ExecuteParams = Schema.Struct({
  ...ExecuteScript.fields,
  timeout: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3600 })).annotate({
    description:
      "Seconds before the whole script is stopped; about 60 for a quick script, 300 when it runs builds or tests",
  }),
});

export type ExecuteParams = typeof ExecuteParams.Type;
