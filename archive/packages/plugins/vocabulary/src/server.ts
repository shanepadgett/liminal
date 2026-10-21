/** Vocabulary's server: the terms section and the `vocabulary` tool over one store. */

import { Effect, Layer } from "effect";

import { PromptSections } from "@liminal/context/contract";
import { makeProblemNotices } from "@liminal/notices/contract";
import { SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

import { termsSection } from "./server/section.ts";
import { makeStore } from "./server/store.ts";
import { vocabularyToolOf } from "./server/tool.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* makeStore();
    const tell = yield* makeProblemNotices(yield* SessionLog);

    yield* (yield* PromptSections).register(termsSection(store, tell));
    yield* (yield* Tools).register(vocabularyToolOf(store));
  }),
);
