/**
 * Vocabulary: the project's agreed product terms in a system prompt section, and the `vocabulary`
 * tool that reads and changes them.
 */
import { Effect, FileSystem, Layer, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Sections } from "@shanepadgett/liminal-system-prompt/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import { makeStore, type Terms } from "./store.ts";
import { makeVocabularyTool } from "./tool.ts";

/** The section: each term's name and the rule for changing them; empty with no terms. */
const sectionText = (terms: Terms) => {
  if (terms.length === 0) return "";

  return [
    "<vocabulary>",
    "Use these product terms consistently:",
    ...terms.map(({ term }) => `- ${term}`),
    "",
    "Change a term only after discussing the concept and its definition with the user and reaching clear agreement; then use the `vocabulary` tool.",
    "</vocabulary>",
  ].join("\n");
};

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* makeStore;

    const text = () =>
      store.read.pipe(
        Effect.map(sectionText),
        Effect.catch((error) => Effect.as(Effect.logWarning(error.message), "")),
      );

    yield* (yield* Sections).add({ name: "vocabulary", text }, { order: 30 });
    yield* (yield* Tools).add(makeVocabularyTool(store));
  }),
);

export default definePlugin({
  name: "vocabulary",
  provides: [],
  requires: [Sections, Tools, Directories, FileSystem.FileSystem, Path.Path],
  layer,
});
