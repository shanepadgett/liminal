/** Picks the face for a tool call by its tool. */

import { Match } from "effect";

import type { ToolCall } from "../entries.ts";
import { askFace } from "./ask.tsx";
import { checksFace } from "./checks.tsx";
import { editFace } from "./edit.tsx";
import type { ToolFace } from "./face.ts";
import { readFace } from "./read.tsx";
import { runFace } from "./run.tsx";
import { searchFace } from "./search.tsx";

export const faceOf: (call: ToolCall) => ToolFace = Match.type<ToolCall>().pipe(
  Match.discriminatorsExhaustive("kind")({
    read: readFace,
    edit: editFace,
    run: runFace,
    search: searchFace,
    checks: checksFace,
    ask: askFace,
  }),
);
