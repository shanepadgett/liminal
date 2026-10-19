/** Run tool: the params of `run`, which runs a script whose functions are the other tools. */

import { Schema } from "effect";

/** Seconds a script runs when the model sets no timeout. */
export const defaultTimeout = 300;

export const RunParams = Schema.Struct({
  code: Schema.String.annotate({
    description: "JavaScript to run; call tools as `await tools.<name>(params)`",
  }),
  timeout: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3600 })).annotate({
      description: `Seconds before the whole script is stopped; ${defaultTimeout} when left out`,
    }),
  ),
});

export type RunParams = typeof RunParams.Type;
