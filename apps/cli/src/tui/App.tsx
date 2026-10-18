/** The TUI's root: the theme, the root slot and, over it, the top dialog. */

import type { Accessor } from "solid-js";

import type { SlotTree } from "@liminal/frontend";
import { RootSlot } from "@liminal/sdk";
import {
  ColorContext,
  DialogLayer,
  PALETTES,
  resolveRoles,
  SlotView,
  SlotSourceContext,
  type SolidKind,
  type TuiDialogsService,
} from "@liminal/sdk/tui";

import { slotSource } from "./source.ts";

interface AppProps {
  readonly tree: Accessor<SlotTree<SolidKind["component"]>>;
  readonly dialogs: TuiDialogsService;
}

/** Shows whatever registered into the root slot, under the first palette. */
export function App(props: AppProps) {
  const color = resolveRoles(PALETTES[0]);

  return (
    <ColorContext.Provider value={color}>
      <SlotSourceContext.Provider value={slotSource(props.tree)}>
        <box flexGrow={1} backgroundColor={color("surface.base")}>
          <SlotView of={RootSlot} props={{}} />
          <DialogLayer dialogs={props.dialogs} />
        </box>
      </SlotSourceContext.Provider>
    </ColorContext.Provider>
  );
}
