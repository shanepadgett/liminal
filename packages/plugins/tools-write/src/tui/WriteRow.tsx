/**
 * `write`'s row: the work row with the file's path. Once the file is written it shows the lines
 * added and removed, and a click opens the diff under it.
 */
import { Option, Predicate, Schema } from "effect";
import { createMemo } from "solid-js";

import { type ToolRowProps, WorkRow } from "@shanepadgett/liminal-chat/tui";
import { kit } from "@shanepadgett/liminal-tui";

import { Written } from "../contract.ts";

const decodeWritten = Schema.decodeOption(Written.schema);

/** What this call wrote, once the file is written. */
const writtenBy = (props: ToolRowProps) =>
  props.state.events.flatMap((event) =>
    event.kind === Written.kind
      ? Option.toArray(
          Option.filter(decodeWritten(event.data), ({ callId }) => callId === props.item.id),
        )
      : [],
  )[0];

export function WriteRow(props: ToolRowProps) {
  const written = createMemo(() => writtenBy(props));

  const path = () => {
    const { params } = props.item;

    return Predicate.isObject(params) && "path" in params && Predicate.isString(params.path)
      ? params.path
      : "";
  };

  const note = () => {
    const saved = written();
    if (saved === undefined) return "";

    const { added, removed } = kit.changesOf(saved.patch);

    return `+${added} -${removed}`;
  };

  const details = () => {
    const saved = written();

    return saved === undefined
      ? undefined
      : () => <kit.Diff path={saved.path} patch={saved.patch} />;
  };

  return (
    <WorkRow item={{ ...props.item, params: { path: path() } }} note={note()} details={details()} />
  );
}
