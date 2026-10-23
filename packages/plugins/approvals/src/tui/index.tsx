/** Approvals' `tui` entry: the two asks, drawn in the composer's place while they wait. */
import { Effect, Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { AskViews } from "@shanepadgett/liminal-questions/tui";

import { accessQuestion, callQuestion } from "../contract.ts";
import { AccessAsk } from "./AccessAsk.tsx";
import { CallAsk } from "./CallAsk.tsx";

const make = Effect.gen(function* () {
  const views = yield* AskViews;
  yield* views.add({ kind: callQuestion.kind, component: CallAsk });
  yield* views.add({ kind: accessQuestion.kind, component: AccessAsk });
});

export default definePlugin({
  name: "approvals-tui",
  provides: [],
  requires: [AskViews],
  layer: Layer.effectDiscard(make),
});
