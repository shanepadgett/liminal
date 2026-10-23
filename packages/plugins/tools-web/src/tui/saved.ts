/** Finds what a web tool call saved beside its result. */
import { Option, Schema } from "effect";

import type { ToolRowProps } from "@shanepadgett/liminal-chat/tui";
import type { EventKind } from "@shanepadgett/liminal-session/contract";

/** The event of kind `saved` this row's call saved, once there is one. */
export const savedBy = <T extends { readonly callId: string }>(
  props: ToolRowProps,
  saved: EventKind<T>,
): T | undefined => {
  const decode = Schema.decodeOption(saved.schema);

  return props.state.events.flatMap((event) =>
    event.kind === saved.kind
      ? Option.toArray(Option.filter(decode(event.data), ({ callId }) => callId === props.item.id))
      : [],
  )[0];
};
