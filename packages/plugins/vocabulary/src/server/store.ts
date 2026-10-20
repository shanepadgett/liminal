/**
 * The vocabulary file: read whole, changed under a lock and written by renaming a finished copy
 * over it. An untrusted folder's file is not read and cannot be written.
 */

import { Effect, FileSystem, Path, Result, Schema, Semaphore } from "effect";

import { Directories, ProjectTrust } from "@liminal/sdk";

import { VocabularyFile, vocabularyFile } from "../contract.ts";
import { type Change, duplicateOf, type Terms } from "./terms.ts";

/** The file could not be read or written, or holds something else; `message` says what to do. */
export class VocabularyError extends Schema.TaggedError<
  VocabularyError,
  { readonly brand: unique symbol }
>()("VocabularyError", { message: Schema.String }) {}

const decodeFile = Schema.decodeUnknownEffect(Schema.fromJsonString(VocabularyFile));

const untrustedMessage =
  "This folder is not trusted, so its vocabulary is not used. Ask the user to trust the folder.";

export const makeStore = Effect.fn("vocabulary.makeStore")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* Directories;
  const trust = yield* ProjectTrust;
  const lock = yield* Semaphore.make(1);
  const file = path.join(directories.project, vocabularyFile);

  const isTrusted = trust.trusted.pipe(Effect.orElseSucceed(() => false));

  const failed = (what: string) => (cause: { readonly message: string }) =>
    new VocabularyError({ message: `${what} ${file}: ${cause.message}` });

  const load = Effect.gen(function* () {
    if (!(yield* fs.exists(file))) return [];

    const text = yield* fs.readFileString(file);
    const { terms } = yield* decodeFile(text);
    const duplicate = duplicateOf(terms);

    if (duplicate !== undefined)
      return yield* new VocabularyError({
        message: `${file} lists "${duplicate.term}" twice. Remove one by hand.`,
      });

    return terms;
  }).pipe(Effect.mapError(failed("Could not read")));

  const save = (terms: Terms) =>
    Effect.gen(function* () {
      const temporary = `${file}.tmp`;
      yield* fs.makeDirectory(directories.project, { recursive: true });
      yield* fs.writeFileString(temporary, `${JSON.stringify({ terms }, null, 2)}\n`);
      yield* fs.rename(temporary, file);
    }).pipe(Effect.mapError(failed("Could not write")));

  /** The terms; none while the folder is untrusted. */
  const read: Effect.Effect<Terms, VocabularyError> = Effect.flatMap(isTrusted, (trusted) =>
    trusted ? load : Effect.succeed([]),
  );

  /** Applies `change` to the current terms and saves what it gives; one change at a time. */
  const update = (change: (terms: Terms) => Change) =>
    lock.withPermit(
      Effect.gen(function* () {
        if (!(yield* isTrusted)) return yield* new VocabularyError({ message: untrustedMessage });

        const changed = change(yield* load);

        const terms = yield* Result.match(changed, {
          onFailure: (message) => Effect.fail(new VocabularyError({ message })),
          onSuccess: Effect.succeed,
        });

        yield* save(terms);

        return terms;
      }),
    );

  return { read, update };
});

export type Store = Effect.Success<ReturnType<typeof makeStore>>;
