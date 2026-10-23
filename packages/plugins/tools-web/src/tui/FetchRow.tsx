/** `webfetch`'s row: the work row with the address, and once read, the page's status and type. */
import { createMemo } from "solid-js";

import { type ToolRowProps, WorkRow } from "@shanepadgett/liminal-chat/tui";

import { Fetched } from "../contract.ts";
import { savedBy } from "./saved.ts";

export function FetchRow(props: ToolRowProps) {
  const fetched = createMemo(() => savedBy(props, Fetched));

  const note = () => {
    const saved = fetched();

    return saved === undefined ? "" : `${saved.status} ${saved.type}`;
  };

  return <WorkRow item={props.item} note={note()} />;
}
