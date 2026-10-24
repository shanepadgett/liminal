/**
 * The vocabulary file, `.liminal/vocabulary.json`: read whole, changed one change at a time, and
 * written to a temporary file renamed over the old one, so a crash never leaves half a file.
 */
import { Effect, FileSystem, Path, Schema, Semaphore } from "effect";

import { Directories } from "@shanepadgett/liminal-directories/contract";

/** One agreed term and what it means in this project. */
export const Term = Schema.Struct({ term: Schema.String, definition: Schema.String });

export type Term = typeof Term.Type;

export type Terms = ReadonlyArray<Term>;

const VocabularyFile = Schema.Struct({ terms: Schema.Array(Term) });

const decodeFile = Schema.decodeUnknownEffect(Schema.fromJsonString(VocabularyFile));

/** The file could not be read or written, or holds something else; `message` says what to do. */
export class VocabularyFailed extends Schema.TaggedError<
  VocabularyFailed,
  { readonly brand: unique symbol }
>()("VocabularyFailed", { message: Schema.String }) {}

/** A term or definition on one line with single spaces. */
export const tidy = (text: string) => text.trim().replaceAll(/\s+/g, " ");

/** Terms match whatever their case. */
export const isSameTerm = (first: string, second: string) =>
  first.toLowerCase() === second.toLowerCase();

const sorted = (terms: Terms): Terms =>
  terms.toSorted((first, second) =>
    first.term.toLowerCase().localeCompare(second.term.toLowerCase(), "en"),
  );

/** The first term an earlier term already names. */
const duplicateOf = (terms: Terms) =>
  terms.find((each, index) =>
    terms.some((other, at) => at < index && isSameTerm(other.term, each.term)),
  );

export const makeStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* Directories;
  const lock = yield* Semaphore.make(1);
  const file = path.join(directories.project, "vocabulary.json");

  const failed = (what: string) => (cause: { readonly message: string }) =>
    new VocabularyFailed({ message: `${what} ${file}: ${cause.message}` });

  const load = Effect.gen(function* () {
    if (!(yield* fs.exists(file))) return [];

    const { terms } = yield* decodeFile(yield* fs.readFileString(file));

    return terms;
  }).pipe(Effect.mapError(failed("Could not read")));

  /** The terms, sorted; none while the file is missing. */
  const read = Effect.gen(function* () {
    const terms = yield* load;
    const duplicate = duplicateOf(terms);

    if (duplicate !== undefined)
      return yield* new VocabularyFailed({
        message: `${file} lists "${duplicate.term}" twice. Remove one by hand.`,
      });

    return sorted(terms);
  });

  const save = (terms: Terms) =>
    Effect.gen(function* () {
      const temporary = `${file}.tmp`;
      const text = `${JSON.stringify({ terms: sorted(terms) }, null, 2)}\n`;

      yield* fs.makeDirectory(directories.project, { recursive: true });
      yield* fs.writeFileString(temporary, text);

      yield* fs.rename(temporary, file);
    }).pipe(Effect.mapError(failed("Could not write")));

  /** Saves what `change` makes of the current terms; one change at a time. */
  const update = <E>(change: (terms: Terms) => Effect.Effect<Terms, E>) =>
    lock.withPermit(
      Effect.gen(function* () {
        const changed = yield* change(yield* read);
        yield* save(changed);
      }),
    );

  return { file, read, update };
});

export type Store = Effect.Success<typeof makeStore>;
