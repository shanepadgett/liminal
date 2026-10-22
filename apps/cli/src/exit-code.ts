/** How the process ends once the reason is already on screen. */
import { Runtime, Schema } from "effect";

/** Ends the process with `code` and prints nothing more. */
export class ExitCode extends Schema.TaggedError<ExitCode, { readonly brand: unique symbol }>()(
  "ExitCode",
  { code: Schema.Int },
) {
  override readonly [Runtime.errorExitCode] = this.code;
  override readonly [Runtime.errorReported] = false;
}

/** The turn failed or was cancelled, or a sign-in failed. */
export const failed = 1;

/** Bad flags or arguments. */
export const badUsage = 2;

/** Ctrl-C. */
export const interrupted = 130;
