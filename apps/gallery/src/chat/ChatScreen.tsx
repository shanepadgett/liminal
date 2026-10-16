/**
 * The chat window: header, conversation, composer and key hints in a column, with the session
 * sidebar on the right. When the window leaves the chat enough room the sidebar docks beside it;
 * when it does not, an open sidebar becomes a drawer over the dimmed chat. Fills whatever size it
 * is given, as the terminal would. The command palette opens over all of it, and toasts show in the
 * chat column's top right, under the header. While working, one place glides: the header or the
 * composer's top edge.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, Match, Show, Switch } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { FINISHED_SESSION, WORKING_SESSION } from "../transcript/sample.ts";
import { FOLDED } from "../transcript/styles.ts";
import { Transcript } from "../transcript/Transcript.tsx";
import { ChatHeader } from "./ChatHeader.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { Composer } from "./Composer.tsx";
import { Sidebar, SIDEBAR_COLUMNS } from "./Sidebar.tsx";
import { SidebarDrawer } from "./SidebarDrawer.tsx";
import type { ToastMessage } from "./Toast.tsx";
import { ToastCorner } from "./ToastCorner.tsx";

/** Where the working glide plays. Only one place moves at a time. */
export type GlideAt = "header" | "composer";

/** The narrowest chat column a docked sidebar may leave. */
const MIN_CHAT_COLUMNS = 80;

export function ChatScreen(props: {
  readonly color: RoleColor;
  readonly isWorking: boolean;
  readonly glideAt: GlideAt;
  readonly isSidebarOpen: boolean;
  readonly isCommandsOpen: boolean;
  readonly toast?: ToastMessage;
}) {
  const [screen, setScreen] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  const isDocked = () => columns() >= SIDEBAR_COLUMNS + MIN_CHAT_COLUMNS;

  return (
    <box
      ref={setScreen}
      flexDirection="row"
      width="100%"
      height="100%"
      backgroundColor={props.color("surface.base")}
      onSizeChange={() => setColumns(screen()?.width ?? 0)}
    >
      <box flexDirection="column" flexGrow={1}>
        <ChatHeader
          color={props.color}
          title="Explain how the plugin host boots"
          isWorking={props.isWorking && props.glideAt === "header"}
        />
        <box flexGrow={1} minHeight={0}>
          <Transcript
            color={props.color}
            session={props.isWorking ? WORKING_SESSION : FINISHED_SESSION}
            style={FOLDED}
            isWorking={props.isWorking}
            openIds={new Set()}
          />
        </box>
        <Composer
          color={props.color}
          model="claude-opus-4"
          thinking="high"
          draft=""
          isWorking={props.isWorking}
          isGliding={props.isWorking && props.glideAt === "composer"}
          form={undefined}
        />
        <ToastCorner color={props.color} toast={props.toast} />
      </box>
      <Switch>
        <Match when={props.isSidebarOpen && isDocked()}>
          <Sidebar color={props.color} />
        </Match>
        <Match when={props.isSidebarOpen}>
          <SidebarDrawer color={props.color} />
        </Match>
      </Switch>
      <Show when={props.isCommandsOpen}>
        <CommandPalette color={props.color} selected="session.new" />
      </Show>
    </box>
  );
}
