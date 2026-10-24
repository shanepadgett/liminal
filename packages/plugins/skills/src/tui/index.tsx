/**
 * Skills' `tui` entry: the `$` draft trigger. Its menu lists the skills, loaded each time it opens;
 * enter or tab puts `$name` in the draft.
 */
import { Effect, Layer } from "effect";
import fuzzysort from "fuzzysort";

import {
  type DraftRow,
  DraftTriggers,
  type DraftKey,
  type OpenTrigger,
  writeMark,
} from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import { Colors } from "@shanepadgett/liminal-tui";

import { type SkillSummary, SkillsRpc } from "../contract.ts";

/** How many rows the menu holds. */
const MAX_ROWS = 50;

const listSkills = Effect.gen(function* () {
  const skills = yield* (yield* Host).client(SkillsRpc);

  return yield* skills["skills/list"]();
}).pipe(Effect.scoped);

/** `matches` index the name; the label starts with `$`. */
const rowOf = (skill: SkillSummary, matches: ReadonlyArray<number>): DraftRow => ({
  id: skill.name,
  label: `$${skill.name}`,
  detail: skill.description,
  matches: matches.map((at) => at + 1),
});

/** Rows for what follows `$`: every skill by name, or the `fuzzysort` matches best first. */
const rowsOf = (skills: ReadonlyArray<SkillSummary>, query: string): ReadonlyArray<DraftRow> => {
  if (query === "") {
    return skills
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS)
      .map((skill) => rowOf(skill, []));
  }

  return fuzzysort
    .go(query, skills, { key: "name", limit: MAX_ROWS })
    .map((result) => rowOf(result.obj, result.indexes));
};

const make = Effect.gen(function* () {
  const host = yield* Host;
  const colors = yield* Colors;

  const use: DraftKey["run"] = (row, draft, token) => {
    writeMark(draft, token, `$${row.id}`, colors.syntax());
  };

  const open = Effect.map(Effect.provideService(listSkills, Host, host), (skills): OpenTrigger => ({
    rows: (query) => rowsOf(skills, query),
    empty: "No skills match",
    keys: [
      { key: "return", title: "Use skill", run: use },
      { key: "tab", title: "Complete", hint: "complete", run: use },
    ],
  }));

  yield* (yield* DraftTriggers).add({ char: "$", where: "any-word", open });
});

export default definePlugin({
  name: "skills-tui",
  provides: [],
  requires: [Host, Colors, DraftTriggers],
  layer: Layer.effectDiscard(make),
});
