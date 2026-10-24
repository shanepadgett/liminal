/** The web tools' `tui` entry: their transcript rows. */
import { Effect, Layer } from "effect";

import { ToolRows, ToolRowView } from "@shanepadgett/liminal-chat/tui";
import { definePlugin } from "@shanepadgett/liminal-core";

import { webfetchName, websearchName } from "../contract.ts";
import { FetchRow } from "./FetchRow.tsx";
import { SearchRow } from "./SearchRow.tsx";

const make = Effect.gen(function* () {
  const rows = yield* ToolRows;
  yield* rows.add(ToolRowView.Shown({ tool: websearchName, component: SearchRow }));
  yield* rows.add(ToolRowView.Shown({ tool: webfetchName, component: FetchRow }));
});

export default definePlugin({
  name: "tools-web-tui",
  provides: [],
  requires: [ToolRows],
  layer: Layer.effectDiscard(make),
});
