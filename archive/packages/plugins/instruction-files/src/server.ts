/**
 * Instruction files' server: the `always` files' text, and the list of `read-when` files under
 * fixed guidance on when to read them. Read again on every request; problems tell the session
 * once.
 */

import { Effect, FileSystem, Layer, Path } from "effect";

import {
  definePromptSection,
  FileTexts,
  fileTextsRender,
  filesRead,
  Lines,
  linesRender,
  PromptSections,
} from "@liminal/context/contract";
import { makeProblemNotices } from "@liminal/notices/contract";
import { Directories, ProjectTrust, type SessionId } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { type Finder, scan } from "./server/files.ts";

const readWhenGuidance =
  "Instruction files for situations. Read a file with the read tool just before acting in its "
  + "situation (editing, writing or running), not while exploring:";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sections = yield* PromptSections;
    const tell = yield* makeProblemNotices(yield* SessionLog);

    const finder: Finder = {
      fs: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      directories: yield* Directories,
      trust: yield* ProjectTrust,
    };

    const scanFor = (session: SessionId) =>
      scan(finder).pipe(Effect.tap((found) => tell(session, found.problems)));

    yield* sections.register(
      definePromptSection<FileTexts>({
        key: "instruction-files/always",
        order: 210,
        codec: FileTexts,
        read: ({ sessionId }) =>
          Effect.map(scanFor(sessionId), ({ instructions, failed }) =>
            filesRead(
              instructions.flatMap(({ path, body, rule }) =>
                rule.type === "always" ? [{ path, text: body }] : [],
              ),
              failed,
            ),
          ),
        render: fileTextsRender("project_instructions"),
      }),
    );

    yield* sections.register(
      definePromptSection<Lines>({
        key: "instruction-files/read-when",
        order: 220,
        codec: Lines,
        read: ({ sessionId }) =>
          Effect.map(scanFor(sessionId), ({ instructions, failed }) =>
            filesRead(
              instructions.flatMap(({ path, rule }) =>
                rule.type === "read-when" ? [`\`${path}\`: ${rule.situation}`] : [],
              ),
              failed,
            ),
          ),
        render: linesRender({
          tag: "instruction_files",
          intro: readWhenGuidance,
          added: "More instruction files for situations:",
          removed: "These instruction files are gone; stop following them:",
        }),
      }),
    );
  }),
);
