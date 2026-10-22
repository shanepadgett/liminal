/**
 * One row of a list: a title with its matched letters, and a detail on the right. The selected row
 * sits on the accent.
 */

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
      paddingX={1}
      backgroundColor={props.isSelected ? color("fill.accent") : "transparent"}
    >
      <MatchedText
        text={props.title}
        matches={props.matches ?? []}
        role={props.isSelected ? "text.inverse" : "text.base"}
        matchRole={props.isSelected ? "text.inverse" : "text.accent"}
      />
      <box flexGrow={1} />
      <text flexShrink={0} fg={color(props.isSelected ? "text.inverse" : "text.faint")}>
        {props.detail ?? ""}
      </text>
    </box>
  );
}
