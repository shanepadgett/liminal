/** The chat screen; everything it does is in the `tui` entry. */
import { Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

export default definePlugin({
  name: "chat",
  provides: [],
  requires: [],
  layer: Layer.empty,
  entries: { tui: () => import("./tui/index.tsx") },
});
