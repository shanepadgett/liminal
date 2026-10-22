import type { State } from "../entries.ts";
import { useColor } from "../theme/theme.tsx";
import { Section } from "./Section.tsx";

function Body() {
  const color = useColor();

  return <text fg={color("text.muted")}>Sorting out the plugin host</text>;
}

export const sectionStates: readonly [State, ...State[]] = [
  {
    name: "With note",
    fill: "center",
    view: () => (
      <box width={32}>
        <Section title="Session" note="2h ago">
          <Body />
        </Section>
      </box>
    ),
  },
];
