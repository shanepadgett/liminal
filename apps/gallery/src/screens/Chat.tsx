/**
 * The chat screen's layout: a column with the header on top once the session starts, then the
 * transcript and the composer. The sidebar sits beside the whole column, wider on a large screen;
 * on a small one it is a drawer over the right edge, shown only when opened, that dims the rest and
 * closes on a click outside it. The latest turn's input stays pinned above the transcript while it
 * scrolls. A dialog goes over the top and dims everything behind it. Each part comes in as its own
 * view.
 */

import { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, Show } from "solid-js";

import { useColor } from "../theme/theme.tsx";

/** How much of the screen's darkest color covers what sits behind a dialog or the drawer. */
const SCRIM_OPACITY = 0.6;

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

/** The screen's darkest color, see-through, so what lies under it dims. */
const useScrim = () => {
  const color = useColor();

  return () => {
    const base = RGBA.fromHex(color("surface.base"));

    return RGBA.fromValues(base.r, base.g, base.b, SCRIM_OPACITY);
  };
};

/** The transcript under its pinned input. */
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

/** A dimmed layer over the whole screen: a dialog in its middle, or the drawer on its right. */
function Overlay(props: { readonly kind: "dialog" | "drawer"; readonly children: JSX.Element }) {
  const scrim = useScrim();
  const isDialog = () => props.kind === "dialog";

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor={scrim()}
      alignItems={isDialog() ? "center" : "flex-end"}
      justifyContent={isDialog() ? "center" : "flex-start"}
      zIndex={10}
    >
      {props.children}
    </box>
  );
}

function Drawer(props: { readonly children: JSX.Element }) {
  const color = useColor();

  return (
    <Overlay kind="drawer">
      <box
        width={DRAWER_COLUMNS}
        height="100%"
        paddingTop={1}
        backgroundColor={color("surface.raised")}
      >
        {props.children}
      </box>
    </Overlay>
  );
}

export function Chat(props: {
  readonly header?: JSX.Element;
  /** The latest turn's input, held in place above the transcript. */
  readonly pinned?: JSX.Element;
  readonly transcript: JSX.Element;
  readonly composer: JSX.Element;
  /** Left out before the session starts. */
  readonly sidebar?: JSX.Element | undefined;
  /** Whether the drawer is open, on a screen too small to keep the sidebar beside the column. */
  readonly isSidebarOpen?: boolean;
  readonly dialog?: JSX.Element;
}) {
  const [columns, setColumns] = createSignal(0);
  const place = () => sidebarPlaceOf(columns());

  const docked = () => {
    const now = place();

    return now.kind === "docked" && props.sidebar !== undefined ? now.columns : undefined;
  };

  return (
    <box
      width="100%"
      height="100%"
      paddingTop={1}
      flexDirection="row"
      onSizeChange={function () {
        setColumns(this.width);
      }}
    >
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
        <Drawer>{props.sidebar}</Drawer>
      </Show>
      <Show when={props.dialog}>
        <Overlay kind="dialog">{props.dialog}</Overlay>
      </Show>
    </box>
  );
}
