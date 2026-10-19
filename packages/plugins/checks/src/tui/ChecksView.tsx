/**
 * How checks draw: a work row, `Ran checks (all passed)` or `Ran checks (lint)` with the failure in
 * the danger color; opened, each check's mark and the failures' output. A report the turn saved
 * draws the same row; fixer runs are one faint line in the debug view.
 */

import { Option, Schema } from "effect";
import { createSignal, For, Show } from "solid-js";

import type { ToolView } from "@liminal/chat/contract";
import type { SavedEntry } from "@liminal/sdk";
import { type RoleName, Tail, useColor } from "@liminal/sdk/tui";

import { CheckReport } from "../contract.ts";

const OUTPUT_LINES = 12;

const decodeReport = Schema.decodeUnknownOption(CheckReport);

/** Each check's mark and name on one line, then each failure's last output lines. */
export function ReportMarks(props: { readonly report: CheckReport }) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <text wrapMode="none" truncate>
        <For each={props.report.passed}>
          {(name) => (
            <>
              <span style={{ fg: color("feedback.success") }}>✓</span>
              <span style={{ fg: color("text.faint") }}>{` ${name}   `}</span>
            </>
          )}
        </For>
        <For each={props.report.failed}>
          {({ name }) => (
            <>
              <span style={{ fg: color("feedback.danger") }}>✗</span>
              <span style={{ fg: color("text.faint") }}>{` ${name}   `}</span>
            </>
          )}
        </For>
      </text>
      <For each={props.report.failed}>
        {({ output }) => <Tail text={output} lines={OUTPUT_LINES} />}
      </For>
    </box>
  );
}

/** An opened `checks` call: the marks from its details, or its text when they do not decode. */
export function ChecksDetail(props: ToolView) {
  return Option.match(decodeReport(props.call.outcome?.details), {
    onNone: () => <Tail text={props.text} lines={OUTPUT_LINES} />,
    onSome: (report) => <ReportMarks report={report} />,
  });
}

/** `◆ Ran checks (all passed)`, or the failed names in the danger color; a click opens it. */
export function ReportRow(props: { readonly entry: SavedEntry }) {
  const color = useColor();
  const [isOpen, setIsOpen] = createSignal(false);
  const report = () => decodeReport(props.entry.data);

  const failed = () =>
    Option.match(report(), {
      onNone: () => "",
      onSome: (found) => found.failed.map(({ name }) => name).join(", "),
    });

  const outcome = (): { readonly role: RoleName; readonly text: string } =>
    failed() === ""
      ? { role: "text.ghost", text: " (all passed)" }
      : { role: "feedback.danger", text: ` (${failed()} failed)` };

  return (
    <box flexDirection="column" onMouseUp={() => setIsOpen((was) => !was)}>
      <text>
        <span style={{ fg: color("text.ghost") }}>{"◆ "}</span>
        <b style={{ fg: color("text.muted") }}>{"Ran"}</b>
        <span style={{ fg: color("text.faint") }}>{" checks"}</span>
        <span style={{ fg: color(outcome().role) }}>{outcome().text}</span>
      </text>
      <Show when={isOpen() ? Option.getOrUndefined(report()) : undefined}>
        {(found) => (
          <box paddingLeft={2}>
            <ReportMarks report={found()} />
          </box>
        )}
      </Show>
    </box>
  );
}

/** `Fixed with format, lint`, as the wrapper saved it. */
export function FixedLine(props: { readonly entry: SavedEntry }) {
  const color = useColor();

  return <text fg={color("text.faint")}>{props.entry.text}</text>;
}
