/**
 * The chat screen's layout: a column with the header on top once the session starts, then the
 * transcript and the composer, and the sidebar beside the whole column on a wide screen. The latest
 * turn's input stays pinned above the transcript while it scrolls. A dialog goes over the top and
 * dims everything behind it. Each part comes in as its own view.
 */

import { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

import { useColor } from "../theme/theme.tsx";

/** How much of the screen's darkest color covers what sits behind a dialog. */
const SCRIM_OPACITY = 0.6;

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

export function Chat(props: {
  readonly header?: JSX.Element;
  /** The latest turn's input, held in place above the transcript. */
  readonly pinned?: JSX.Element;
  readonly transcript: JSX.Element;
  readonly composer: JSX.Element;
  readonly sidebar?: JSX.Element;
  readonly dialog?: JSX.Element;
}) {
  const scrim = useScrim();

  return (
    <box width="100%" height="100%" paddingTop={1} flexDirection="row">
      <box flexGrow={1} paddingBottom={1} gap={1}>
        {props.header}
        <box flexGrow={1}>
          <Transcript pinned={props.pinned} transcript={props.transcript} />
          {props.composer}
        </box>
      </box>
      {props.sidebar}
      <Show when={props.dialog}>
        <box
          position="absolute"
          top={0}
          left={0}
          width="100%"
          height="100%"
          backgroundColor={scrim()}
          alignItems="center"
          paddingTop={3}
          zIndex={10}
        >
          {props.dialog}
        </box>
      </Show>
    </box>
  );
}
