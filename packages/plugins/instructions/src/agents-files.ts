/** The `agents-files` section: every `AGENTS.md`, most shared first, once the setting turns it on. */
import { Effect } from "effect";

import { type Directories, foldersDown } from "@shanepadgett/liminal-directories/contract";
import type { SessionId } from "@shanepadgett/liminal-session/contract";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import { readFiles, type Reader, taggedTexts } from "./files.ts";
import { InstructionsSetting } from "./setting.ts";
import type { Tell } from "./tell.ts";

const FILE = "AGENTS.md";

export interface AgentsFiles {
  readonly reader: Reader;
  readonly settings: Settings["Service"];
  readonly directories: Directories["Service"];
  readonly home: string;
  readonly tell: Tell;
}

export const makeAgentsFiles = (services: AgentsFiles) =>
  Effect.fn("agentsFiles")(function* (session: SessionId) {
    const { reader, settings, directories, home, tell } = services;
    const { path } = reader;

    const setting = yield* settings
      .get(InstructionsSetting)
      .pipe(
        Effect.catchTag("SettingsInvalid", (error) =>
          Effect.as(
            tell(session, [
              `AGENTS.md files are left out of the prompt because the instructions setting is invalid: ${error.message}`,
            ]),
            { agentsFiles: false },
          ),
        ),
      );

    if (setting.agentsFiles !== true) return "";

    const paths = [
      path.join(home, ".agents", FILE),
      path.join(directories.global, FILE),
      ...foldersDown(path, directories).map((folder) => path.join(folder, FILE)),
    ];

    const { files, problems } = yield* readFiles(reader, paths);
    yield* tell(session, problems);

    return taggedTexts(files);
  });
