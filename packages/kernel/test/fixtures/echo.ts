/** A fixture plugin's commands and server, imported by the plugin the protocol test writes. */

import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { defineEvent, EventBus } from "@liminal/sdk";

export class Refused extends Schema.TaggedError<Refused, { readonly brand: unique symbol }>()(
  "Refused",
  { reason: Schema.String },
) {}

export const Said = defineEvent({
  name: "echo/said",
  data: Schema.Struct({ text: Schema.String }),
});

export class EchoRpcs extends RpcGroup.make(
  Rpc.make("echo/say", {
    payload: { text: Schema.String },
    success: Schema.String,
    error: Refused,
  }),
) {}

/** Shouts the text back and publishes `Said`; empty text is Refused. */
export const layer = EchoRpcs.toLayer(
  Effect.gen(function* () {
    const bus = yield* EventBus;

    return EchoRpcs.of({
      "echo/say": ({ text }) =>
        text === ""
          ? Effect.fail(new Refused({ reason: "nothing to say" }))
          : Effect.as(bus.publish(Said, { text }), text.toUpperCase()),
    });
  }),
);
