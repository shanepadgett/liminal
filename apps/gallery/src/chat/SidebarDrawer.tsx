/**
 * The sidebar as a drawer: when the window is too narrow to dock it, it slides over the right of
 * the chat on the base surface, and the chat under it is dimmed.
 */

import type { RoleColor } from "../tokens/roles.ts";
import { SCRIM } from "./scrim.ts";
import { Sidebar } from "./Sidebar.tsx";

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
      backgroundColor={SCRIM}
    >
      <box flexDirection="row" height="100%" backgroundColor={props.color("surface.base")}>
        <Sidebar color={props.color} />
      </box>
    </box>
  );
}
