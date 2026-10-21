/**
 * The transcript in the gallery: the session playing out turn by turn, and its `/qna` turn and fix
 * turn held at each of their moments.
 */

import { Show } from "solid-js";

import { withRoles } from "../entryViews.ts";
import type { EntryState, Section } from "../shell/entries.ts";
import { ApprovalAnswer, type ApprovalAnswerMessage } from "./ApprovalAnswer.tsx";
import {
  Checkpoint,
  type CheckpointMessage,
  NoteLine,
  type RestoredFiles,
  RestoredLine,
} from "./Checkpoint.tsx";
import { Conversation } from "./Conversation.tsx";
import { LiveNotice, Notice, type NoticeMessage } from "./Notice.tsx";
import { closeMomentOf, durationOf, frameAt, momentOf, sessionDurationOf } from "./play.ts";
import { Playback } from "./Playback.tsx";
import { ASK, BOOT, FIX } from "./sample.ts";
import type { Script } from "./script.ts";
import { Turn } from "./Turn.tsx";
import type { WorkGroup } from "./workGroups.ts";
import { WorkRows } from "./WorkRows.tsx";

const momentState = (name: string, script: Script, ms: number): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2}>
      <Turn color={color} prompt={script.prompt} frame={frameAt(script, ms)} />
    </box>
  )),
});

/** Every work group the fix turn left, failures included. */
const FIX_GROUPS: readonly WorkGroup[] = frameAt(FIX, durationOf(FIX)).blocks.flatMap((block) =>
  block.kind === "work" ? block.groups : [],
);

const workState = (name: string, dim: number): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2}>
      <WorkRows color={color} groups={FIX_GROUPS} dim={dim} />
    </box>
  )),
});

const MODEL_ERROR: NoticeMessage = {
  kind: "error",
  title: "Couldn't reach the model",
  body: "Anthropic returned 529 (overloaded) for claude-sonnet-5. Retrying in 8s, attempt 2 of 5.",
};

const NOTICES: readonly NoticeMessage[] = [
  {
    kind: "warning",
    title: "Skipped an instruction file",
    body: ".liminal/instructions/testing.md, line 2: front matter needs `always: true` or `read-when: <situation>`.",
  },
  {
    kind: "warning",
    title: "Context is 90% full",
    body: "181,000 of 200,000 tokens. The oldest turns fold soon.",
  },
  { kind: "info", title: "Model changed to GPT-5.5" },
];

const noticeState = (notice: NoticeMessage): EntryState => ({
  name: notice.title,
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2}>
      <LiveNotice color={color} notice={notice} />
    </box>
  )),
});

const copiedNoticeState: EntryState = {
  name: "Copied",
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2}>
      <Notice color={color} notice={MODEL_ERROR} isCopied={true} onCopy={() => {}} />
    </box>
  )),
};

type AnswerSample = { readonly name: string; readonly answer: ApprovalAnswerMessage };

const ANSWERS: readonly [AnswerSample, ...AnswerSample[]] = [
  {
    name: "Decision model",
    answer: {
      tool: "shell",
      approved: true,
      by: "decision model",
      model: "jev",
      reason: "runs the project's tests",
    },
  },
  {
    name: "Reviewer",
    answer: {
      tool: "edit",
      approved: true,
      by: "reviewer",
      model: "gpt-5-mini",
      reason: "edits a file inside the workspace the user asked to change",
    },
  },
  {
    name: "Full mode",
    answer: { tool: "shell", approved: true, by: "mode", reason: "the session is in full mode" },
  },
  {
    name: "Rejected",
    answer: { tool: "shell", approved: false, by: "you", reason: "don't push yet" },
  },
];

const answerState = (entry: AnswerSample): EntryState => ({
  name: entry.name,
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2}>
      <ApprovalAnswer color={color} answer={entry.answer} />
    </box>
  )),
});

const CHECKPOINT: CheckpointMessage = {
  handoff: [
    "Moving the reload tests onto the shared boot helper; two of five files are done.",
    "",
    "- Done: packages/kernel/test/reload.test.ts, packages/kernel/test/graphs.test.ts",
    "- Next: machine.test.ts, then protocol.test.ts and contracts.test.ts",
    "- The user wants one helper, `bootAndRecord`, not a helper per file",
    "- `bun test packages/kernel` passes after each file; run it before moving on",
  ].join("\n"),
  restored: 4,
};

const RESTORED: RestoredFiles = {
  files: [
    { path: "packages/kernel/test/boot.ts", lines: "all" },
    { path: "packages/kernel/test/machine.test.ts", lines: "1–180" },
    { path: "packages/kernel/src/reload/machine.ts", lines: "40–112, 260–318" },
    { path: "packages/kernel/test/protocol.test.ts", lines: "all" },
  ],
  leftOut: ["packages/kernel/test/contracts.test.ts"],
};

