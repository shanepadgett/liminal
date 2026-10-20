/** The model's `vocabulary` tool: read, set and remove the project's agreed terms. */

import { Effect, Match } from "effect";

import { defineTool, ToolFailed } from "@liminal/sdk";

import { VocabularyParams, vocabularyTool } from "../contract.ts";
import type { Store } from "./store.ts";
import { findTerm, removeTerm, setTerm, tidy, type Terms } from "./terms.ts";

const GUIDANCE = [
  "The vocabulary holds the project's agreed terms: stable names for its concepts. Use them exactly as written, and read a term's definition with the vocabulary tool before using it in a way you are unsure of.",
  "Add or change a term only after you and the user have discussed the concept and its definition and the user has clearly agreed to both. Never save a term on your own. A term names a product concept, not a code symbol or a file name.",
];

const needs = (op: string, field: string) =>
  new ToolFailed({ message: `op ${op} needs ${field}.` });

const lineOf = ({ term, definition }: Terms[number]) => `- ${term}: ${definition}`;

const listed = (terms: Terms) =>
  terms.length === 0 ? "No terms yet." : terms.map(lineOf).join("\n");

const readTerms = (store: Store, term: string | undefined) =>
  Effect.gen(function* () {
    const terms = yield* store.read;
    if (term === undefined) return listed(terms);

    const found = findTerm(terms, term);

    return found === undefined
      ? yield* new ToolFailed({ message: `There is no term "${term}".` })
      : lineOf(found);
  });

const saveTerm = (store: Store, params: VocabularyParams) =>
  Effect.gen(function* () {
    const term = tidy(params.term ?? "");
    const definition = tidy(params.definition ?? "");
    if (term === "") return yield* needs("set", "term");
    if (definition === "") return yield* needs("set", "definition");

    yield* store.update((terms) =>
      setTerm(terms, { term, definition }, params.was === undefined ? undefined : tidy(params.was)),
    );

    return `Saved term: ${term}`;
  });

const dropTerm = (store: Store, term: string | undefined) =>
  Effect.gen(function* () {
    const name = tidy(term ?? "");
    if (name === "") return yield* needs("remove", "term");

    yield* store.update((terms) => removeTerm(terms, name));

    return `Removed term: ${name}`;
  });

export const vocabularyToolOf = (store: Store) =>
  defineTool({
    name: vocabularyTool,
    description:
      "Reads and changes the project's vocabulary, its agreed terms with definitions. op get reads one term, or all of them; set adds a term or replaces its definition, or renames it with `was`; remove deletes a term.",
    guidance: GUIDANCE,
    parameters: VocabularyParams,
    offer: "search",
    hints: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    runAlongside: false,
    safeToRerun: true,
    run: (params) =>
      Match.value(params.op).pipe(
        Match.when("get", () => readTerms(store, params.term)),
        Match.when("set", () => saveTerm(store, params)),
        Match.when("remove", () => dropTerm(store, params.term)),
        Match.exhaustive,
        Effect.map((result) => ({ result })),
        Effect.catchTag("VocabularyError", (error) =>
          Effect.fail(new ToolFailed({ message: error.message })),
        ),
      ),
  });
