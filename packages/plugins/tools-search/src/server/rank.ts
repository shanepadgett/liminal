/**
 * Ranks deferred tools for a keyword query: BM25 over each tool's name, description and parameter
 * text, raised by how often the project uses the tool.
 */

import { Predicate, type Schema } from "effect";

import type { ToolSpec } from "@liminal/sdk";

/** BM25's usual constants: term frequency saturation and length normalization. */
const k1 = 1.2;
const b = 0.75;

/** A match scoring under this share of the best one is left out. */
const cutoff = 0.25;

/** Words nearly every description holds; matching one says nothing about the tool. */
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "so",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "to",
  "use",
  "was",
  "what",
  "when",
  "which",
  "will",
  "with",
  "you",
  "your",
]);

/**
 * Lowercase words, with `snake_case`, `kebab-case` and `camelCase` split apart and stop words left
 * out.
 */
const wordsOf = (text: string): ReadonlyArray<string> =>
  text
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "" && !stopWords.has(word));

type JsonObject = { readonly [key: string]: Schema.Json };

const isJsonObject = (value: Schema.Json): value is JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

/** Parameter names and descriptions anywhere in a JSON Schema. */
const schemaText = (schema: Schema.Json): ReadonlyArray<string> => {
  if (Array.isArray(schema)) return schema.flatMap(schemaText);
  if (!isJsonObject(schema)) return [];

  const text: Array<string> = [];

  for (const [key, value] of Object.entries(schema)) {
    if (key === "description" && Predicate.isString(value)) {
      text.push(value);
    } else {
      if (key === "properties" && isJsonObject(value)) text.push(...Object.keys(value));
      text.push(...schemaText(value));
    }
  }

  return text;
};

/** The words a query matches in `spec`. */
const documentOf = (spec: ToolSpec) =>
  [spec.name, spec.description, ...schemaText(spec.parameters)].flatMap(wordsOf);

/** How many times each word appears in `words`. */
const counted = (words: ReadonlyArray<string>) => {
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);

  return counts;
};

/** A use weight's lift: a tool never used keeps its score, a well used one gains a few times it. */
const lift = (use: number) => 1 + Math.log(1 + use);

/** A tool's words: how many times each appears, and how many there are. */
interface Document {
  readonly spec: ToolSpec;
  readonly counts: ReadonlyMap<string, number>;
  readonly length: number;
}

const documentFor = (spec: ToolSpec): Document => {
  const words = documentOf(spec);

  return { spec, counts: counted(words), length: words.length };
};

/** Each term's inverse document frequency: rare words weigh more. */
const weightsOf = (terms: ReadonlyArray<string>, documents: ReadonlyArray<Document>) =>
  new Map(
    terms.map((term) => {
      const holding = documents.filter(({ counts }) => counts.has(term)).length;

      return [term, Math.log(1 + (documents.length - holding + 0.5) / (holding + 0.5))];
    }),
  );

/** BM25 of `document` for `terms`, `averageLength` being the documents' mean length. */
const bm25Of = (
  document: Document,
  weights: ReadonlyMap<string, number>,
  averageLength: number,
) => {
  let score = 0;

  for (const [term, weight] of weights) {
    const frequency = document.counts.get(term) ?? 0;
    const norm = 1 - b + (b * document.length) / averageLength;
    score += (weight * frequency * (k1 + 1)) / (frequency + k1 * norm);
  }

  return score;
};

/**
 * The tools matching `query`, best first, at most `limit`; `use` is each tool's weight by name. A
 * tool that matches no word, or scores under a quarter of the best, is left out.
 */
export const rankTools = (
  specs: ReadonlyArray<ToolSpec>,
  query: string,
  use: ReadonlyMap<string, number>,
  limit: number,
): ReadonlyArray<ToolSpec> => {
  const documents = specs.map(documentFor);
  const weights = weightsOf([...new Set(wordsOf(query))], documents);

  let total = 0;
  for (const document of documents) total += document.length;
  const averageLength = total / Math.max(documents.length, 1);

  const matches = documents
    .flatMap((document) => {
      const score =
        bm25Of(document, weights, averageLength) * lift(use.get(document.spec.name) ?? 0);

      return score > 0 ? [{ spec: document.spec, score }] : [];
    })
    .toSorted(
      (left, right) => right.score - left.score || left.spec.name.localeCompare(right.spec.name),
    );

  const floor = (matches[0]?.score ?? 0) * cutoff;

  return matches.flatMap(({ spec, score }, index) =>
    index < limit && score >= floor ? [spec] : [],
  );
};
