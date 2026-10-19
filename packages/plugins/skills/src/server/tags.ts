/** The `@` tag source for skills: `@skill:<name>` adds the skill's text to the message. */

import { Effect, Option } from "effect";

import { ranked, type TagRow, type TagSource, TagText } from "@liminal/inbox/contract";

import { type Skill, skillText } from "./find.ts";

const PREFIX = "skill:";

export const makeSkillTags = (skills: Effect.Effect<ReadonlyArray<Skill>>): TagSource => ({
  find: (query) =>
    Effect.map(skills, (found) =>
      ranked(
        found.map(({ name }) => `${PREFIX}${name}`),
        query,
      ).map((tag): TagRow => ({ kind: "skill", path: tag, tag, note: "skill" })),
    ),
  attach: (tag) =>
    tag.startsWith(PREFIX)
      ? Effect.map(skills, (found) =>
          Option.map(
            Option.fromUndefinedOr(found.find(({ name }) => name === tag.slice(PREFIX.length))),
            (skill) => TagText.make({ text: skillText(skill) }),
          ),
        )
      : Effect.succeedNone,
});
