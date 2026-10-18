/** Pins' TUI part: draws each pin in the chat transcript. */

import { Effect } from "effect";

import { ChatSlots } from "@liminal/chat/contract";
import type { SavedEntry } from "@liminal/sdk";
import { defineTui, TuiHost, useColor } from "@liminal/sdk/tui";

import { PinEntry } from "./contract.ts";

function Pinned(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return <text fg={color("text.muted")}>pinned: {props.entry.text}</text>;
}

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;
    yield* host.register(ChatSlots.entry, { key: PinEntry.kind, meta: {} }, Pinned);
  }),
});
