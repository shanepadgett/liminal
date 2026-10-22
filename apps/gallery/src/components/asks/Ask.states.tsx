import type { State } from "../../entries.ts";
import { useColor } from "../../theme/theme.tsx";
import { Ask, Note } from "./Ask.tsx";

function Sample() {
  const color = useColor();

  return (
    <box width={72} paddingX={2}>
      <Ask mark="?" markRole="text.accent" title="An ask's title" aside="1 more waiting">
        <text fg={color("text.base")}>The ask's body sits here, beside the composer's gutter.</text>
        <Note note={undefined} isWriting placeholder="A note field" indent={0} />
      </Ask>
    </box>
  );
}

export const askStates: readonly [State, ...State[]] = [
  { name: "Frame", fill: "center", view: () => <Sample /> },
];
