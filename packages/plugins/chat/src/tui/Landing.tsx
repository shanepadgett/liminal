/** What the screen shows before the first send: the big wordmark and where to start. */

import { kit, useColor } from "@shanepadgett/liminal-tui";

export function Landing() {
  const color = useColor();

  return (
    <box flexShrink={0} gap={1}>
      <kit.Logo />
      <box paddingX={6}>
        <text fg={color("text.muted")}>Ask anything to start.</text>
      </box>
    </box>
  );
}
