/**
 * The assistant's reply to one prompt, drawn in a style. The reply folds into rows, each row takes
 * its kind's level for the turn's phase, and `live` rows draw only as the last row of a reply still
 * being worked on, and `latest` rows only as the last row of their kind. Rows sit indented under
 * the prompt; one-line rows stack without space between. A group open draws its entries as rows
 * again, folded by the group's inner rules; closed, it still shows any call that failed. A style
 * with a work log draws a finished reply in that log's style once its `worked` line is open.
 */

import type { JSX } from "@opentui/solid";
import { Match } from "effect";
import { For } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { isToolCall, type TranscriptEntry } from "./entries.ts";
import { foldRows, type Row } from "./fold.ts";
import { Group } from "./Group.tsx";
import type { DrawnLevel, GroupRule, Level, Phase, Style } from "./levels.ts";
import { Prose } from "./Prose.tsx";
import { Thinking } from "./Thinking.tsx";
import { ToolCall } from "./ToolCall.tsx";
import { Worked } from "./Worked.tsx";

/** Lines the reply up with the prompt's text, past its bar. */
const REPLY_INDENT = 3;

/** A row as drawn; `isCurrent` marks the last row of a reply still being worked on. */
type Drawn = { readonly row: Row; readonly level: DrawnLevel; readonly isCurrent: boolean };

/** What every row in a reply is drawn with. */
type Drawing = {
  readonly color: RoleColor;
  readonly style: Style;
  readonly phase: Phase;
  readonly openIds: ReadonlySet<string>;
};

const kindOf = (row: Row) => (row.kind === "entry" ? row.entry.kind : row.entries[0].kind);

const idOf = (row: Row) => (row.kind === "entry" ? row.entry.id : row.entries[0].id);

/** Rows drawn on one line stack tight against each other. */
const isOneLine = (drawn: Drawn) => drawn.level !== "full";

/** Where each row sits among the rows: the current one, and the last of its kind. */
type Place = { readonly isCurrent: boolean; readonly isLatest: boolean };

const drawnLevelOf = (level: Level, place: Place): DrawnLevel | undefined => {
  if (level === "hidden") return undefined;
  if (level === "latest") return place.isLatest ? "line" : undefined;
  if (level === "live") return place.isCurrent ? "live" : undefined;

  return level;
};

const drawnRows = (
  entries: readonly TranscriptEntry[],
  rules: readonly GroupRule[],
  drawing: Drawing,
): readonly Drawn[] => {
  const rows = foldRows(entries, rules);
  const lastOfKind = new Map(rows.map((row, index) => [kindOf(row), index]));

  return rows.flatMap((row, index): readonly Drawn[] => {
    const isCurrent = drawing.phase === "working" && index === rows.length - 1;
    const isLatest = lastOfKind.get(kindOf(row)) === index;

    const level = drawnLevelOf(drawing.style.levels[kindOf(row)][drawing.phase], {
      isCurrent,
      isLatest,
    });

    return level === undefined ? [] : [{ row, level, isCurrent }];
  });
};

/** Each failed call on its own line, which opens to show the error. */
const failedRows = (entries: readonly TranscriptEntry[]): readonly Drawn[] =>
  entries.flatMap((entry): readonly Drawn[] =>
    isToolCall(entry) && entry.outcome.status === "failed"
      ? [{ row: { kind: "entry", entry }, level: "line", isCurrent: false }]
      : [],
  );

/** The style's work log once the finished reply's `worked` line is open, else the style itself. */
const shownStyle = (
  style: Style,
  phase: Phase,
  reply: readonly TranscriptEntry[],
  openIds: ReadonlySet<string>,
): Style => {
  const isLogOpen =
    phase === "done" && reply.some((entry) => entry.kind === "worked" && openIds.has(entry.id));

  return isLogOpen && style.log !== undefined ? style.log : style;
};

function EntryView(props: {
  readonly color: RoleColor;
  readonly entry: TranscriptEntry;
  readonly level: DrawnLevel;
  readonly isOpen: boolean;
}): JSX.Element {
  const entry = props.entry;

  if (isToolCall(entry)) return <ToolCall {...props} call={entry} />;

  return Match.value(entry).pipe(
    Match.discriminatorsExhaustive("kind")({
      thinking: (thinking) => <Thinking {...props} thinking={thinking} />,
      interim: (interim) => (
        <Prose color={props.color} role="text.muted">
          {interim.text}
        </Prose>
      ),
      answer: (answer) => (
        <Prose color={props.color} role="text.base">
          {answer.text}
        </Prose>
      ),
      worked: (worked) => (
        <Worked color={props.color} seconds={worked.seconds} filesChanged={worked.filesChanged} />
      ),
    }),
  );
}

function RowView(props: { readonly drawing: Drawing; readonly drawn: Drawn }) {
  const row = props.drawn.row;
  const isOpen = props.drawing.openIds.has(idOf(row));

  if (row.kind === "entry") {
    return (
      <EntryView
        color={props.drawing.color}
        entry={row.entry}
        level={props.drawn.level}
        isOpen={isOpen}
      />
    );
  }

  const isShowingEntries = props.drawn.level === "full" || isOpen;

  return (
    <Group
      color={props.drawing.color}
      rule={row.rule}
      entries={row.entries}
      isLive={props.drawn.isCurrent}
    >
      <Rows
        drawing={props.drawing}
        rows={
          isShowingEntries
            ? drawnRows(row.entries, row.rule.inner, props.drawing)
            : failedRows(row.entries)
        }
      />
    </Group>
  );
}

function Rows(props: { readonly drawing: Drawing; readonly rows: readonly Drawn[] }) {
  return (
    <box flexDirection="column">
      <For each={props.rows}>
        {(drawn, index) => {
          const previous = props.rows[index() - 1];
          const isTight = previous === undefined || (isOneLine(previous) && isOneLine(drawn));

          return (
            <box marginTop={isTight ? 0 : 1}>
              <RowView drawing={props.drawing} drawn={drawn} />
            </box>
          );
        }}
      </For>
    </box>
  );
}

export function Reply(props: {
  readonly color: RoleColor;
  readonly reply: readonly TranscriptEntry[];
  readonly style: Style;
  readonly phase: Phase;
  readonly openIds: ReadonlySet<string>;
}) {
  const drawing = (): Drawing => ({
    color: props.color,
    style: shownStyle(props.style, props.phase, props.reply, props.openIds),
    phase: props.phase,
    openIds: props.openIds,
  });

  return (
    <box flexDirection="column" paddingLeft={REPLY_INDENT} marginTop={1}>
      <Rows
        drawing={drawing()}
        rows={drawnRows(props.reply, drawing().style.groups[props.phase], drawing())}
      />
    </box>
  );
}
