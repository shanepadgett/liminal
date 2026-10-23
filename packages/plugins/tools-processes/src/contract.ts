/** The process tools' names and the params `process_start`'s row reads. */
import { Schema } from "effect";

export const processStartName = "process_start";

export const processOutputName = "process_output";

export const processInputName = "process_input";

export const processStopName = "process_stop";

/** The longest a call waits for output, in seconds. */
export const MAX_WAIT = 600;

/** How long a call waits, in seconds. */
export const waitParam = (byDefault: number) =>
  Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_WAIT })).annotate({
      description: `Seconds to wait for output to go quiet. Default ${byDefault}, most ${MAX_WAIT}.`,
    }),
  );

/** How long `process_start` waits when the call leaves `wait` out, in seconds. */
export const START_WAIT = 5;

export const ProcessStartParams = Schema.Struct({
  command: Schema.String.annotate({ description: "The command line bash runs." }),
  description: Schema.String.annotate({
    description:
      'What the process is in 5 to 10 words, such as "Start the web dev server". The user sees it.',
  }),
  wait: waitParam(START_WAIT),
});

export type ProcessStartParams = typeof ProcessStartParams.Type;
