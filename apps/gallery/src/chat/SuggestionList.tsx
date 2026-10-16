/**
 * The panel of suggestions that opens upward from the composer's top edge while the user types a
 * command or tags a file. It shares the composer's surface, so the composer looks to grow. It shows
 * at most `MAX_ROWS` rows and scrolls past them. Rows learn how many columns they have, so long
 * text can be cut to fit.
 */

import type { BoxRenderable } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal } from "solid-js";

export const MAX_ROWS = 10;

export function SuggestionList(props: {
  readonly surface: string;
  readonly count: number;
  readonly children: (columns: () => number) => JSX.Element;
}) {
  const [list, setList] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  return (
    <box flexDirection="column" backgroundColor={props.surface} paddingX={2} paddingTop={1}>
      <scrollbox height={Math.min(props.count, MAX_ROWS)} scrollbarOptions={{ visible: false }}>
        <box
          ref={setList}
          flexDirection="column"
          onSizeChange={() => setColumns(list()?.width ?? 0)}
        >
          {props.children(columns)}
        </box>
      </scrollbox>
    </box>
  );
}
