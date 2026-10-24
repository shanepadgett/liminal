/** Key hints: `ctrl+s stash ctrl+p commands`, on one line or, expanded, in columns. */

import type { BoxRenderable } from "@opentui/core";
import { type Accessor, createContext, createSignal, For, useContext } from "solid-js";

import { useColor } from "../theme/theme.tsx";
import { HINT_GAP, type Hint, keyColumnsOf, layoutOf, paddedKeys } from "./hint-layout.ts";

export type { Hint } from "./hint-layout.ts";

const ExpandedContext = createContext<Accessor<boolean>>(() => false);

/** Whether a line that cannot fit its hints shows them all; the gallery shows it set in a state. */
export const HintsExpandedProvider = ExpandedContext.Provider;

function Column(props: { readonly column: readonly Hint[] }) {
  const color = useColor();
  const keyColumns = () => keyColumnsOf(props.column);

  return (
    <box flexShrink={0}>
      <For each={props.column}>
        {(hint) => (
          <text>
            <span style={{ fg: color("text.muted") }}>{paddedKeys(hint, keyColumns())}</span>
            <span style={{ fg: color("text.faint") }}>{` ${hint.label}`}</span>
          </text>
        )}
      </For>
    </box>
  );
}

/** The hints in the width this line has; with `end`, against its right edge. */
export function Hints(props: { readonly hints: readonly Hint[]; readonly end?: boolean }) {
  const isExpanded = useContext(ExpandedContext);
  const [width, setWidth] = createSignal<number>();
  let line: BoxRenderable | undefined;

  return (
    <box
      ref={(made) => {
        line = made;
      }}
      width="100%"
      overflow="hidden"
      flexDirection="row"
      justifyContent={props.end === true ? "flex-end" : "flex-start"}
      gap={HINT_GAP}
      onSizeChange={() => {
        setWidth(line?.width);
      }}
    >
      <For each={layoutOf(props.hints, width(), isExpanded())}>
        {(column) => <Column column={column} />}
      </For>
    </box>
  );
}
