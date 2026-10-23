/**
 * `shell`'s row: the work row labelled by the call's description. While the command runs, its last
 * lines sit under the row; once it is done, a click opens the command and the end of its output.
 */
import { Array as Arr, Option, Predicate, Schema } from "effect";
import { createMemo, For, Show } from "solid-js";

import { type ToolRowProps, WorkRow } from "@shanepadgett/liminal-chat/tui";
import type { ToolResult } from "@shanepadgett/liminal-model/contract";
import { MessageEvent, type SessionEvent } from "@shanepadgett/liminal-session/contract";
import { ToolProgress } from "@shanepadgett/liminal-tools/contract";
import { useColor } from "@shanepadgett/liminal-tui";

import { ShellProgress } from "../contract.ts";

/** Lines of output an open row shows. */
const RESULT_LINES = 10;

const decodeMessage = Schema.decodeOption(MessageEvent.schema);

const decodeProgress = Schema.decodeOption(ToolProgress.schema);

const decodeTail = Schema.decodeUnknownOption(ShellProgress);

/** A string param as the model writes it, before the whole call has come. */
const writtenParam = (params: ToolRowProps["item"]["params"], key: string) =>
  Predicate.isObject(params) && key in params && Predicate.isString(params[key]) ? params[key] : "";

/** The last lines of the newest progress for this call, if any is streaming now. */
const latestTail = (props: ToolRowProps) =>
  Arr.findLast(props.state.streaming, (delta) =>
    delta.kind === ToolProgress.kind
      ? decodeProgress(delta.data).pipe(
          Option.filter((progress) => progress.callId === props.item.id),
          Option.flatMap((progress) => decodeTail(progress.data)),
          Option.map(({ tail }) => tail),
        )
      : Option.none(),
  );

/** The call's result, found in the message that holds it. */
const resultIn = (event: SessionEvent, callId: string): Option.Option<ToolResult> => {
  if (event.kind !== MessageEvent.kind) return Option.none();

  return decodeMessage(event.data).pipe(
    Option.flatMap(({ parts }) =>
      Arr.findFirst(parts, (part) =>
        part.type === "tool-result" && part.callId === callId ? Option.some(part) : Option.none(),
      ),
    ),
  );
};

/** The last lines of the call's result text. */
const resultLines = (props: ToolRowProps): ReadonlyArray<string> =>
  Arr.findLast(props.state.events, (event) => resultIn(event, props.item.id)).pipe(
    Option.map(({ content }) =>
      content
        .flatMap((part) => (part.type === "text" ? part.text.split("\n") : []))
        .slice(-RESULT_LINES),
    ),
    Option.getOrElse((): ReadonlyArray<string> => []),
  );

function Lines(props: { readonly lines: ReadonlyArray<string> }) {
  const color = useColor();

  return (
    <box marginLeft={2} paddingLeft={1} border={["left"]} borderColor={color("border.subtle")}>
      <For each={props.lines}>
        {(line) => (
          <text wrapMode="none" fg={color("text.faint")}>
            {line}
          </text>
        )}
      </For>
    </box>
  );
}

function Details(props: { readonly command: string; readonly output: ReadonlyArray<string> }) {
  const color = useColor();

  return (
    <box>
      <box marginLeft={2} paddingLeft={1} border={["left"]} borderColor={color("border.subtle")}>
        <text fg={color("text.muted")}>{props.command}</text>
      </box>
      <Lines lines={props.output} />
    </box>
  );
}

export function ShellRow(props: ToolRowProps) {
  // A save clears the streaming deltas, so the last tail seen stays until the next comes.
  const tail = createMemo<ReadonlyArray<string>>(
    (previous) => Option.getOrElse(latestTail(props), () => previous),
    [],
  );

  const description = () =>
    writtenParam(props.item.params, "description") || writtenParam(props.item.params, "command");

  // Read when the row opens, so the transcript does not search for results on every update.
  const details = () =>
    props.item.status === "running"
      ? undefined
      : () => (
          <Details
            command={writtenParam(props.item.params, "command")}
            output={resultLines(props)}
          />
        );

  return (
    <box>
      <WorkRow
        item={{ ...props.item, params: { description: description() } }}
        details={details()}
      />
      <Show when={props.item.status === "running" && tail().length > 0}>
        <Lines lines={tail()} />
      </Show>
    </box>
  );
}
