/** The chat screen's top line: the wordmark, the session title, a working track and the model. */

import { useTimeline } from "@opentui/solid";
import { createSignal, For, Show } from "solid-js";

import { useColor } from "../../theme/theme.tsx";

const TRACK_CELLS = 8;

/** One sweep of the light across the track. */
const SWEEP_MILLISECONDS = 1400;

/** A light that sweeps along a short track while a turn runs. */
function Track() {
  const color = useColor();
  const [light, setLight] = createSignal(0);
  const timeline = useTimeline({ duration: SWEEP_MILLISECONDS, loop: true });

  // The timeline moves `sweep.at` itself; each update copies it into the signal.
  const sweep = { at: 0 };

  timeline.add(sweep, {
    at: TRACK_CELLS - 1,
    duration: SWEEP_MILLISECONDS,
    ease: "inOutSine",
    onUpdate: () => {
      setLight(Math.round(sweep.at));
    },
  });

  return (
    <text flexShrink={0}>
      <For each={Array.from({ length: TRACK_CELLS }, (_, cell) => cell)}>
        {(cell) => (
          <span style={{ fg: color(cell === light() ? "gradient.from" : "border.base") }}>━</span>
        )}
      </For>
    </text>
  );
}

export function Header(props: {
  readonly title: string | undefined;
  readonly model: string;
  readonly isWorking: boolean;
}) {
  const color = useColor();

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      gap={2}
      paddingX={2}
      border={["bottom"]}
      borderColor={color("border.subtle")}
    >
      <text flexShrink={0} fg={color("text.accent")}>
        l i m i n a l
      </text>
      <text
        flexGrow={1}
        wrapMode="none"
        fg={color(props.title === undefined ? "text.faint" : "text.base")}
      >
        {props.title ?? "New session"}
      </text>
      <Show when={props.isWorking}>
        <Track />
      </Show>
      <text flexShrink={0} fg={color("text.muted")}>
        {props.model}
      </text>
    </box>
  );
}
