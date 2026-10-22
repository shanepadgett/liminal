/**
 * One state drawn as a terminal of the chosen size, on the palette's base surface, placed by its
 * fill. A fixed size gets a border so its edges show; `fit` takes all the room. A view that throws
 * shows its error instead of closing the gallery.
 */

import type { ScrollBoxRenderable } from "@opentui/core";
import { createSignal, ErrorBoundary, type JSX, onCleanup, Show } from "solid-js";

import type { Fill, State } from "../entries.ts";
import { useTheme } from "../theme/theme.tsx";
import { CHROME } from "./chrome.ts";
import { SIZES, type Size } from "./place.ts";

type SetScroll = (box: ScrollBoxRenderable | undefined) => void;

interface Area {
  readonly columns: number;
  readonly rows: number;
}

/** The border around a fixed size takes a cell on each side. */
const BORDER = 2;

const PLACEMENT: Readonly<Record<Exclude<Fill, "page">, "center" | "stretch">> = {
  center: "center",
  screen: "stretch",
};

function View(props: { readonly state: State }) {
  return (
    <ErrorBoundary
      fallback={(error: Error) => (
        <text fg={CHROME.warm}>{`This state failed: ${error.message}`}</text>
      )}
    >
      {props.state.view()}
    </ErrorBoundary>
  );
}

function Page(props: { readonly state: State; readonly setScroll: SetScroll }) {
  onCleanup(() => {
    props.setScroll(undefined);
  });

  return (
    <scrollbox
      ref={props.setScroll}
      width="100%"
      height="100%"
      scrollbarOptions={{ visible: false }}
    >
      <box padding={1}>
        <View state={props.state} />
      </box>
    </scrollbox>
  );
}

function Placed(props: { readonly state: State; readonly setScroll: SetScroll }) {
  const theme = useTheme();
  const fill = props.state.fill;

  return (
    <box
      width="100%"
      height="100%"
      overflow="hidden"
      backgroundColor={theme().color("surface.base")}
    >
      {fill === "page" ? (
        <Page state={props.state} setScroll={props.setScroll} />
      ) : (
        <box
          width="100%"
          height="100%"
          alignItems={PLACEMENT[fill]}
          justifyContent={fill === "center" ? "center" : "flex-start"}
        >
          <View state={props.state} />
        </box>
      )}
    </box>
  );
}

const areaOf = (size: Size, room: Area): Area =>
  size === SIZES[0]
    ? room
    : {
        columns: Math.max(0, Math.min(size.columns, room.columns - BORDER)),
        rows: Math.max(0, Math.min(size.rows, room.rows - BORDER)),
      };

export function Frame(props: {
  readonly state: State;
  readonly size: Size;
  readonly setScroll: SetScroll;
}) {
  const [room, setRoom] = createSignal<Area>({ columns: 0, rows: 0 });
  const area = () => areaOf(props.size, room());
  const placed = (): JSX.Element => <Placed state={props.state} setScroll={props.setScroll} />;

  return (
    <box
      flexGrow={1}
      alignItems="center"
      justifyContent="center"
      onSizeChange={function () {
        setRoom({ columns: this.width, rows: this.height });
      }}
    >
      {/* OpenTUI draws a border whenever a border color is set, so `fit` gets a plain box. */}
      <Show
        when={props.size !== SIZES[0]}
        fallback={
          <box width={area().columns} height={area().rows}>
            {placed()}
          </box>
        }
      >
        <box
          border
          borderColor={CHROME.rule}
          width={area().columns + BORDER}
          height={area().rows + BORDER}
        >
          {placed()}
        </box>
      </Show>
    </box>
  );
}
