/** The model's words, drawn as markdown; while streaming, the last block may still change. */

import { useColor, useTheme } from "../../theme/theme.tsx";

export function Reply(props: { readonly text: string; readonly isStreaming: boolean }) {
  const theme = useTheme();
  const color = useColor();

  return (
    <markdown
      content={props.text}
      streaming={props.isStreaming}
      syntaxStyle={theme().syntax}
      fg={color("text.base")}
      conceal
      tableOptions={{
        style: "columns",
        widthMode: "content",
        cellPaddingX: 1,
        borderColor: color("border.base"),
        borderStyle: "rounded",
      }}
    />
  );
}
