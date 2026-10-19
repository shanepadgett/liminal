/**
 * Attention's TUI part: follows the session on screen and plays the notification sound when its
 * turn ends or a tool call waits for approval.
 */

import { Effect, Option, Stream } from "effect";

import { ApprovalRpcs } from "@liminal/approval/contract";
import { ChatSlots } from "@liminal/chat/contract";
import type { SessionId } from "@liminal/sdk";
import { defineTui, makeBridge, TuiHost } from "@liminal/sdk/tui";

import { newAsks, turnEnds } from "./tui/chimes.ts";
import { playerOf, playWith } from "./tui/sound.ts";

/** After the other composer lines; draws nothing. */
const LINE_ORDER = 60;

export default defineTui({
  setup: Effect.gen(function* () {
    const player = playerOf(process.platform, (name) => Bun.which(name));
    if (Option.isNone(player)) return;

    const host = yield* TuiHost;
    const approval = yield* host.client(ApprovalRpcs);
    const bridge = yield* makeBridge;
    const play = playWith(player.value);

    yield* host.register(
      ChatSlots.composerLine,
      { id: "attention", order: LINE_ORDER },
      function Chimes(props: { readonly sessionId: SessionId }) {
        bridge.watch(
          Stream.merge(
            turnEnds(host.follow(props.sessionId)),
            newAsks(approval["approval/pending"]({ session: props.sessionId })),
          ).pipe(
            Stream.tap(() => play),
            Stream.map(Option.some),
          ),
          Option.none(),
        );

        return null;
      },
    );
  }),
});
