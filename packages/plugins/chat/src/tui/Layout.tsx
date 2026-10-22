/**
 * The chat screen's layout: a column with the header on top once the session starts, then the
 * transcript and the composer. The sidebar sits beside the whole column, wider on a large screen;
 * on a small one it is a drawer over the right edge, shown only when opened, that dims the rest and
 * closes on `escape`. The latest turn's input stays pinned above the transcript while it scrolls.
 */

import { useBindings } from "@opentui/keymap/solid";
import { type JSX, useTerminalDimensions } from "@opentui/solid";
import { Show } from "solid-js";

import { kit, useColor } from "@shanepadgett/liminal-tui";

/** Where the sidebar goes at a screen width: beside the column, from the widest step that fits. */
const DOCKED_STEPS = [
  { from: 150, columns: 44 },
  { from: 110, columns: 36 },
] as const;

const DRAWER_COLUMNS = 36;

type SidebarPlace =
  | { readonly kind: "docked"; readonly columns: number }
  | { readonly kind: "drawer" };

const sidebarPlaceOf = (screenColumns: number): SidebarPlace => {
  const step = DOCKED_STEPS.find((each) => screenColumns >= each.from);

  return step === undefined ? { kind: "drawer" } : { kind: "docked", columns: step.columns };
};

/** Where the sidebar goes at the terminal's width now. */
export const useSidebarPlace = () => {
  const screen = useTerminalDimensions();

  return () => sidebarPlaceOf(screen().width);
};

/** The transcript under its pinned input; it opens at the bottom and follows new lines. */
function Transcript(props: { readonly pinned?: JSX.Element; readonly transcript: JSX.Element }) {
  return (
    <box flexGrow={1}>
      <Show when={props.pinned}>
        <box flexShrink={0} paddingX={2} marginBottom={1}>
          {props.pinned}
        </box>
      </Show>
      <scrollbox
        flexGrow={1}
        stickyScroll
        stickyStart="bottom"
        paddingX={2}
        scrollbarOptions={{ visible: false }}
      >
        {props.transcript}
      </scrollbox>
    </box>
  );
}

function Drawer(props: { readonly close: () => void; readonly children: JSX.Element }) {
  const color = useColor();

  // Above the composer's `escape`, which stops a running turn.
  useBindings(() => ({
    priority: 1,
    commands: [{ name: "chat.sidebar.close", title: "Close sidebar", run: props.close }],
    bindings: [{ key: "escape", cmd: "chat.sidebar.close" }],
  }));

  return (
    <kit.Overlay kind="drawer">
      <box
        width={DRAWER_COLUMNS}
        height="100%"
        paddingTop={1}
        backgroundColor={color("surface.raised")}
      >
        {props.children}
      </box>
    </kit.Overlay>
  );
}

export function Layout(props: {
  readonly header?: JSX.Element;
  /** The latest turn's input, held in place above the transcript. */
  readonly pinned?: JSX.Element;
  readonly transcript: JSX.Element;
  readonly composer: JSX.Element;
  /** Left out before the session starts. */
  readonly sidebar?: JSX.Element;
  /** Whether the drawer is open, on a screen too small to keep the sidebar beside the column. */
  readonly isSidebarOpen?: boolean;
  readonly closeSidebar?: () => void;
}) {
  const place = useSidebarPlace();

  const docked = () => {
    const now = place();

    return now.kind === "docked" && props.sidebar !== undefined ? now.columns : undefined;
  };

  return (
    <box width="100%" height="100%" paddingTop={1} flexDirection="row">
      <box flexGrow={1} paddingBottom={1} gap={1}>
        {props.header}
        <box flexGrow={1}>
          <Transcript pinned={props.pinned} transcript={props.transcript} />
          {props.composer}
        </box>
      </box>
      <Show when={docked()}>
        {(width) => (
          <box width={width()} flexShrink={0}>
            {props.sidebar}
          </box>
        )}
      </Show>
      <Show when={place().kind === "drawer" && props.isSidebarOpen === true && props.sidebar}>
        <Drawer
          close={() => {
            props.closeSidebar?.();
          }}
        >
          {props.sidebar}
        </Drawer>
      </Show>
    </box>
  );
}
