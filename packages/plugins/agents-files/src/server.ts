/**
 * Agents files' server: one section holding every `AGENTS.md`, most shared first:
 * `~/.agents/AGENTS.md`, `~/.liminal/AGENTS.md`, then the repository root down to the workspace.
 * Read again on every request; an unreadable file keeps the saved section and tells the session.
 */

import { Effect, FileSystem, Layer, Path } from "effect";

import {
  definePromptSection,
  FileTexts,
  fileTextsRender,
  foldersDown,
  PromptSections,
  filesRead,
  readFileTexts,
} from "@liminal/context/contract";
import { makeProblemNotices } from "@liminal/notices/contract";
import { Directories, type SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

const FILE = "AGENTS.md";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { home, global, workspace } = yield* Directories;
    const tell = yield* makeProblemNotices(yield* SessionLog);

    const paths = Effect.map(foldersDown(fs, path, workspace), (folders) => [
      path.join(home, ".agents", FILE),
      path.join(global, FILE),
      ...folders.map((folder) => path.join(folder, FILE)),
    ]);

    const read = Effect.fn("agents-files.read")(function* (session: SessionId) {
      const { files, failed } = yield* readFileTexts(fs, yield* paths);

      yield* tell(
        session,
        failed.map(({ path: file, message }) => ({
          kind: "warning",
          title: "Couldn't read an AGENTS.md file",
          body: `${file}: ${message}`,
        })),
      );

      return filesRead(files, failed.length > 0);
    });

    yield* (yield* PromptSections).register(
      definePromptSection<FileTexts>({
        key: "agents-files/agents",
        order: 200,
        codec: FileTexts,
        read: ({ sessionId }) => read(sessionId),
        render: fileTextsRender,
      }),
    );
  }),
);