/** The checkpoint Liminal writes once the cache is lost: no handoff. */
const AUTOMATIC: CheckpointMessage = { restored: 0 };

const NOTE = "Short-term memory, entries 121–160, 1,840 tokens";

type CheckpointView = {
  readonly isDebug: boolean;
  readonly isFolded: boolean;
  readonly areFilesFolded: boolean;
  readonly checkpoint: CheckpointMessage;
};

const checkpointState = (name: string, view: CheckpointView): EntryState => ({
  name,
  fill: "width",
  view: withRoles((color) => (
    <box paddingX={2} flexDirection="column">
      <Turn color={color} prompt={BOOT.prompt} frame={frameAt(BOOT, durationOf(BOOT))} />
      <Show when={view.isDebug}>
        <box paddingTop={1}>
          <NoteLine color={color} text={NOTE} />
        </box>
      </Show>
      <Checkpoint
        color={color}
        checkpoint={view.checkpoint}
        isDebug={view.isDebug}
        isFolded={view.isFolded}
        onToggle={() => {}}
      />
      <Show when={view.isDebug && view.checkpoint.restored > 0}>
        <RestoredLine
          color={color}
          restored={RESTORED}
          isFolded={view.areFilesFolded}
          onToggle={() => {}}
        />
      </Show>
      <Turn color={color} prompt={FIX.prompt} frame={frameAt(FIX, momentOf(FIX, 0, 0.6))} />
    </box>
  )),
});

export const TRANSCRIPT_COMPONENTS: Section = {
  title: "Transcript",
  entries: [
    {
      id: "transcript-turn",
      title: "Turn",
      states: [
        momentState("Thinking", ASK, momentOf(ASK, 0, 0.7)),
        momentState("Saying", ASK, momentOf(ASK, 1, 0.6)),
        momentState("Reading", ASK, momentOf(ASK, 2, 0.5)),
        momentState("Drafting questions", ASK, closeMomentOf(ASK, 0.6)),
        momentState("Questions asked", ASK, durationOf(ASK)),
        momentState("Answers sent", FIX, momentOf(FIX, 0, 0.6)),
        momentState("Editing", FIX, momentOf(FIX, 4, 0.8)),
        momentState("Saying", FIX, momentOf(FIX, 5, 0.6)),
        momentState("Running tests", FIX, momentOf(FIX, 6, 0.7)),
        momentState("Checks", FIX, momentOf(FIX, 7, 0.7)),
        momentState("Answering", FIX, closeMomentOf(FIX, 0.4)),
        momentState("Finished", FIX, durationOf(FIX)),
      ],
    },
    {
      id: "transcript-work",
      title: "Work rows",
      states: [workState("Current", 0), workState("Left behind", 1)],
    },
    {
      id: "transcript-notice",
      title: "Notice",
      states: [noticeState(MODEL_ERROR), ...NOTICES.map(noticeState), copiedNoticeState],
    },
    {
      id: "transcript-checkpoint",
      title: "Checkpoint",
      states: [
        checkpointState("Checkpoint", {
          isDebug: false,
          isFolded: true,
          areFilesFolded: true,
          checkpoint: CHECKPOINT,
        }),
        checkpointState("Debug view", {
          isDebug: true,
          isFolded: true,
          areFilesFolded: true,
          checkpoint: CHECKPOINT,
        }),
        checkpointState("Debug view, handoff unfolded", {
          isDebug: true,
          isFolded: false,
          areFilesFolded: true,
          checkpoint: CHECKPOINT,
        }),
        checkpointState("Debug view, files unfolded", {
          isDebug: true,
          isFolded: true,
          areFilesFolded: false,
          checkpoint: CHECKPOINT,
        }),
        checkpointState("Automatic, no files, debug view", {
          isDebug: true,
          isFolded: true,
          areFilesFolded: true,
          checkpoint: AUTOMATIC,
        }),
      ],
    },
    {
      id: "transcript-approval-answer",
      title: "Approval answer (debug)",
      states: [answerState(ANSWERS[0]), ...ANSWERS.slice(1).map(answerState)],
    },
  ],
};

const PLAYING = [ASK, FIX];

export const TRANSCRIPT_SCREENS: Section = {
  title: "Transcript",
  entries: [
    {
      id: "transcript",
      title: "Session",
      states: [
        {
          name: "Playing",
          fill: "screen",
          view: withRoles((color) => (
            <Playback color={color} finished={[BOOT]} playing={PLAYING} />
          )),
        },
        {
          name: "Finished",
          fill: "screen",
          view: withRoles((color) => (
            <Conversation
              color={color}
              finished={[BOOT]}
              playing={PLAYING}
              ms={sessionDurationOf(PLAYING)}
            />
          )),
        },
      ],
    },
  ],
};
