/**
 * The chat screen's top line: the spaced wordmark, a run of diagonals and the session's title.
 * While a turn runs, a band of light scans back and forth along the diagonals.
 */

import { Show } from "solid-js";

import { Gradient } from "../../primitives/Gradient.tsx";
import { Hatch } from "../../primitives/Hatch.tsx";
import { useColor } from "../../theme/theme.tsx";

export function Header(props: { readonly title: string | undefined; readonly isWorking: boolean }) {
  const color = useColor();

  return (
    <box flexDirection="row" flexShrink={0} gap={1} paddingX={2}>
      <Gradient text="l i m i n a l" />
      <Hatch isScanning={props.isWorking} />
      <Show when={props.title}>
        {(title) => (
          <text flexShrink={1} wrapMode="none" fg={color("text.base")}>
            {title()}
          </text>
        )}
      </Show>
    </box>
  );
}
