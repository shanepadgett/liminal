/** The vocabulary file's shape and the `vocabulary` tool's parameters. */

import { Schema } from "effect";

export const vocabularyTool = "vocabulary";

/** The file in the project folder. */
export const vocabularyFile = "vocabulary.json";

const Term = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80));
const Definition = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(500));

/** One agreed term and what it means in this project. */
export const VocabularyTerm = Schema.Struct({ term: Term, definition: Definition });

export type VocabularyTerm = typeof VocabularyTerm.Type;

export const VocabularyFile = Schema.Struct({ terms: Schema.Array(VocabularyTerm) });

export const VocabularyParams = Schema.Struct({
  op: Schema.Literals(["get", "set", "remove"]).annotate({
    description:
      "get reads one term, or every term with its definition when `term` is left out; set adds a term or replaces its definition; remove deletes a term",
  }),
  term: Schema.optionalKey(Term.annotate({ description: "The term; required for set and remove" })),
  definition: Schema.optionalKey(
    Definition.annotate({ description: "What the term means here; required for set" }),
  ),
  was: Schema.optionalKey(
    Term.annotate({ description: "With set, the term's current name, to rename it to `term`" }),
  ),
});

export type VocabularyParams = typeof VocabularyParams.Type;
