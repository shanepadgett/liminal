/**
 * A session drawn in a style. Each turn folds into rows, each row takes its kind's level for the
 * turn's phase, and `live` rows draw only as the last row of the turn still being worked on.
 * Assistant rows sit indented past the user's bar; one-line rows stack without space between.
 */

import type { JSX } from "@opentui/solid";
import { Match } from "effect";
import { For } from "solid-js";

import { INDENT, Prose, UserMessage } from "../chat/Message.tsx";
import type { RoleColor } from "../tokens/roles.ts";
import { isToolCall, type TranscriptEntry, type Turn } from "./entries.ts";
import { foldRows, type Row } from "./fold.ts";
import { Group } from "./Group.tsx";
import type { DrawnLevel, Level, Phase, Style } from "./levels.ts";
import { Thinking } from "./Thinking.tsx";
import { ToolCall } from "./ToolCall.tsx";
import { Worked } from "./Worked.tsx";

type Drawn = { readonly row: Row; readonly level: DrawnLevel };

const kindOf = (row: Row) => (row.kind === "entry" ? row.entry.kind : row.calls[0].kind);

const idOf = (row: Row) => (row.kind === "entry" ? row.entry.id : row.calls[0].id);

/** Rows drawn on one line stack tight against each other. */
const isOneLine = (drawn: Drawn) => drawn.level !== "full";

const levelOf = (style: Style, phase: Phase, row: Row, isCurrent: boolean): Level => {
  const level = style.levels[kindOf(row)][phase];

  return level === "live" && !isCurrent ? "hidden" : level;
};

const drawnRows = (turn: Turn, style: Style, phase: Phase): readonly Drawn[] => {
  const rows = foldRows(turn, style.groups);

  return rows.flatMap((row, index): readonly Drawn[] => {
    const level = levelOf(style, phase, row, phase === "working" && index === rows.length - 1);

    return level === "hidden" ? [] : [{ row, level }];
  });
};

type DrawProps = {
  readonly color: RoleColor;
  readonly level: DrawnLevel;
  readonly isOpen: boolean;
};

function EntryView(props: DrawProps & { readonly entry: TranscriptEntry }): JSX.Element {
  const entry = props.entry;

  if (isToolCall(entry)) return <ToolCall {...props} call={entry} />;

  return Match.value(entry).pipe(
    Match.discriminatorsExhaustive("kind")({
      user: (user) => (
        <UserMessage color={props.color} isFocused={false}>
          {user.text}
        </UserMessage>
      ),
      thinking: (thinking) => <Thinking {...props} thinking={thinking} />,
      interim: (interim) => <Prose color={props.color}>{interim.text}</Prose>,
      answer: (answer) => <Prose color={props.color}>{answer.text}</Prose>,
      worked: (worked) => <Worked color={props.color} seconds={worked.seconds} />,
    }),
  );
}

function RowView(props: DrawProps & { readonly row: Row }) {
  const row = props.row;

  return row.kind === "entry" ? (
    <EntryView {...props} entry={row.entry} />
  ) : (
    <Group {...props} rule={row.rule} calls={row.calls} />
  );
}

function TurnView(props: {
  readonly color: RoleColor;
  readonly turn: Turn;
  readonly style: Style;
  readonly phase: Phase;
  readonly openIds: ReadonlySet<string>;
}) {
  const rows = () => drawnRows(props.turn, props.style, props.phase);

  return (
    <box flexDirection="column">
      <For each={rows()}>
        {(drawn, index) => {
          const previous = rows()[index() - 1];
          const isTight = previous !== undefined && isOneLine(previous) && isOneLine(drawn);
          const isUser = drawn.row.kind === "entry" && drawn.row.entry.kind === "user";

          return (
            <box marginTop={index() === 0 || isTight ? 0 : 1} paddingLeft={isUser ? 0 : INDENT}>
              <RowView
                color={props.color}
                row={drawn.row}
                level={drawn.level}
                isOpen={props.openIds.has(idOf(drawn.row))}
              />
            </box>
          );
        }}
      </For>
    </box>
  );
}

export function Transcript(props: {
  readonly color: RoleColor;
  readonly session: readonly Turn[];
  readonly style: Style;
  readonly isWorking: boolean;
  readonly openIds: ReadonlySet<string>;
}) {
  return (
    <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
      <For each={props.session}>
        {(turn, index) => (
          <TurnView
            color={props.color}
            turn={turn}
            style={props.style}
            phase={props.isWorking && index() === props.session.length - 1 ? "working" : "done"}
            openIds={props.openIds}
          />
        )}
      </For>
    </box>
  );
}
