/**
 * The chat screen's layout: the header, the transcript and the composer in a column, the sidebar
 * beside them, and a dialog or toast over the top. Each part comes in as its own view.
 */

import type { JSX } from "@opentui/solid";
import { Show } from "solid-js";

export function Chat(props: {
  readonly header: JSX.Element;
  readonly transcript: JSX.Element;
  readonly composer: JSX.Element;
  readonly sidebar?: JSX.Element;
  readonly dialog?: JSX.Element;
  readonly toast?: JSX.Element;
}) {
  return (
    <box width="100%" height="100%" flexDirection="row">
      <box flexGrow={1} paddingBottom={1}>
        {props.header}
        <scrollbox
          flexGrow={1}
          stickyScroll
          stickyStart="bottom"
          paddingX={2}
          paddingTop={1}
          scrollbarOptions={{ visible: false }}
        >
          {props.transcript}
        </scrollbox>
        {props.composer}
      </box>
      {props.sidebar}
      <Show when={props.dialog}>
        <box
          position="absolute"
          width="100%"
          height="100%"
          alignItems="center"
          paddingTop={3}
          zIndex={10}
        >
          {props.dialog}
        </box>
      </Show>
      <Show when={props.toast}>
        <box position="absolute" top={3} right={2} zIndex={20}>
          {props.toast}
        </box>
      </Show>
    </box>
  );
}
