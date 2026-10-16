/**
 * The transcript in the gallery: each kind of entry at every level it supports, and the sample
 * session in each style, working and finished.
 */

import { createSignal } from "solid-js";

import { withRoles } from "../entryViews.ts";
import type { Entry, EntryState, Section } from "../shell/entries.ts";
import type { RoleColor } from "../tokens/roles.ts";
import type { ToolKind, TranscriptEntry } from "./entries.ts";
import type { DrawnLevel, Phase, Style } from "./levels.ts";
import { Reply } from "./Reply.tsx";
import {
  DONE_CALLS,
  EXPANDED_ID,
  FAILED_CALLS,
  FINISHED_SESSION,
  FIX_LOG_ID,
  LONG_PROMPT,
  RUNNING_CALLS,
  THINKING,
  WORKING_SESSION,
} from "./sample.ts";
import { FOLDED, FULL, LIMINAL, LIMINAL_LOG, QUIET } from "./styles.ts";
import { Thinking } from "./Thinking.tsx";
import { ToolCall } from "./ToolCall.tsx";
import { Transcript } from "./Transcript.tsx";
import { UserPrompt } from "./UserPrompt.tsx";

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

/** A group as a reply draws it, so its rows fold and open the way they do in a session. */
type GroupPick = {
  readonly name: string;
  readonly style: Style;
  readonly phase: Phase;
  readonly reply: readonly TranscriptEntry[];
  readonly isOpen: boolean;
};

const groupState = (pick: GroupPick): EntryState => ({
  name: pick.name,
  fill: "width",
  view: withRoles((color) => (
    <Reply
      color={color}
      reply={pick.reply}
      style={pick.style}
      phase={pick.phase}
      openIds={new Set(pick.isOpen ? pick.reply.slice(0, 1).map((entry) => entry.id) : [])}
    />
  )),
});

const EXPLORING = [DONE_CALLS.read, DONE_CALLS.search];

const STEP_WORK = [THINKING, DONE_CALLS.read, DONE_CALLS.search, DONE_CALLS.edit, DONE_CALLS.run];

const GROUP_PICKS: readonly [GroupPick, ...GroupPick[]] = [
  { name: "Explored", style: FOLDED, phase: "done", reply: EXPLORING, isOpen: false },
  { name: "Explored, open", style: FOLDED, phase: "done", reply: EXPLORING, isOpen: true },
  { name: "Step", style: LIMINAL_LOG, phase: "done", reply: STEP_WORK, isOpen: false },
  { name: "Step, open", style: LIMINAL_LOG, phase: "done", reply: STEP_WORK, isOpen: true },
  {
    name: "Step, failed",
    style: LIMINAL_LOG,
    phase: "done",
    reply: [DONE_CALLS.read, DONE_CALLS.edit, FAILED_CALLS.run],
    isOpen: false,
  },
  {
    name: "Step, running",
    style: LIMINAL_LOG,
    phase: "working",
    reply: [DONE_CALLS.read, DONE_CALLS.edit, RUNNING_CALLS.run],
    isOpen: false,
  },
  {
    name: "Step, thinking",
    style: LIMINAL_LOG,
    phase: "working",
    reply: [DONE_CALLS.read, DONE_CALLS.search, THINKING],
    isOpen: false,
  },
];

/** A prompt that opens and closes on click, as it does in the transcript. */
function TogglingPrompt(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly isExpanded: boolean;
}) {
  const [isExpanded, setIsExpanded] = createSignal(props.isExpanded);

  return (
    <UserPrompt
      color={props.color}
      text={props.text}
      isExpanded={isExpanded()}
      onToggle={() => setIsExpanded((was) => !was)}
    />
  );
}

const promptState = (name: string, text: string, isExpanded: boolean): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2}>
      <TogglingPrompt color={color} text={text} isExpanded={isExpanded} />
    </box>
  )),
});

export const TRANSCRIPT_COMPONENTS: Section = {
  title: "Transcript",
  entries: [
    {
      id: "transcript-prompt",
      title: "Prompt",
      states: [
        promptState("Short", "explain how the plugin host boots", false),
        promptState("Long", LONG_PROMPT, false),
        promptState("Long, open", LONG_PROMPT, true),
      ],
    },
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
      states: [groupState(GROUP_PICKS[0]), ...GROUP_PICKS.slice(1).map(groupState)],
    },
  ],
};

const OPEN_IDS: ReadonlySet<string> = new Set([EXPANDED_ID]);

const sessionState = (
  style: Style,
  isWorking: boolean,
  openIds: ReadonlySet<string> = OPEN_IDS,
  name = `${style.name}, ${isWorking ? "working" : "finished"}`,
): EntryState => ({
  name,
  fill: "screen",
  view: withRoles((color) => (
    <Transcript
      color={color}
      session={isWorking ? WORKING_SESSION : FINISHED_SESSION}
      style={style}
      isWorking={isWorking}
      openIds={openIds}
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
        sessionState(LIMINAL, true),
        sessionState(LIMINAL, false),
        sessionState(LIMINAL, false, new Set([FIX_LOG_ID]), "Liminal, work log open"),
      ],
    },
  ],
};
