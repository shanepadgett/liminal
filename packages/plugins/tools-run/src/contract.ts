/** Run tool: the params of `run`, which runs a script whose functions are the other tools. */

import { Schema } from "effect";

/**
 * The part of a call that holds the script; calls saved before `timeout` was required have it
 * alone.
 */
export const RunScript = Schema.Struct({
  code: Schema.String.annotate({
    description: "JavaScript to run; call tools as `await tools.<name>(params)`",
  }),
});

export const RunParams = Schema.Struct({
  ...RunScript.fields,
  timeout: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3600 })).annotate({
    description:
      "Seconds before the whole script is stopped; about 60 for a quick script, 300 when it runs builds or tests",
  }),
});

export type RunParams = typeof RunParams.Type;
