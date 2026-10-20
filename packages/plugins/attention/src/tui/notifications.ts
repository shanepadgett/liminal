/** Terminal banners and sound share the notification setting, not terminal focus. */

import type { CliRenderer } from "@opentui/core";
import { Effect } from "effect";

import type { Chime } from "./chimes.ts";

/** OpenTUI owns protocol detection, encoding and multiplexer passthrough. */
export const notifyWith = Effect.fn("notifyWith")(function* (
  renderer: Pick<CliRenderer, "triggerNotification">,
  chime: Chime,
  enabled: boolean,
  play: Effect.Effect<void>,
) {
  if (!enabled) return;

  yield* Effect.try(() => {
    renderer.triggerNotification(
      chime === "input-wait" ? "Input needed" : "Response ready",
      "Liminal",
    );
  }).pipe(
    Effect.catch((error) => Effect.logWarning("Could not send a terminal notification.", error)),
  );

  yield* play;
});
