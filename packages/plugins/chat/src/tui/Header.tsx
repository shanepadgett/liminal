/**
 * The chat screen's top line: the spaced wordmark and a run of diagonals. While a turn runs, a band
 * of light scans back and forth along the diagonals.
 */

import { kit } from "@shanepadgett/liminal-tui";

export function Header(props: { readonly isWorking: boolean }) {
  return (
    <box flexDirection="row" flexShrink={0} gap={1} paddingX={2}>
      <kit.Gradient text="l i m i n a l" />
      <kit.Hatch isScanning={props.isWorking} />
    </box>
  );
}
