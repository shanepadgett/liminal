/** The user's instruction files as system prompt sections, and `AGENTS.md` files once turned on. */
import { Config, Effect, FileSystem, Layer, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";
import { Sections } from "@shanepadgett/liminal-system-prompt/contract";

import { makeAgentsFiles } from "./agents-files.ts";
import { makeInstructionFiles } from "./instruction-files.ts";
import { InstructionsSetting } from "./setting.ts";
import { makeTell } from "./tell.ts";

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const directories = yield* Directories;
    const sections = yield* Sections;
    const tell = yield* makeTell(yield* SessionLog);

    const reader = {
      fs: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      workspace: directories.workspace,
    };

    const agentsFiles = makeAgentsFiles({
      reader,
      settings: yield* Settings,
      directories,
      home: yield* Config.String("HOME"),
      tell,
    });

    yield* (yield* DeclaredSettings).add(InstructionsSetting);
    yield* sections.add({ name: "agents-files", text: agentsFiles }, { order: 0 });

    yield* sections.add(
      { name: "instruction-files", text: makeInstructionFiles({ reader, directories, tell }) },
      { order: 10 },
    );
  }),
);

export default definePlugin({
  name: "instructions",
  provides: [],
  requires: [
    Sections,
    Directories,
    Settings,
    DeclaredSettings,
    SessionLog,
    FileSystem.FileSystem,
    Path.Path,
  ],
  layer,
});
