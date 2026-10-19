/**
 * Environment's server: the facts and files sections, read again on every request, and the Session
 * section's stream.
 */

import { Effect, FileSystem, Layer, Path } from "effect";

import { CommandRunner } from "@liminal/command-runner/contract";
import {
  definePromptSection,
  Lines,
  linesRender,
  PromptSections,
  type SectionRead,
} from "@liminal/context/contract";
import { Directories } from "@liminal/sdk";

import { EnvironmentRpcs } from "./contract.ts";
import { factLines } from "./server/facts.ts";
import { fileLines } from "./server/files.ts";
import { watchSession } from "./server/session.ts";
import type { Workspace } from "./server/workspace.ts";

/** The lines as a present section; a failed read keeps the saved value. */
const present = <E>(lines: Effect.Effect<Lines, E>) =>
  lines.pipe(
    Effect.map((value): SectionRead<Lines> => ({ type: "present", value })),
    Effect.orElseSucceed((): SectionRead<Lines> => ({ type: "unavailable" })),
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
      definePromptSection<Lines>({
        key: "environment/facts",
        order: 100,
        codec: Lines,
        read: () => present(factLines(workspace)),
        render: linesRender({ initial: "Environment:", added: "The environment changed:" }),
      }),
    );

    yield* sections.register(
      definePromptSection<Lines>({
        key: "environment/files",
        order: 110,
        codec: Lines,
        read: () => present(fileLines(workspace)),
        render: linesRender({
          initial: "The workspace, two levels deep:",
          added: "Files added:",
          removed: "Files removed:",
        }),
      }),
    );
  }),
);

export const layer = Layer.mergeAll(sectionsLayer, rpcs);
