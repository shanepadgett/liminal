/** The TUI's root: the theme, the keymap's quit binding and the root slot. */

import type { Accessor } from "solid-js";

import type { SlotTree } from "@liminal/frontend";
import { RootSlot } from "@liminal/sdk";
import {
  ColorContext,
  PALETTES,
  resolveRoles,
  SlotView,
  SlotSourceContext,
  type SolidKind,
  useBindings,
} from "@liminal/sdk/tui";

import { slotSource } from "./source.ts";

interface AppProps {
  readonly tree: Accessor<SlotTree<SolidKind["component"]>>;
  readonly quit: () => void;
}

/** Shows whatever registered into the root slot, under the first palette. */
export function App(props: AppProps) {
  const color = resolveRoles(PALETTES[0]);

  useBindings(() => ({
    commands: [{ name: "app.quit", run: props.quit }],
    bindings: [{ key: "ctrl+c", cmd: "app.quit" }],
  }));

  return (
    <ColorContext.Provider value={color}>
      <SlotSourceContext.Provider value={slotSource(props.tree)}>
        <box flexGrow={1} backgroundColor={color("surface.base")}>
          <SlotView of={RootSlot} props={{}} />
        </box>
      </SlotSourceContext.Provider>
    </ColorContext.Provider>
  );
}
