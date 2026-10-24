/** What the screen shows before the first send: the big wordmark and where to start. */

import { Logo } from "../../primitives/Logo.tsx";
import { useColor } from "../../theme/theme.tsx";

export function Landing() {
  const color = useColor();

  return (
    <box flexShrink={0} gap={1}>
      <Logo />
      <box paddingX={6}>
        <text fg={color("text.muted")}>Ask anything to start.</text>
      </box>
    </box>
  );
}
