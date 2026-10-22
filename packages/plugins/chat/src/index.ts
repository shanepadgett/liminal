/** The chat screen: nothing runs in the composition; the `tui` entry draws it. */
import { Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

export default definePlugin({
  name: "chat",
  provides: [],
  requires: [],
  layer: Layer.empty,
  entries: { tui: () => import("./tui/index.tsx") },
});
