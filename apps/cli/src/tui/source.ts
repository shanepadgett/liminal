/** Reads the frontend's slot tree as a Solid SlotSource, so `<SlotView>` tracks every change. */

import type { Accessor } from "solid-js";

import { chained, listed, type SlotTree, winner } from "@liminal/frontend";
import type { SlotSource, SolidKind } from "@liminal/sdk/tui";

/** The SlotSource over `tree`; each read tracks the signal. */
export const slotSource = (tree: Accessor<SlotTree<SolidKind["component"]>>): SlotSource => ({
  winner: (slot, cell) => winner(tree(), slot, cell),
  listed: (slot) => listed(tree(), slot),
  chained: (slot) => chained(tree(), slot),
});
