/** Pins' server: registers the pin entry kind and appends pins through the session log. */

import { Effect, Layer } from "effect";

import { draft } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";

import { PinEntry, Pins } from "./contract.ts";

export const layer = Layer.effect(
  Pins,
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* (yield* EntryKinds).register(PinEntry);

    return Pins.of({
      pin: (session, text) =>
        log.append(session, [draft(PinEntry, { data: { text }, text })]).pipe(Effect.asVoid),
    });
  }),
);
