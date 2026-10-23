/** The command palette; everything it does is in the `tui` entry. */
import { Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

export default definePlugin({
  name: "palette",
  provides: [],
  requires: [],
  layer: Layer.empty,
  entries: { tui: () => import("./tui/index.tsx") },
});
