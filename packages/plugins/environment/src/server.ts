/** Environment's server: the facts and files sections, read again on every request. */

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

import { factLines } from "./server/facts.ts";
import { fileLines } from "./server/files.ts";
import type { Workspace } from "./server/workspace.ts";

/** The lines as a present section; a failed read keeps the saved value. */
const present = <E>(lines: Effect.Effect<Lines, E>) =>
  lines.pipe(
    Effect.map((value): SectionRead<Lines> => ({ type: "present", value })),
    Effect.orElseSucceed((): SectionRead<Lines> => ({ type: "unavailable" })),
  );

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sections = yield* PromptSections;
    const path = yield* Path.Path;

    const workspace: Workspace = {
      fs: yield* FileSystem.FileSystem,
      path,
      runner: yield* CommandRunner,
      folder: (yield* Directories).workspace,
    };

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
