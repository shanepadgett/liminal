/**
 * `edit`'s row: the work row with the file's path. While the call runs it counts the edits; once
 * the file has changed it shows the lines added and removed, and a click opens the diff under it.
 */
import { Option, Predicate, Schema } from "effect";
import { createMemo } from "solid-js";

import { type ToolRowProps, WorkRow } from "@shanepadgett/liminal-chat/tui";
import { kit } from "@shanepadgett/liminal-tui";

import { Changed } from "../contract.ts";

const decodeChanged = Schema.decodeOption(Changed.schema);

/** The change this call saved, once the file has changed. */
const changeOf = (props: ToolRowProps) =>
  props.state.events.flatMap((event) =>
    event.kind === Changed.kind
      ? Option.toArray(
          Option.filter(decodeChanged(event.data), ({ callId }) => callId === props.item.id),
        )
      : [],
  )[0];

type Params = ToolRowProps["item"]["params"];

/** The path as the model writes it, before the whole call has come. */
const writtenPath = (params: Params) =>
  Predicate.isObject(params) && "path" in params && Predicate.isString(params.path)
    ? params.path
    : "";

/** How many edits the model has written so far. */
const writtenEdits = (params: Params) =>
  Predicate.isObject(params) && "edits" in params && Array.isArray(params.edits)
    ? params.edits.length
    : 0;

export function EditRow(props: ToolRowProps) {
  const change = createMemo(() => changeOf(props));

  const note = () => {
    const saved = change();

    if (saved !== undefined) {
      const { added, removed } = kit.changesOf(saved.patch);

      return `+${added} -${removed}`;
    }

    const edits = writtenEdits(props.item.params);
    const isCounted = props.item.status === "running" && edits > 1;

    return isCounted ? `${edits} edits` : "";
  };

  const details = () => {
    const saved = change();

    return saved === undefined
      ? undefined
      : () => <kit.Diff path={saved.path} patch={saved.patch} />;
  };

  return (
    <WorkRow
      item={{ ...props.item, params: { path: change()?.path ?? writtenPath(props.item.params) } }}
      note={note()}
      details={details()}
    />
  );
}
