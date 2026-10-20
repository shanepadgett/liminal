/** Requests terminal notifications and sound when the on-screen session needs the user. */

import { useRenderer } from "@opentui/solid";
import { Effect, Option, Stream } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiHost, TuiInputWaits } from "@liminal/sdk/tui";

import { chimeWith } from "./tui/chimes.ts";
import { setUpPreferences } from "./tui/preferences.tsx";
import { playerOf } from "./tui/sound.ts";

/** After the other composer lines; draws nothing. */
const LINE_ORDER = 60;

export default defineTui({
  setup: Effect.gen(function* () {
    const player = playerOf(process.platform, (name) => Bun.which(name));

    const host = yield* TuiHost;
    const inputWaits = yield* TuiInputWaits;
    const bridge = yield* makeBridge;
    const { notify } = yield* setUpPreferences(player);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "attention", order: LINE_ORDER },
      function Chimes(props: { readonly sessionId: SessionId }) {
        const renderer = useRenderer();

        bridge.watch(
          chimeWith(props.sessionId, host.follow(props.sessionId), inputWaits.changes, (chime) =>
            notify(renderer, chime),
          ).pipe(Stream.map(Option.some)),
          Option.none(),
        );

        return null;
      },
    );
  }),
});
