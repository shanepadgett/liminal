/**
 * Environment's server: the `environment` section, read again on every request, and the Session
 * section's stream.
 */

import { Effect, FileSystem, Layer, Path } from "effect";

import { CommandRunner } from "@liminal/command-runner/contract";
import {
  definePromptSection,
  missing,
  PromptSections,
  type PromptSectionDefinition,
  type SectionRead,
  titled,
  wrapped,
} from "@liminal/context/contract";
import { Directories } from "@liminal/sdk";

import { EnvironmentRpcs } from "./contract.ts";
import { Environment } from "./server/environment.ts";
import { factLines } from "./server/facts.ts";
import { fileLines } from "./server/files.ts";
import { watchSession } from "./server/session.ts";
import type { Workspace } from "./server/workspace.ts";

/** The facts, then the workspace root's entries under a title. */
const environmentText = ({ facts, files }: Environment) =>
  wrapped("environment", [...facts, ...titled("Workspace root:", files)].join("\n"));

const render: PromptSectionDefinition<Environment>["render"] = {
  initial: environmentText,
  changed: (before, after) =>
    [
      ...titled("The environment changed:", missing(after.facts, before.facts)),
      ...titled("Files added:", missing(after.files, before.files)),
      ...titled("Files removed:", missing(before.files, after.files)),
    ].join("\n\n"),
};

/** The facts and the root listing; a failed read keeps the saved value. */
const readEnvironment = (workspace: Workspace) =>
  Effect.all({ facts: factLines(workspace), files: fileLines(workspace) }).pipe(
    Effect.map((value): SectionRead<Environment> => ({ type: "present", value })),
    Effect.orElseSucceed((): SectionRead<Environment> => ({ type: "unavailable" })),
  );

/** The services the sections and the Session stream read the workspace through. */
const workspaceOf = Effect.gen(function* () {
  return {
    fs: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    runner: yield* CommandRunner,
    folder: (yield* Directories).workspace,
  } satisfies Workspace;
});

const rpcs = EnvironmentRpcs.toLayer(
  Effect.gen(function* () {
    const workspace = yield* workspaceOf;
    const { home } = yield* Directories;

    return EnvironmentRpcs.of({ "environment/session": () => watchSession(workspace, home) });
  }),
);

const sectionsLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sections = yield* PromptSections;
    const workspace = yield* workspaceOf;

    yield* sections.register(
      definePromptSection<Environment>({
        key: "environment",
        order: 100,
        codec: Environment,
        read: () => readEnvironment(workspace),
        render,
      }),
    );
  }),
);

export const layer = Layer.mergeAll(sectionsLayer, rpcs);
