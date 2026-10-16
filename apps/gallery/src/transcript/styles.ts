/** The starting transcript styles, each modeled on a harness that shows a session its own way. */

import type { GroupRule, Level, Phase, Style } from "./levels.ts";

/** The same level in both phases. */
const always = (level: Level): Readonly<Record<Phase, Level>> => ({ working: level, done: level });

/** Like Pi: every entry draws its whole block. */
export const FULL: Style = {
  name: "Full",
  levels: {
    user: always("full"),
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
  groups: [],
};

/** Reading and searching, folded into one line. */
export const EXPLORED: GroupRule = { kinds: ["read", "search"], label: "Explored" };

/** Like Grok Build: one line per action, each opening to its block, with exploring folded. */
export const FOLDED: Style = {
  name: "Folded",
  levels: {
    user: always("full"),
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
  groups: [EXPLORED],
};

/** Shown only as the current action while working, then gone once the turn is done. */
const LIVE_THEN_GONE: Readonly<Record<Phase, Level>> = { working: "live", done: "hidden" };

/** Like Codex: one live line while working, then how long it took and the answer. */
export const QUIET: Style = {
  name: "Quiet",
  levels: {
    user: always("full"),
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
  groups: [],
};
