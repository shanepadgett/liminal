/**
 * Skills: the system prompt section listing them, the `loop/Send` step that adds each `$name`
 * skill's file to the message that names it, and read access to every skills folder. The `tui`
 * entry adds the `$` draft trigger.
 */
import { Effect, FileSystem, Layer, Option, Path } from "effect";

import { AllowedFolders } from "@shanepadgett/liminal-approvals/contract";
import { Attribute, definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { History } from "@shanepadgett/liminal-history/contract";
import { Added, addedOf, type Input, Send } from "@shanepadgett/liminal-loop/contract";
import type { Message } from "@shanepadgett/liminal-model/contract";
import { MessageEvent, type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import { Sections } from "@shanepadgett/liminal-system-prompt/contract";

import { SkillsRpc, skillsIn } from "./contract.ts";
import { bodyOf, makeFind, type Skill } from "./find.ts";

/** The section: each listed skill's name, description and file; empty when none is listed. */
const listText = (skills: ReadonlyArray<Skill>) => {
  const listed = skills.filter((skill) => skill.listed);
  if (listed.length === 0) return "";

  return [
    "<skills>",
    "When a task matches a skill's description, read its file before you start.",
    "",
    ...listed.map(({ name, description, path }) => `- ${name}: ${description} (${path})`),
    "</skills>",
  ].join("\n");
};

/** How a sent skill starts, which is how a later send sees it is already there. */
const opening = (skill: Skill) => `<skill name="${skill.name}" path="${skill.path}">`;

const skillText = (skill: Skill, text: string) =>
  [
    opening(skill),
    `Loaded in full; don't read it again. Paths are relative to ${skill.folder}.`,
    "",
    bodyOf(text),
    "</skill>",
  ].join("\n");

const textOf = (messages: ReadonlyArray<Message>) =>
  messages
    .flatMap(({ parts }) => parts.flatMap((part) => (part.type === "text" ? [part.text] : [])))
    .join("\n");

/** A user message's input with one text part per skill it names that the model has not seen. */
const makeWithSkills = (find: Effect.Effect<ReadonlyArray<Skill>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const log = yield* SessionLog;
    const history = yield* History;

    /** The named skills, each read now; a skill whose file cannot be read is left out. */
    const readNamed = Effect.fn("skills.readNamed")(function* (names: ReadonlyArray<string>) {
      const skills = new Map((yield* find).map((skill) => [skill.name, skill]));

      const known = names.flatMap((name) =>
        Option.toArray(Option.fromUndefinedOr(skills.get(name))),
      );

      const read = yield* Effect.forEach(known, (skill) =>
        Effect.map(
          Effect.option(fs.readFileString(skill.path)),
          Option.map((text) => ({ skill, text })),
        ),
      );

      return read.flatMap(Option.toArray);
    });

    return Effect.fn("skills.withSkills")(function* (session: SessionId, input: Input) {
      const message = Option.flatten(yield* Effect.option(MessageEvent.decode(input)));
      if (Option.isNone(message) || message.value.role !== "user") return input;

      const names = skillsIn(textOf([message.value]));
      if (names.length === 0) return input;

      const seen = textOf(yield* history.run(yield* log.read(session)));
      const read = yield* readNamed(names);
      const fresh = read.filter(({ skill }) => !seen.includes(opening(skill)));
      if (fresh.length === 0) return input;

      const attributes = yield* Attribute.set(
        input.attributes,
        Added,
        addedOf(input.attributes) + fresh.length,
      );

      const parts = fresh.map(({ skill, text }) => ({
        type: "text" as const,
        text: skillText(skill, text),
      }));

      return yield* MessageEvent.make(
        { ...message.value, parts: [...message.value.parts, ...parts] },
        attributes,
      );
    });
  });

const steps = Layer.effectDiscard(
  Effect.gen(function* () {
    const { folders, find } = yield* makeFind;

    yield* (yield* Sections).add(
      { name: "skills", text: () => Effect.map(find, listText) },
      { order: 20 },
    );

    const allowed = yield* AllowedFolders;
    yield* Effect.forEach(folders, (path) => allowed.add({ path, access: "read" }));

    const withSkills = yield* makeWithSkills(find);

    yield* (yield* Send).wrap((request, next) =>
      Effect.flatMap(withSkills(request.session, request.input), (input) =>
        next({ ...request, input }),
      ),
    );
  }),
);

const rpc = SkillsRpc.toLayer(
  Effect.map(makeFind, ({ find }) =>
    SkillsRpc.of({
      "skills/list": () =>
        Effect.map(find, (skills) =>
          skills.map(({ name, description }) => ({ name, description })),
        ),
    }),
  ),
);

export default definePlugin({
  name: "skills",
  provides: [],
  requires: [
    Send,
    Sections,
    AllowedFolders,
    History,
    SessionLog,
    Directories,
    FileSystem.FileSystem,
    Path.Path,
  ],
  layer: Layer.mergeAll(steps, rpc),
  entries: { tui: () => import("./tui/index.tsx") },
});
