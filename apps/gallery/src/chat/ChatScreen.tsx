/**
 * The chat window: header, conversation, composer and key hints in a column, with the session
 * sidebar on the right. When the window leaves the chat enough room the sidebar docks beside it;
 * when it does not, an open sidebar becomes a drawer over the dimmed chat. Fills whatever size it
 * is given, as the terminal would.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, Match, Switch } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { ChatHeader } from "./ChatHeader.tsx";
import { Composer } from "./Composer.tsx";
import { Conversation } from "./Conversation.tsx";
import { GLIDE } from "./scan.ts";
import { Sidebar, SIDEBAR_COLUMNS } from "./Sidebar.tsx";
import { SidebarDrawer } from "./SidebarDrawer.tsx";

/** The narrowest chat column a docked sidebar may leave. */
const MIN_CHAT_COLUMNS = 80;

export function ChatScreen(props: {
  readonly color: RoleColor;
  readonly isWorking: boolean;
  readonly isSidebarOpen: boolean;
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
          isWorking={props.isWorking}
        />
        <scrollbox
          flexGrow={1}
          stickyScroll
          stickyStart="bottom"
          scrollbarOptions={{ visible: false }}
        >
          <Conversation color={props.color} />
        </scrollbox>
        <Composer
          color={props.color}
          model="claude-opus-4"
          thinking="high"
          draft=""
          isWorking={props.isWorking}
          motion={GLIDE}
        />
      </box>
      <Switch>
        <Match when={props.isSidebarOpen && isDocked()}>
          <Sidebar color={props.color} />
        </Match>
        <Match when={props.isSidebarOpen}>
          <SidebarDrawer color={props.color} />
        </Match>
      </Switch>
    </box>
  );
}
