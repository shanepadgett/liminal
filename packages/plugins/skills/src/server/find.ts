/**
 * Finding skills: `<name>/SKILL.md` in `~/.agents/skills/` and the global `skills/` folder, then,
 * in a trusted workspace, in `.agents/skills/` and `.liminal/skills/` from the repository root down
 * to the workspace. A nearer skill replaces a farther one of the same name.
 */

import { Effect, type FileSystem, Option, type Path, Result } from "effect";

import {
  type FileText,
  foldersDown,
  readFileTexts,
  splitFrontMatter,
} from "@liminal/context/contract";
import type { Notice } from "@liminal/notices/contract";
import type { Directories, ProjectTrust } from "@liminal/sdk";

const SKILL_FILE = "SKILL.md";

/** One word, so it works as `/<name>` and `@skill:<name>`. */
const NAME_RULE = /^[\w.-]+$/;

export interface Skill {
  readonly name: string;
  readonly description: string;
  /** The `SKILL.md` file. */
  readonly path: string;
  /** Its folder, which holds the files the skill names. */
  readonly folder: string;
  /** The text after the front matter. */
  readonly body: string;
  /** `disable-model-invocation: true`: only the user starts it. */
  readonly isUserOnly: boolean;
}

export interface Finder {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly directories: Directories["Service"];
  readonly trust: ProjectTrust["Service"];
}

/** What a scan found: the skills by name, the problems to tell, and whether a file failed to read. */
export interface SkillScan {
  readonly skills: ReadonlyArray<Skill>;
  readonly problems: ReadonlyArray<Notice>;
  readonly failed: boolean;
}

/** A front matter value without the quotes YAML allows around it. */
const unquoted = (value: string | undefined) =>
  (value ?? "").replace(/^(["'])(.*)\1$/, "$2").trim();

/** The skills folders, most shared first. */
const foldersOf = Effect.fn("skills.folders")(function* ({ fs, path, directories, trust }: Finder) {
  const shared = [
    path.join(directories.home, ".agents", "skills"),
    path.join(directories.global, "skills"),
  ];

  const trusted = yield* trust.trusted.pipe(Effect.orElseSucceed(() => false));
  if (!trusted) return shared;

  const folders = yield* foldersDown(fs, path, directories.workspace);

  const liminal = (folder: string) =>
    folder === path.resolve(directories.workspace)
      ? directories.project
      : path.join(folder, ".liminal");

  return [
    ...shared,
    ...folders.flatMap((folder) => [
      path.join(folder, ".agents", "skills"),
      path.join(liminal(folder), "skills"),
    ]),
  ];
});

/** The `SKILL.md` files under `folder`, by skill folder name; none when it is missing. */
const skillFilesIn = ({ fs, path }: Finder, folder: string) =>
  fs.readDirectory(folder).pipe(
    Effect.map((names) => names.toSorted().map((name) => path.join(folder, name, SKILL_FILE))),
    Effect.orElseSucceed((): ReadonlyArray<string> => []),
  );

/** The file as a skill, or the problem with it. */
export const parseSkill = (path: Path.Path, file: FileText): Result.Result<Skill, string> => {
  const split = splitFrontMatter(file.text);
  if (Option.isNone(split)) return Result.fail("it has no front matter.");

  const { pairs, body } = split.value;
  const folder = path.dirname(file.path);
  const description = unquoted(pairs.get("description")).replaceAll(/\s+/g, " ");
  if (description === "") return Result.fail("its front matter has no `description`.");

  const name = unquoted(pairs.get("name")) || path.basename(folder);
  if (!NAME_RULE.test(name)) return Result.fail(`its name "${name}" is not one word.`);

  const isUserOnly = pairs.get("disable-model-invocation") === "true";

  return Result.succeed({ name, description, path: file.path, folder, body, isUserOnly });
};

const unreadable = ({ path, message }: { readonly path: string; readonly message: string }) =>
  ({
    kind: "warning",
    title: "Couldn't read a skill",
    body: `${path}: ${message}`,
  }) satisfies Notice;

const skipped = (path: string, problem: string) =>
  ({ kind: "warning", title: "Skipped a skill", body: `${path}: ${problem}` }) satisfies Notice;

export const scanSkills = Effect.fn("skills.scan")(function* (finder: Finder) {
  const folders = yield* foldersOf(finder);
  const paths = yield* Effect.forEach(folders, (folder) => skillFilesIn(finder, folder));
  const { files, failed } = yield* readFileTexts(finder.fs, paths.flat());
  const parsed = files.map((file) => ({ file, result: parseSkill(finder.path, file) }));
  const byName = new Map<string, Skill>();

  for (const { result } of parsed) {
    if (Result.isSuccess(result)) {
      byName.delete(result.success.name);
      byName.set(result.success.name, result.success);
    }
  }

  const found: SkillScan = {
    skills: [...byName.values()],
    problems: [
      ...failed.map(unreadable),
      ...parsed.flatMap(({ file, result }) =>
        Result.isFailure(result) ? [skipped(file.path, result.failure)] : [],
      ),
    ],
    failed: failed.length > 0,
  };

  return found;
});

/** The skill as the model reads it when the user starts or tags it. */
export const skillText = (skill: Skill) =>
  [
    `<skill name="${skill.name}" path="${skill.path}">`,
    `This is all of the skill's ${SKILL_FILE}; don't read it again. Files it names are in ${skill.folder}.`,
    "",
    skill.body,
    "</skill>",
  ].join("\n");
