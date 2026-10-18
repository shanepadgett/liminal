/** The file-changing tools' server: registers `edit` and `write`. */

import { Effect, Layer } from "effect";

import { Tools } from "@liminal/tools/contract";

import { editTool } from "./server/edit.ts";
import { writeTool } from "./server/write.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools;
    yield* tools.register(yield* editTool);
    yield* tools.register(yield* writeTool);
  }),
);
