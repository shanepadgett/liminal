/**
 * One state drawn in the preview frame: a terminal of the chosen size on the palette's base
 * surface, with the state placed by its fill. A fixed size gets a border so its edges show. A view
 * that throws shows its error instead of closing the gallery.
 */

import type { ScrollBoxRenderable } from "@opentui/core";
import { ErrorBoundary, onCleanup, Show } from "solid-js";

import { type Palette, resolveRoles } from "@liminal/sdk/tui";

import { CHROME } from "./chrome.ts";
import type { EntryState, Fill } from "./entries.ts";
import type { Area } from "./sizes.ts";

/** Where each fill puts its view inside the frame. */
type Placement = {
  readonly alignItems: "center" | "stretch";
  readonly justifyContent: "center" | "flex-start";
};

const PLACEMENT: Record<Exclude<Fill, "page">, Placement> = {
  width: { alignItems: "stretch", justifyContent: "center" },
  content: { alignItems: "center", justifyContent: "center" },
  screen: { alignItems: "stretch", justifyContent: "flex-start" },
};

function View(props: { readonly state: EntryState; readonly palette: Palette }) {
  return (
    <ErrorBoundary
      fallback={(error: Error) => (
        <text fg={CHROME.warm}>{`This entry failed to render: ${error.message}`}</text>
      )}
    >
      {props.state.view(props.palette)}
    </ErrorBoundary>
  );
}

/** A document on the gallery's own background, scrolled with page up and down. */
function Page(props: {
  readonly state: EntryState;
  readonly palette: Palette;
  readonly setScroll: (box: ScrollBoxRenderable | undefined) => void;
}) {
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
      <View state={props.state} palette={props.palette} />
    </scrollbox>
  );
}

export function Frame(props: {
  readonly state: EntryState;
  readonly palette: Palette;
  readonly area: Area;
  readonly isBordered: boolean;
  readonly setScroll: (box: ScrollBoxRenderable | undefined) => void;
}) {
  const surface = () => resolveRoles(props.palette)("surface.base");

  const placed = () =>
    props.state.fill === "page" ? (
      <Page state={props.state} palette={props.palette} setScroll={props.setScroll} />
    ) : (
      <box
        width="100%"
        height="100%"
        overflow="hidden"
        flexDirection="column"
        backgroundColor={surface()}
        alignItems={PLACEMENT[props.state.fill].alignItems}
        justifyContent={PLACEMENT[props.state.fill].justifyContent}
      >
        <View state={props.state} palette={props.palette} />
      </box>
    );

  // OpenTUI draws a border whenever a border color is set, so the unbordered frame has none.
  return (
    <Show
      when={props.isBordered}
      fallback={
        <box flexShrink={0} width={props.area.columns} height={props.area.rows}>
          {placed()}
        </box>
      }
    >
      <box
        flexShrink={0}
        border
        borderColor={CHROME.rule}
        width={props.area.columns + 2}
        height={props.area.rows + 2}
      >
        {placed()}
      </box>
    </Show>
  );
}
