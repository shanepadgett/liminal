/**
 * References' server: the library of clones in `<data>/references`, each session's attached ones,
 * the prompt section naming them and the `@` tag source for them.
 */

import { Effect, FileSystem, Layer, Path, Stream } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import { PromptSections } from "@liminal/context/contract";
import { offerTagSource } from "@liminal/inbox/contract";
import { Directories } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";

import { AttachedEntry, ReferencesRpcs } from "./contract.ts";
import { makeAttached } from "./server/attached.ts";
import { makeLibrary } from "./server/library.ts";
import { makeReferenceTags } from "./server/tags.ts";

/** After the workspace's files and folders. */
const TAG_ORDER = 10;

const make = Effect.gen(function* () {
  const directories = yield* Directories;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const library = makeLibrary({
    fs: yield* FileSystem.FileSystem,
    path,
    http: yield* HttpClient.HttpClient,
    spawner,
    folder: path.join(directories.data, "references"),
  });

  const attached = yield* makeAttached(yield* SessionLog);

  yield* (yield* EntryKinds).register(AttachedEntry);
  yield* (yield* PromptSections).register(attached.section(library.folder, library.names));

  yield* offerTagSource(
    makeReferenceTags({
      path,
      spawner,
      folder: library.folder,
      home: directories.home,
      names: library.names,
    }),
    TAG_ORDER,
  );

  // Clones made by hand or by another tool get GitHub's description in the background.
  yield* Effect.forkScoped(library.fillDescriptions);

  return ReferencesRpcs.of({
    "references/list": () => library.list,
    "references/attached": ({ session }) =>
      attached
        .watch(session)
        .pipe(
          Stream.catch((error) =>
            Stream.fromEffect(Effect.logWarning(`references ended: ${error.message}`)).pipe(
              Stream.drain,
            ),
          ),
        ),
    "references/attach": ({ session, names }) => attached.attach(session, names),
    "references/clone": ({ url }) => library.clone(url),
    "references/pull": ({ name }) => library.pull(name),
    "references/branches": ({ name }) => library.branches(name),
    "references/switch": ({ name, branch }) => library.switchBranch(name, branch),
    "references/remove": ({ name }) => library.remove(name),
    "references/open": ({ name }) => library.open(name),
  });
});

export const layer = ReferencesRpcs.toLayer(make).pipe(Layer.provide(FetchHttpClient.layer));
