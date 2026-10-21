/** What the login dialog shows: the steps the server streamed, then why it failed if it did. */

import { Schema } from "effect";

import type { LoginStep } from "../contract.ts";

/** The login failed; the stream ends after it. */
export const Failed = Schema.TaggedStruct("Failed", { message: Schema.String });

export type Shown = LoginStep | typeof Failed.Type;

/** Every step so far, oldest first. */
export const appendStep = (shown: ReadonlyArray<Shown>, step: Shown): ReadonlyArray<Shown> => [
  ...shown,
  step,
];
