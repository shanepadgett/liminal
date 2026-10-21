/** The TUI's root: the theme, the root slot and, over it, the top dialog. */

import { type Accessor, createMemo } from "solid-js";

import type { SlotTree } from "@liminal/frontend";
import { RootSlot } from "@liminal/sdk";
import {
  ColorContext,
  DialogLayer,
  resolveRoles,
  SlotView,
  SlotSourceContext,
  type RoleColor,
  type SolidKind,
  type TuiDialogsService,
  type TuiThemeService,
} from "@liminal/sdk/tui";

import { slotSource } from "./source.ts";

interface AppProps {
  readonly tree: Accessor<SlotTree<SolidKind["component"]>>;
  readonly dialogs: TuiDialogsService;
  readonly theme: TuiThemeService;
}

/** Shows whatever registered into the root slot, under the theme's palette. */
export function App(props: AppProps) {
  const roles = createMemo(() => resolveRoles(props.theme.palette()));
  // One stable function that reads the palette each call, so every color it feeds follows a change.
  const color: RoleColor = (name) => roles()(name);

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
