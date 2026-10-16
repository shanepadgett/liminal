/**
 * The transcript styles: three modeled on harnesses that show a session their own way, and
 * Liminal's.
 */

import type { EntryKind } from "./entries.ts";
import type { GroupRule, Level, Phase, Style } from "./levels.ts";

/** The same value in both phases. */
const always = <Value>(value: Value): Readonly<Record<Phase, Value>> => ({
  working: value,
  done: value,
});

/** Like Pi: every entry draws its whole block. */
export const FULL: Style = {
  name: "Full",
  levels: {
    thinking: always("full"),
    interim: always("full"),
    answer: always("full"),
    worked: always("hidden"),
    read: always("full"),
    edit: always("full"),
    run: always("full"),
    search: always("full"),
    checks: always("full"),
    ask: always("full"),
  },
  groups: always([]),
};

/** Reading and searching, folded into one line. */
export const EXPLORED: GroupRule = {
  kinds: ["read", "search"],
  heading: { kind: "label", text: "Explored" },
  inner: [],
};

/** Like Grok Build: one line per action, each opening to its block, with exploring folded. */
export const FOLDED: Style = {
  name: "Folded",
  levels: {
    thinking: always("line"),
    interim: always("full"),
    answer: always("full"),
    worked: always("hidden"),
    read: always("line"),
    edit: always("line"),
    run: always("line"),
    search: always("line"),
    checks: always("line"),
    ask: always("full"),
  },
  groups: always([EXPLORED]),
};

/** Shown only as the current action while working, then gone once the turn is done. */
const LIVE_THEN_GONE: Readonly<Record<Phase, Level>> = { working: "live", done: "hidden" };

/** Like Codex: one live line while working, then how long it took and the answer. */
export const QUIET: Style = {
  name: "Quiet",
  levels: {
    thinking: LIVE_THEN_GONE,
    interim: LIVE_THEN_GONE,
    answer: always("full"),
    worked: always("full"),
    read: LIVE_THEN_GONE,
    edit: LIVE_THEN_GONE,
    run: LIVE_THEN_GONE,
    search: LIVE_THEN_GONE,
    checks: LIVE_THEN_GONE,
    ask: { working: "full", done: "hidden" },
  },
  groups: always([]),
};

/** The work a step folds: thinking and every tool that does not wait on the user. */
const STEP_KINDS: readonly EntryKind[] = ["thinking", "read", "edit", "run", "search", "checks"];

/** The work between two prose entries, tallied on one line. Prose and questions end a step. */
export const STEP: GroupRule = { kinds: STEP_KINDS, heading: { kind: "tally" }, inner: [] };

/** A finished turn's work log: prose alternating with one tallied line per step of work. */
export const LIMINAL_LOG: Style = {
  name: "Liminal log",
  levels: { ...FOLDED.levels, worked: always("full") },
  groups: always([STEP]),
};

/**
 * Liminal's own: one live line while working, the assistant's words between actions, and the answer
 * after how long it worked. Checks keep their last run; questions always show. The `worked` line
 * opens to the turn's work log.
 */
export const LIMINAL: Style = {
  name: "Liminal",
  levels: {
    thinking: LIVE_THEN_GONE,
    interim: always("full"),
    answer: always("full"),
    worked: always("full"),
    read: LIVE_THEN_GONE,
    edit: LIVE_THEN_GONE,
    run: LIVE_THEN_GONE,
    search: LIVE_THEN_GONE,
    checks: { working: "live", done: "latest" },
    ask: always("full"),
  },
  groups: always([]),
  log: LIMINAL_LOG,
};
