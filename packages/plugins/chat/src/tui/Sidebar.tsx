/**
 * The session sidebar: the sections other plugins register, in a column on the right set off by one
 * vertical line. Docked beside the chat when the terminal leaves the chat 80 columns, else a drawer
 * over the dimmed chat. A docked sidebar opens as the user last left it; a drawer starts closed,
 * and escape closes it.
 */

import { RGBA } from "@opentui/core";
import { Schema } from "effect";
import { type Accessor, createSignal, Match, Switch } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { SidebarNote, SlotView, useBindings, useColor } from "@liminal/sdk/tui";

import { ChatSlots } from "../contract.ts";

/** The sidebar's width, its border included. */
export const SIDEBAR_COLUMNS = 42;

/** The narrowest chat a docked sidebar leaves. */
const MIN_CHAT_COLUMNS = 80;

/** Docked takes columns from the chat; a drawer covers part of it. */
export type SidebarMode = "docked" | "drawer";

/** The user's choice for a docked sidebar, kept for the run. */
export const SidebarChoice = Schema.Literals(["open", "closed"]);

export type SidebarChoice = typeof SidebarChoice.Type;

export const modeOf = (columns: number): SidebarMode =>
  columns >= SIDEBAR_COLUMNS + MIN_CHAT_COLUMNS ? "docked" : "drawer";

export interface SidebarState {
  readonly mode: Accessor<SidebarMode>;
  readonly isOpen: Accessor<boolean>;
  readonly toggle: () => void;
  readonly close: () => void;
  /** The terminal's width, which the chat screen reports as it changes. */
  readonly setColumns: (columns: number) => void;
}

/** The sidebar's state; `kept` holds the docked choice across reloads. */
export const makeSidebar = (kept: {
  readonly get: () => SidebarChoice;
  readonly set: (choice: SidebarChoice) => void;
}): SidebarState => {
  const [columns, setColumnsSignal] = createSignal(0);
  const [choice, setChoice] = createSignal(kept.get());
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const mode = () => modeOf(columns());

  const toggle = () => {
    if (mode() === "drawer") {
      setDrawerOpen((open) => !open);

      return;
    }

    const next = choice() === "open" ? "closed" : "open";
    setChoice(next);
    kept.set(next);
  };

  // A drawer left open would cover the chat once the terminal narrows again, so it closes.
  const setColumns = (next: number) => {
    if (modeOf(next) !== mode()) setDrawerOpen(false);

    setColumnsSignal(next);
  };

  return {
    mode,
    isOpen: () => (mode() === "docked" ? choice() === "open" : drawerOpen()),
    toggle,
    close: () => setDrawerOpen(false),
    setColumns,
  };
};

/** The dark wash over the chat under the drawer. */
const SCRIM = RGBA.fromInts(0, 0, 0, 150);

function Panel(props: { readonly sessionId: SessionId; readonly background?: string }) {
  const color = useColor();

  return (
    <box
      width={SIDEBAR_COLUMNS}
      height="100%"
      flexShrink={0}
      flexDirection="column"
      border={["left"]}
      borderColor={color("border.subtle")}
      paddingX={2}
      paddingTop={1}
      gap={1}
      {...(props.background === undefined ? {} : { backgroundColor: props.background })}
    >
      <SlotView
        of={ChatSlots.sidebar}
        props={{ sessionId: props.sessionId }}
        fallback={<SidebarNote text="Nothing to show" />}
      />
    </box>
  );
}

function Drawer(props: { readonly sessionId: SessionId; readonly close: () => void }) {
  const color = useColor();

  // Mounted after the cancel key, so escape closes the drawer before it can cancel a turn.
  useBindings(() => ({
    commands: [{ name: "sidebar.close", run: props.close }],
    bindings: [{ key: "escape", cmd: "sidebar.close" }],
  }));

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
      <Panel sessionId={props.sessionId} background={color("surface.base")} />
    </box>
  );
}

/** The open sidebar, docked or as a drawer; nothing while closed. */
export function Sidebar(props: { readonly sessionId: SessionId; readonly state: SidebarState }) {
  return (
    <Switch>
      <Match when={props.state.isOpen() && props.state.mode() === "docked"}>
        <Panel sessionId={props.sessionId} />
      </Match>
      <Match when={props.state.isOpen()}>
        <Drawer sessionId={props.sessionId} close={props.state.close} />
      </Match>
    </Switch>
  );
}
