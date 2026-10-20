/** Changes to a list of terms: pure, each returning the new sorted list or why it cannot. */

import { Result } from "effect";

import type { VocabularyTerm } from "../contract.ts";

export type Terms = ReadonlyArray<VocabularyTerm>;

/** What a change gives: the new terms, or a message for the model. */
export type Change = Result.Result<Terms, string>;

/** A term or definition on one line with single spaces. */
export const tidy = (text: string) => text.trim().replaceAll(/\s+/g, " ");

const keyOf = (term: string) => term.toLowerCase();

/** Terms match whatever their case. */
export const isSameTerm = (left: string, right: string) => keyOf(left) === keyOf(right);

export const sorted = (terms: Terms): Terms =>
  terms.toSorted((left, right) => keyOf(left.term).localeCompare(keyOf(right.term), "en"));

/** The term named `name`. */
export const findTerm = (terms: Terms, name: string) =>
  terms.find((each) => isSameTerm(each.term, name));

/** The first term whose name an earlier term already has. */
export const duplicateOf = (terms: Terms) =>
  terms.find((each, index) =>
    terms.some((other, at) => at < index && isSameTerm(other.term, each.term)),
  );

/** Adds `next`, replaces the term of the same name, or with `was` renames that term to `next`. */
export const setTerm = (terms: Terms, next: VocabularyTerm, was: string | undefined): Change => {
  const replaced = findTerm(terms, was ?? next.term);

  if (was !== undefined && replaced === undefined)
    return Result.fail(`There is no term "${was}" to rename. Read the terms with op get.`);

  const clash = findTerm(terms, next.term);

  if (was !== undefined && clash !== undefined && clash !== replaced)
    return Result.fail(`The term "${clash.term}" already exists. Pick another name.`);

  return Result.succeed(sorted([...terms.filter((each) => each !== replaced), next]));
};

/** Drops the term named `name`. */
export const removeTerm = (terms: Terms, name: string): Change => {
  const found = findTerm(terms, name);

  return found === undefined
    ? Result.fail(`There is no term "${name}". Read the terms with op get.`)
    : Result.succeed(terms.filter((each) => each !== found));
};
