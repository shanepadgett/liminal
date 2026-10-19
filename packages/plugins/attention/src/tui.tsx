/**
 * Attention's TUI part: follows the session on screen and plays the notification sound when its
 * turn ends or a workflow waits for input.
 */

import { Effect, Option, Stream } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiHost, TuiInputWaits } from "@liminal/sdk/tui";

import { chimeWith } from "./tui/chimes.ts";
import { playerOf, playWith } from "./tui/sound.ts";

/** After the other composer lines; draws nothing. */
const LINE_ORDER = 60;

export default defineTui({
  setup: Effect.gen(function* () {
    const player = playerOf(process.platform, (name) => Bun.which(name));
    if (Option.isNone(player)) return;

    const host = yield* TuiHost;
    const inputWaits = yield* TuiInputWaits;
    const bridge = yield* makeBridge;
    const play = playWith(player.value);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "attention", order: LINE_ORDER },
      function Chimes(props: { readonly sessionId: SessionId }) {
        bridge.watch(
          chimeWith(props.sessionId, host.follow(props.sessionId), inputWaits.changes, play).pipe(
            Stream.map(Option.some),
          ),
          Option.none(),
        );

        return null;
      },
    );
  }),
});
