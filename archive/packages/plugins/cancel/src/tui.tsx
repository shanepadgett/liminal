/** Cancel's TUI part: while a turn runs, Esc cancels it, and the key hints offer `esc interrupt`. */

import { Effect } from "effect";
import { Show } from "solid-js";

import { ChatSlots, type TurnProps } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { defineTui, Hints, makeBridge, TuiHost, useBindings, useColor } from "@liminal/sdk/tui";

import { CancelRpcs } from "./contract.ts";

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    const bridge = yield* makeBridge;
    const cancel = yield* host.client(CancelRpcs);

    function Interrupt(props: TurnProps & { readonly sessionId: SessionId }) {
      const color = useColor();

      useBindings(() => ({
        commands: [
          {
            name: "cancel.turn",
            run: () => {
              bridge.run(cancel["cancel/turn"]({ session: props.sessionId }));
            },
          },
        ],
        bindings: props.running ? [{ key: "escape", cmd: "cancel.turn" }] : [],
      }));

      return (
        <Show when={props.running}>
          <Hints color={color} hints={[["esc", "interrupt"]]} />
        </Show>
      );
    }

    yield* host.register(ChatSlots.hints, { id: "cancel", order: 10 }, Interrupt);
  }),
});
