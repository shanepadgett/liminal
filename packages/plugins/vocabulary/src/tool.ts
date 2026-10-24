/** The `vocabulary` tool: lists, reads and changes the project's agreed terms. */
import { Effect, Schema } from "effect";

import {
  type Access,
  defineTool,
  noAccess,
  ToolFailed,
  type ToolOutput,
} from "@shanepadgett/liminal-tools/contract";

import { isSameTerm, type Store, type Term, type Terms, tidy } from "./store.ts";

const AGREEMENT =
  "Before creating, updating, or deleting vocabulary, discuss the product concept and its definition with the user and reach explicit agreement. Do not infer agreement from implementation work or automatically collect nouns. Register product concepts, not code symbols, file names, or implementation details.";

const DESCRIPTION = `List, read, create, update, or delete product terms in .liminal/vocabulary.json. ${AGREEMENT} Use create for new terms; update requires an existing term and its replacement spelling and definition. Term lookup is case-insensitive.`;

const Operation = Schema.Literals(["list", "get", "create", "update", "delete"]);

type Operation = typeof Operation.Type;

const Input = Schema.Struct({
  operation: Operation,
  term: Schema.optionalKey(
    Schema.String.annotate({ description: "Required except for list; existing term for update" }),
  ),
  replacementTerm: Schema.optionalKey(
    Schema.String.annotate({ description: "Required for update; replacement spelling" }),
  ),
  definition: Schema.optionalKey(
    Schema.String.annotate({
      description: "Required for create and update; short product-level definition",
    }),
  ),
});

type Input = typeof Input.Type;

const READS: ReadonlySet<Operation> = new Set(["list", "get"]);

const textOutput = (text: string): ToolOutput => ({ content: [{ type: "text", text }] });

const lineOf = ({ term, definition }: Term) => `- ${term}: ${definition}`;

/** `field` of the input on one line; fails when it is missing or blank. */
const needed = (input: Input, field: "term" | "replacementTerm" | "definition") => {
  const value = tidy(input[field] ?? "");

  return value === ""
    ? Effect.fail(new ToolFailed({ message: `operation ${input.operation} needs ${field}` }))
    : Effect.succeed(value);
};

const notFound = (term: string) =>
  new ToolFailed({ message: `Vocabulary term not found: ${term}` });

const taken = (term: string) =>
  new ToolFailed({ message: `Vocabulary term already exists: ${term}` });

const findIn = (terms: Terms, term: string) => {
  const found = terms.find((each) => isSameTerm(each.term, term));

  return found === undefined ? Effect.fail(notFound(term)) : Effect.succeed(found);
};

const create = (input: Input) =>
  Effect.gen(function* () {
    const term = yield* needed(input, "term");
    const definition = yield* needed(input, "definition");

    return (terms: Terms) =>
      terms.some((each) => isSameTerm(each.term, term))
        ? Effect.fail(new ToolFailed({ message: `${taken(term).message}. Use update.` }))
        : Effect.succeed([...terms, { term, definition }]);
  });

const update = (input: Input) =>
  Effect.gen(function* () {
    const term = yield* needed(input, "term");
    const replacement = yield* needed(input, "replacementTerm");
    const definition = yield* needed(input, "definition");

    return (terms: Terms) =>
      Effect.gen(function* () {
        const old = yield* findIn(terms, term);
        const others = terms.filter((each) => each !== old);

        if (others.some((each) => isSameTerm(each.term, replacement)))
          return yield* taken(replacement);

        return [...others, { term: replacement, definition }];
      });
  });

const remove = (input: Input) =>
  Effect.map(
    needed(input, "term"),
    (term) => (terms: Terms) =>
      Effect.map(findIn(terms, term), (old) => terms.filter((each) => each !== old)),
  );

const CHANGES = { create, update, delete: remove };

const failed = (error: { readonly message: string }) => new ToolFailed({ message: error.message });

export const makeVocabularyTool = (store: Store) => {
  const read = Effect.mapError(store.read, failed);

  const list = Effect.map(read, (terms) =>
    textOutput(terms.length === 0 ? "No terms yet." : terms.map(lineOf).join("\n")),
  );

  const get = (input: Input) =>
    Effect.gen(function* () {
      const term = yield* needed(input, "term");

      return textOutput(lineOf(yield* findIn(yield* read, term)));
    });

  const change = Effect.fn("vocabulary.change")(function* (
    input: Input & { readonly operation: keyof typeof CHANGES },
  ) {
    const changed = yield* CHANGES[input.operation](input);
    yield* Effect.mapError(store.update(changed), failed);

    return textOutput(
      `Vocabulary ${input.operation} saved. The vocabulary section updates on your next step.`,
    );
  });

  const access = ({ operation }: Input): Access =>
    READS.has(operation) ? noAccess : { kind: "write", paths: [store.file] };

  return defineTool({
    name: "vocabulary",
    description: DESCRIPTION,
    input: Input,
    sequential: true,
    access,
    run: (input) => {
      const { operation } = input;
      if (operation === "list") return list;
      if (operation === "get") return get(input);

      return change({ ...input, operation });
    },
  });
};
