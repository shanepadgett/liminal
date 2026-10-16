/**
 * The sidebar as a drawer: when the window is too narrow to dock it, it slides over the right of
 * the chat on the base surface, and the chat under it is dimmed.
 */

import { RGBA } from "@opentui/core";

import type { RoleColor } from "../tokens/roles.ts";
import { Sidebar } from "./Sidebar.tsx";

/** How dark the dimmed chat under the drawer is, from 0 to 255. */
const DIM_ALPHA = 150;

export function SidebarDrawer(props: { readonly color: RoleColor }) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={1}
      flexDirection="row"
      justifyContent="flex-end"
      backgroundColor={RGBA.fromInts(0, 0, 0, DIM_ALPHA)}
    >
      <box flexDirection="row" height="100%" backgroundColor={props.color("surface.base")}>
        <Sidebar color={props.color} />
      </box>
    </box>
  );
}
