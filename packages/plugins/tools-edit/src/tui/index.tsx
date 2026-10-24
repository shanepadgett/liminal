/** `edit`'s `tui` entry: its transcript row, with the diff a click opens. */
import { Effect, Layer } from "effect";

import { ToolRows, ToolRowView } from "@shanepadgett/liminal-chat/tui";
import { definePlugin } from "@shanepadgett/liminal-core";

import { editName } from "../contract.ts";
import { EditRow } from "./EditRow.tsx";

const make = Effect.gen(function* () {
  yield* (yield* ToolRows).add(ToolRowView.Shown({ tool: editName, component: EditRow }));
});

export default definePlugin({
  name: "tools-edit-tui",
  provides: [],
  requires: [ToolRows],
  layer: Layer.effectDiscard(make),
});
