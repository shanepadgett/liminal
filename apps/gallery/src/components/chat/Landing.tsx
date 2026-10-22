/** What an empty session shows: the big wordmark and where to start. */

import { Hints } from "../../primitives/Hints.tsx";
import { Logo } from "../../primitives/Logo.tsx";
import { useColor } from "../../theme/theme.tsx";

export function Landing(props: { readonly version: string }) {
  const color = useColor();

  return (
    <box flexShrink={0} gap={1}>
      <Logo />
      <box flexDirection="row" justifyContent="space-between" paddingX={6}>
        <text fg={color("text.muted")}>Ask anything to start.</text>
        <text fg={color("text.ghost")}>{props.version}</text>
      </box>
      <box paddingX={6}>
        <Hints
          hints={[
            { keys: "/", label: "commands" },
            { keys: "ctrl+p", label: "palette" },
            { keys: "ctrl+o", label: "sessions" },
          ]}
        />
      </box>
    </box>
  );
}
