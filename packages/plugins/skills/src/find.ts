/**
 * Finds skills: each direct child folder of a skills folder that holds `SKILL.md`, read from its
 * front matter. Skills folders go farthest first, so the nearest skill of a name wins.
 */
import { Config, Effect, FileSystem, Option, Path, Schema } from "effect";

import { Directories, foldersDown } from "@shanepadgett/liminal-directories/contract";

export interface Skill {
  readonly name: string;
  readonly description: string;
  /** The skill's `SKILL.md`. */
  readonly path: string;
  /** The folder holding `SKILL.md`, which its relative paths start from. */
  readonly folder: string;
  /** False when `disable-model-invocation: true` keeps it off the system prompt's list. */
  readonly listed: boolean;
}

const FILE = "SKILL.md";

const FrontMatter = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.NonEmptyString,
  "disable-model-invocation": Schema.optional(Schema.Boolean),
});

/** The YAML between the opening and closing `---`, and the text after it. */
const FENCED = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const decodeFrontMatter = Schema.decodeUnknownOption(FrontMatter);

/** The YAML as front matter; none when it does not parse or lacks a description. */
const parseYaml = Option.liftThrowable((yaml: string) => decodeFrontMatter(Bun.YAML.parse(yaml)));

/** `text` without its front matter. */
export const bodyOf = (text: string) => text.replace(FENCED, "").trim();

const frontMatterOf = (text: string) =>
  Option.flatMap(Option.fromNullishOr(FENCED.exec(text)?.[1]), (yaml) =>
    Option.flatten(parseYaml(yaml)),
  );

/** Every skills folder, farthest first: the user's two, then each folder down to the workspace. */
const skillsFolders = Effect.gen(function* () {
  const path = yield* Path.Path;
  const directories = yield* Directories;
  const home = yield* Config.String("HOME").pipe(Effect.orDie);

  const folders = [
    path.join(home, ".agents", "skills"),
    path.join(directories.global, "skills"),
    ...foldersDown(path, directories).flatMap((folder) => [
      path.join(folder, ".agents", "skills"),
      path.join(folder, ".liminal", "skills"),
    ]),
  ];

  return [...new Set(folders)];
});

interface Found {
  readonly skill: Skill;
  /** `SKILL.md` with symlinks resolved, so one file reached two ways counts once. */
  readonly real: string;
}

/** The skills folders and a finder for the skills in them. */
export const makeFind = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folders = yield* skillsFolders;

  const readSkill = Effect.fn("skills.readSkill")(function* (folder: string) {
    const file = path.join(folder, FILE);
    const info = yield* Effect.option(fs.stat(file));
    if (Option.isNone(info) || info.value.type !== "File") return Option.none<Found>();

    const read = yield* Effect.option(Effect.all([fs.realPath(file), fs.readFileString(file)]));

    const front = Option.flatMap(read, ([, text]) => frontMatterOf(text));

    if (Option.isNone(read) || Option.isNone(front)) {
      yield* Effect.logWarning(`Skipped skill ${file}: no description, or its front matter is bad`);

      return Option.none<Found>();
    }

    const skill: Skill = {
      name: front.value.name ?? path.basename(folder),
      description: front.value.description.trim(),
      path: file,
      folder,
      listed: front.value["disable-model-invocation"] !== true,
    };

    return Option.some<Found>({ skill, real: read.value[0] });
  });

  const inFolder = Effect.fn("skills.inFolder")(function* (folder: string) {
    const names = yield* fs.readDirectory(folder).pipe(Effect.orElseSucceed(() => []));
    const shown = names.filter((name) => !name.startsWith(".")).toSorted();
    const found = yield* Effect.forEach(shown, (name) => readSkill(path.join(folder, name)));

    return found.flatMap(Option.toArray);
  });

  /** Every skill, by name; of two with one name, the nearest. */
  const find = Effect.map(Effect.forEach(folders, inFolder), (found) => {
    const byFile = new Map(found.flat().map(({ real, skill }) => [real, skill]));
    const byName = new Map([...byFile.values()].map((skill) => [skill.name, skill]));

    return [...byName.values()];
  });

  return { folders, find };
});
