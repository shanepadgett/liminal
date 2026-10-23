/** Reading the text files a section shows, and the path the model is shown for each. */
import { Effect, type FileSystem, type Path } from "effect";

export interface FileText {
  /** The path as the model is shown it. */
  readonly path: string;
  readonly text: string;
}

/** The files that exist, in order, and a problem for each that failed to read. */
export interface FilesRead {
  readonly files: ReadonlyArray<FileText>;
  readonly problems: ReadonlyArray<string>;
}

export interface Reader {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspace: string;
}

/** `file` relative to the workspace when inside it, else whole. */
export const shownPath = ({ path, workspace }: Reader, file: string) =>
  file.startsWith(`${workspace}${path.sep}`) ? path.relative(workspace, file) : file;

type Outcome =
  | { readonly type: "read"; readonly file: FileText }
  | { readonly type: "missing" }
  | { readonly type: "failed"; readonly problem: string };

const readOne = (reader: Reader, file: string) =>
  reader.fs.readFileString(file).pipe(
    Effect.map((text): Outcome => ({
      type: "read",
      file: { path: shownPath(reader, file), text },
    })),
    Effect.catchReason("PlatformError", "NotFound", () =>
      Effect.succeed<Outcome>({ type: "missing" }),
    ),
    Effect.catch((error) =>
      Effect.succeed<Outcome>({
        type: "failed",
        problem: `Couldn't read ${file}, so it is left out of the prompt: ${error.message}. Check the file's permissions.`,
      }),
    ),
  );

export const readFiles = Effect.fn("readFiles")(function* (
  reader: Reader,
  paths: ReadonlyArray<string>,
) {
  const outcomes = yield* Effect.forEach(paths, (file) => readOne(reader, file));

  const read: FilesRead = {
    files: outcomes.flatMap((outcome) => (outcome.type === "read" ? [outcome.file] : [])),
    problems: outcomes.flatMap((outcome) => (outcome.type === "failed" ? [outcome.problem] : [])),
  };

  return read;
});

/** Each file in its own tag, the path as an attribute. */
export const taggedTexts = (files: ReadonlyArray<FileText>) =>
  files
    .flatMap(({ path, text }) =>
      text.trim() === "" ? [] : [`<instructions path="${path}">\n${text.trim()}\n</instructions>`],
    )
    .join("\n\n");
