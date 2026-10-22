/** One row of a list: a title with its matched letters, and a detail on the right. */

import { useColor } from "../theme/theme.tsx";
import { MatchedText } from "./MatchedText.tsx";

export function ListRow(props: {
  readonly title: string;
  readonly detail?: string | undefined;
  readonly matches?: readonly number[];
  readonly isSelected: boolean;
}) {
  const color = useColor();

  return (
    <box
      flexDirection="row"
      paddingRight={1}
      backgroundColor={props.isSelected ? color("surface.selected") : "transparent"}
    >
      <text flexShrink={0} fg={color("fill.accent")}>
        {props.isSelected ? "▍" : " "}
      </text>
      <MatchedText
        text={props.title}
        matches={props.matches ?? []}
        role={props.isSelected ? "text.base" : "text.muted"}
      />
      <box flexGrow={1} />
      <text flexShrink={0} fg={color("text.faint")}>
        {props.detail ?? ""}
      </text>
    </box>
  );
}
