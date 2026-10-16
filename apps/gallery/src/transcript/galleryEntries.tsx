/**
 * The transcript in the gallery: each kind of entry at every level it supports, and the sample
 * session in each style, working and finished.
 */

import { withRoles } from "../entryViews.ts";
import type { Entry, EntryState, Section } from "../shell/entries.ts";
import type { ToolKind } from "./entries.ts";
import { Group } from "./Group.tsx";
import type { DrawnLevel, Style } from "./levels.ts";
import {
  DONE_CALLS,
  EXPANDED_ID,
  FAILED_CALLS,
  FINISHED_SESSION,
  RUNNING_CALLS,
  THINKING,
  WORKING_SESSION,
} from "./sample.ts";
import { EXPLORED, FOLDED, FULL, QUIET } from "./styles.ts";
import { Thinking } from "./Thinking.tsx";
import { ToolCall } from "./ToolCall.tsx";
import { Transcript } from "./Transcript.tsx";

type Shown = { readonly name: string; readonly level: DrawnLevel; readonly isOpen: boolean };

const LINE: Shown = { name: "Line", level: "line", isOpen: false };

const SHOWN_LEVELS: readonly [Shown, ...Shown[]] = [
  { name: "Full", level: "full", isOpen: false },
  LINE,
  { name: "Line, open", level: "line", isOpen: true },
  { name: "Live", level: "live", isOpen: false },
];

const thinkingState = (shown: Shown): EntryState => ({
  name: shown.name,
  fill: "width",
  view: withRoles((color) => (
    <Thinking color={color} thinking={THINKING} level={shown.level} isOpen={shown.isOpen} />
  )),
});

const THINKING_ENTRY: Entry = {
  id: "transcript-thinking",
  title: "Thinking",
  states: [thinkingState(SHOWN_LEVELS[0]), ...SHOWN_LEVELS.slice(1).map(thinkingState)],
};

type CallPick = { readonly name: string; readonly calls: typeof DONE_CALLS; readonly shown: Shown };

/** A live line stands for the current action, so it shows the call still running. */
const levelPick = (shown: Shown): CallPick => ({
  name: shown.name,
  calls: shown.level === "live" ? RUNNING_CALLS : DONE_CALLS,
  shown,
});

const CALL_PICKS: readonly [CallPick, ...CallPick[]] = [
  levelPick(SHOWN_LEVELS[0]),
  ...SHOWN_LEVELS.slice(1).map(levelPick),
  { name: "Running", calls: RUNNING_CALLS, shown: { ...LINE, level: "full" } },
  { name: "Failed", calls: FAILED_CALLS, shown: LINE },
];

const callState = (kind: ToolKind, pick: CallPick): EntryState => ({
  name: pick.name,
  fill: "width",
  view: withRoles((color) => (
    <ToolCall
      color={color}
      call={pick.calls[kind]}
      level={pick.shown.level}
      isOpen={pick.shown.isOpen}
    />
  )),
});

const callEntry = (kind: ToolKind, title: string): Entry => ({
  id: `transcript-${kind}`,
  title,
  states: [
    callState(kind, CALL_PICKS[0]),
    ...CALL_PICKS.slice(1).map((pick) => callState(kind, pick)),
  ],
});

const groupState = (name: string, isOpen: boolean): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <Group
      color={color}
      rule={EXPLORED}
      calls={[DONE_CALLS.read, DONE_CALLS.search]}
      level="line"
      isOpen={isOpen}
    />
  )),
});

export const TRANSCRIPT_COMPONENTS: Section = {
  title: "Transcript",
  entries: [
    THINKING_ENTRY,
    callEntry("read", "Read"),
    callEntry("edit", "Edit"),
    callEntry("run", "Run"),
    callEntry("search", "Search"),
    callEntry("checks", "Checks"),
    callEntry("ask", "Ask"),
    {
      id: "transcript-group",
      title: "Group",
      states: [groupState("Line", false), groupState("Line, open", true)],
    },
  ],
};

const OPEN_IDS: ReadonlySet<string> = new Set([EXPANDED_ID]);

const sessionState = (style: Style, isWorking: boolean): EntryState => ({
  name: `${style.name}, ${isWorking ? "working" : "finished"}`,
  fill: "page",
  view: withRoles((color) => (
    <Transcript
      color={color}
      session={isWorking ? WORKING_SESSION : FINISHED_SESSION}
      style={style}
      isWorking={isWorking}
      openIds={OPEN_IDS}
    />
  )),
});

export const TRANSCRIPT_SCREENS: Section = {
  title: "Transcript",
  entries: [
    {
      id: "transcript",
      title: "Transcript",
      states: [
        sessionState(FULL, true),
        sessionState(FULL, false),
        sessionState(FOLDED, true),
        sessionState(FOLDED, false),
        sessionState(QUIET, true),
        sessionState(QUIET, false),
      ],
    },
  ],
};
