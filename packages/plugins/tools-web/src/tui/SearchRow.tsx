/**
 * `websearch`'s row: the work row with the query. Once the search answers it shows how many sources
 * and which searcher, and a click opens the source list under it.
 */
import { createMemo, For } from "solid-js";

import { type ToolRowProps, WorkRow } from "@shanepadgett/liminal-chat/tui";
import { useColor } from "@shanepadgett/liminal-tui";

import { Searched, type WebSource } from "../contract.ts";
import { savedBy } from "./saved.ts";

function Sources(props: { readonly sources: ReadonlyArray<WebSource> }) {
  const color = useColor();

  return (
    <box marginLeft={2} paddingLeft={1} border={["left"]} borderColor={color("border.subtle")}>
      <For each={props.sources}>
        {(source) => (
          <text wrapMode="none" fg={color("text.faint")}>
            <span style={{ fg: color("text.muted") }}>{source.title}</span> {source.url}
          </text>
        )}
      </For>
    </box>
  );
}

export function SearchRow(props: ToolRowProps) {
  const searched = createMemo(() => savedBy(props, Searched));

  const note = () => {
    const saved = searched();
    if (saved === undefined) return "";

    const count = saved.sources.length === 1 ? "1 source" : `${saved.sources.length} sources`;

    return `${count}, ${saved.searcher}`;
  };

  const details = () => {
    const saved = searched();

    return saved === undefined || saved.sources.length === 0
      ? undefined
      : () => <Sources sources={saved.sources} />;
  };

  return <WorkRow item={props.item} note={note()} details={details()} />;
}
