/**
 * Session name's `tui` entry: the session's name in chat's header, once it has one, and no row for
 * `name_session` calls in the transcript.
 */
import { Effect, Layer, Stream } from "effect";
import { Show } from "solid-js";

import { title, type TitleProps, ToolRows, ToolRowView } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
import { Slots, useColor, useWatch } from "@shanepadgett/liminal-tui";

import { nameSessionName, SessionNameRpc } from "../contract.ts";

const namesOf = (session: SessionId) =>
  Stream.unwrap(
    Effect.map(
      Effect.flatMap(Host, (host) => host.client(SessionNameRpc)),
      (client) => client["session-name/name"]({ session }),
    ),
  );

/** The session's latest name; nothing until it has one. */
function Title(props: TitleProps) {
  const color = useColor();
  const name = useWatch(namesOf(props.session), "");

  return (
    <Show when={name() !== ""}>
      <text flexShrink={1} wrapMode="none" fg={color("text.base")}>
        {name()}
      </text>
    </Show>
  );
}

const make = Effect.gen(function* () {
  yield* (yield* ToolRows).add(ToolRowView.Hidden({ tool: nameSessionName }));
  yield* (yield* Slots).fill(title, Title);
});

export default definePlugin({
  name: "session-name-tui",
  provides: [],
  requires: [ToolRows, Slots],
  layer: Layer.effectDiscard(make),
});
