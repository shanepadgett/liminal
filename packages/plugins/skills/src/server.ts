/**
 * Skills' server: the list the model sees, the `@skill:` tag source, and starting a skill as the
 * user's message. Skills are found again on every use; problems tell the session once.
 */

import { Effect, FileSystem, Option, Path } from "effect";

import {
  definePromptSection,
  filesRead,
  Lines,
  linesRender,
  PromptSections,
} from "@liminal/context/contract";
import { Inbox, offerTagSource } from "@liminal/inbox/contract";
import { makeProblemNotices } from "@liminal/notices/contract";
import { Directories, draft, type ModelPart, ProjectTrust } from "@liminal/sdk";
import { SessionLog, UserEntry } from "@liminal/session-log/contract";

import { SkillsRpcs, UnknownSkill } from "./contract.ts";
import { type Skill, scanSkills, skillText } from "./server/find.ts";
import type { Finder } from "./server/folders.ts";
import { makeSkillManagement } from "./server/remove.ts";
import { makeSkillTags } from "./server/tags.ts";

/** After the instruction files' sections. */
const SECTION_ORDER = 300;

/** After files' and references' sources. */
const TAG_ORDER = 20;

const guidance =
  "Instructions for particular tasks. When a task matches a skill, read its SKILL.md with "
  + "the read tool before starting; files it names sit beside it:";

const textPart = (text: string): ModelPart => ({ type: "text", text, providerData: {} });

/** `/<name> args`: the user sees what they typed; the model reads the skill, then the args. */
const useDraft = (skill: Skill, args: string) => {
  const typed = args.trim();
  const shown = typed === "" ? `/${skill.name}` : `/${skill.name} ${typed}`;
  const parts = [textPart(skillText(skill)), ...(typed === "" ? [] : [textPart(typed)])];

  return {
    text: shown,
    draft: draft(UserEntry, {
      data: { text: shown },
      model: [{ role: "user", parts }],
      text: shown,
    }),
  };
};

const make = Effect.gen(function* () {
  const inbox = yield* Inbox;
  const tell = yield* makeProblemNotices(yield* SessionLog);

  const finder: Finder = {
    fs: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    directories: yield* Directories,
    trust: yield* ProjectTrust,
  };

  const skills = Effect.map(scanSkills(finder), ({ skills: found }) => found);
  const management = yield* makeSkillManagement(finder);

  yield* (yield* PromptSections).register(
    definePromptSection<Lines>({
      key: "skills/list",
      order: SECTION_ORDER,
      codec: Lines,
      read: ({ sessionId }) =>
        scanSkills(finder).pipe(
          Effect.tap((found) => tell(sessionId, found.problems)),
          Effect.map(({ skills: found, failed }) =>
            filesRead(
              found.flatMap((skill) =>
                skill.isUserOnly
                  ? []
                  : [`\`${skill.name}\` (\`${skill.path}\`): ${skill.description}`],
              ),
              failed,
            ),
          ),
        ),
      render: linesRender({
        tag: "skills",
        intro: guidance,
        added: "More skills:",
        removed: "These skills are gone; stop using them:",
      }),
    }),
  );

  yield* offerTagSource(makeSkillTags(skills), TAG_ORDER);

  const named = (name: string) =>
    Effect.flatMap(skills, (found) =>
      Effect.fromOption(Option.fromUndefinedOr(found.find((skill) => skill.name === name))).pipe(
        Effect.mapError(() => new UnknownSkill({ skill: name })),
      ),
    );

  return SkillsRpcs.of({
    "skills/inventory": management.inventory,
    "skills/delete": management.remove,
    "skills/list": () =>
      Effect.map(skills, (found) =>
        found
          .map(({ name, description }) => ({ name, description }))
          .toSorted((a, b) => a.name.localeCompare(b.name)),
      ),
    "skills/use": ({ session, name, args }) =>
      Effect.flatMap(named(name), (skill) =>
        inbox.sendDraft(session, useDraft(skill, args), "follow-up"),
      ),
  });
});

export const layer = SkillsRpcs.toLayer(make);
