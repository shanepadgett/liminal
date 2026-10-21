/** Pins' contract: the pin entry kind and the service that saves one. */

import { Context, type Effect, Schema } from "effect";

import {
  defineEntry,
  type InvalidEntry,
  type SessionId,
  type SessionNotFound,
  type StoreError,
} from "@liminal/sdk";

/** A note the user pinned to the session; shown in the transcript, never sent to the model. */
export const PinEntry = defineEntry({
  kind: "pins/pin",
  data: Schema.Struct({ text: Schema.String }),
  model: false,
  user: "shown",
});

export class Pins extends Context.Service<
  Pins,
  {
    /** Saves `text` as a pin at the end of the session. */
    readonly pin: (
      session: SessionId,
      text: string,
    ) => Effect.Effect<void, SessionNotFound | InvalidEntry | StoreError>;
  }
>()("acme/pins/Pins") {}
