/**
 * Neighboring entries folded into one line. A labeled group, such as `Explored`, names what its
 * calls acted on; a tallied group, such as a step, says what its work did. While it is the turn's
 * current action, a tallied line leads with that action in a brighter text, then settles to the
 * tally once it is done. Whatever sits under the line (its entries when open, its failures when
 * closed) comes in as children.
 */

import type { JSX } from "@opentui/solid";
import { For, Show } from "solid-js";

import type { RoleColor, RoleName } from "../tokens/roles.ts";
import { formatDuration } from "./duration.ts";
import { isToolCall, type ToolStatus, type TranscriptEntry } from "./entries.ts";
import type { GroupRule } from "./levels.ts";
import { faceOf } from "./results/faceOf.ts";
import { BODY_INDENT } from "./results/Panel.tsx";
import { combinedStatus } from "./status.ts";
import { StatusLabel } from "./StatusLabel.tsx";
import { StatusMark } from "./StatusMark.tsx";
import { type Tally, tallyOf } from "./tally.ts";

type Segment = { readonly text: string; readonly role: RoleName };

const SEPARATOR: Segment = { text: " · ", role: "text.ghost" };

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The lead is the live action, or the first finished part once the run settles. */
const leadOf = (tally: Tally): readonly Segment[] => {
  if (tally.current === undefined) {
    const [first] = tally.parts;

    return first === undefined ? [] : [{ text: capitalized(first), role: "text.muted" }];
  }

  const elapsed =
    tally.currentSeconds === undefined ? "" : ` ${formatDuration(tally.currentSeconds)}`;

  return [
    { text: tally.current, role: "text.base" },
    { text: elapsed, role: "text.faint" },
  ];
};

const segmentsOf = (tally: Tally): readonly Segment[] => {
  const rest = tally.current === undefined ? tally.parts.slice(1) : tally.parts;

  const failures: readonly Segment[] =
    tally.failures === 0 ? [] : [{ text: `${tally.failures} failed`, role: "feedback.danger" }];

  const trailing = [
    ...rest.map((part): Segment => ({ text: part, role: "text.faint" })),
    ...failures,
  ];

  return [...leadOf(tally), ...trailing.flatMap((segment) => [SEPARATOR, segment])];
};

function TallyLine(props: {
  readonly color: RoleColor;
  readonly status: ToolStatus;
  readonly tally: Tally;
}) {
  return (
    <box flexDirection="row" height={1} gap={1}>
      <StatusMark color={props.color} status={props.status} />
      <text wrapMode="none" truncate flexShrink={1}>
        <For each={segmentsOf(props.tally)}>
          {(segment) => <span style={{ fg: props.color(segment.role) }}>{segment.text}</span>}
        </For>
      </text>
    </box>
  );
}

function LabelLine(props: {
  readonly color: RoleColor;
  readonly status: ToolStatus;
  readonly label: string;
  readonly entries: readonly TranscriptEntry[];
}) {
  const subjects = () =>
    props.entries.flatMap((entry) => (isToolCall(entry) ? [faceOf(entry).subject] : [])).join(", ");

  return (
    <box flexDirection="row" height={1} gap={1}>
      <StatusLabel color={props.color} status={props.status} label={props.label} />
      <text wrapMode="none" truncate flexShrink={1} fg={props.color("text.muted")}>
        {subjects()}
      </text>
    </box>
  );
}

export function Group(props: {
  readonly color: RoleColor;
  readonly rule: GroupRule;
  readonly entries: readonly TranscriptEntry[];
  /** The turn's current action: it reads as running even between calls. */
  readonly isLive: boolean;
  readonly children: JSX.Element;
}) {
  const status = (): ToolStatus =>
    props.isLive
      ? "running"
      : combinedStatus(
          props.entries.flatMap((entry) => (isToolCall(entry) ? [entry.outcome.status] : [])),
        );

  const label = () => {
    const heading = props.rule.heading;

    return heading.kind === "label" ? heading.text : undefined;
  };

  return (
    <box flexDirection="column">
      <Show
        when={label()}
        fallback={
          <TallyLine
            color={props.color}
            status={status()}
            tally={tallyOf(props.entries, props.isLive)}
          />
        }
      >
        {(text) => (
          <LabelLine color={props.color} status={status()} label={text()} entries={props.entries} />
        )}
      </Show>
      <box flexDirection="column" marginLeft={BODY_INDENT}>
        {props.children}
      </box>
    </box>
  );
}
