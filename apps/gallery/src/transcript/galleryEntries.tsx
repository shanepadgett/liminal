/**
 * The transcript in the gallery: the session playing out turn by turn, and its `/qna` turn and fix
 * turn held at each of their moments.
 */

import { withRoles } from "../entryViews.ts";
import type { EntryState, Section } from "../shell/entries.ts";
import { Conversation } from "./Conversation.tsx";
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
