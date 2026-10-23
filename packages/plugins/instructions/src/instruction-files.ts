/**
 * The `instruction-files` section: the `always` files' text, then the `read-when` files by path and
 * situation for the model to read when it needs them. Files come from the global and the project
 * `instructions/` folders; a project file replaces a global one of the same name.
 */
import { Effect, Option } from "effect";

import type { Directories } from "@shanepadgett/liminal-directories/contract";
import type { SessionId } from "@shanepadgett/liminal-session/contract";

import { readFiles, type Reader, taggedTexts } from "./files.ts";
import { type Instruction, parseInstruction } from "./front-matter.ts";
import type { Tell } from "./tell.ts";

const FOLDER = "instructions";

const INTRO =
  "Instruction files for situations. Read a file just before acting in its situation, not while exploring:";

export interface InstructionFiles {
  readonly reader: Reader;
  readonly directories: Directories["Service"];
  readonly tell: Tell;
}

/** The `.md` files in `folder` by name; none when it is missing. */
const markdownIn = ({ fs, path }: Reader, folder: string) =>
  fs.readDirectory(folder).pipe(
    Effect.map((names) =>
      names.flatMap((name) =>
        name.endsWith(".md") ? [[name, path.join(folder, name)] as const] : [],
      ),
    ),
    Effect.orElseSucceed(() => []),
  );

/** Each name's nearest file, by name. */
const pathsOf = Effect.fn("pathsOf")(function* (
  reader: Reader,
  { global, project }: Directories["Service"],
) {
  const found = yield* Effect.forEach([global, project], (folder) =>
    markdownIn(reader, reader.path.join(folder, FOLDER)),
  );

  const byName = new Map(found.flat());

  return [...byName.keys()].toSorted().flatMap((name) => byName.get(name) ?? []);
});

const render = (instructions: ReadonlyArray<Instruction>) => {
  const always = instructions.flatMap(({ path, body, rule }) =>
    rule.type === "always" ? [{ path, text: body }] : [],
  );

  const situations = instructions.flatMap(({ path, rule }) =>
    rule.type === "read-when" ? [`- \`${path}\`: ${rule.situation}`] : [],
  );

  const list =
    situations.length === 0
      ? ""
      : `<instruction_files>\n${INTRO}\n${situations.join("\n")}\n</instruction_files>`;

  return [taggedTexts(always), list].filter((text) => text !== "").join("\n\n");
};

export const makeInstructionFiles = ({ reader, directories, tell }: InstructionFiles) =>
  Effect.fn("instructionFiles")(function* (session: SessionId) {
    const { files, problems } = yield* readFiles(reader, yield* pathsOf(reader, directories));
    const parsed = files.map((file) => ({ file, instruction: parseInstruction(file) }));

    const skipped = parsed.flatMap(({ file, instruction }) =>
      Option.isNone(instruction)
        ? [
            `${file.path} is left out of the prompt: its front matter needs \`read-when: <situation>\` or \`always: true\`.`,
          ]
        : [],
    );

    yield* tell(session, [...problems, ...skipped]);

    return render(parsed.flatMap(({ instruction }) => Option.toArray(instruction)));
  });
