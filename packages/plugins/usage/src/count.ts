/** Counting a session's steps: the tokens each finished step used, and what they cost. */
import type { Response } from "effect/ai";

import type { ModelId, ModelPrice } from "@shanepadgett/liminal-model/contract";

import type { SessionUsage } from "./contract.ts";

/** One finished step's tokens. `fresh` is the input neither read from nor written to the cache. */
export interface Tokens {
  readonly input: number;
  readonly fresh: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}

/**
 * The step's tokens. `fresh` comes from `total` rather than `uncached`, which providers fill
 * differently: some count cache writes in it, some leave them out.
 */
export const tokensOf = (usage: Response.Usage): Tokens => {
  const { total = 0, cacheRead = 0, cacheWrite = 0 } = usage.inputTokens;

  return {
    input: total,
    fresh: Math.max(0, total - cacheRead - cacheWrite),
    cacheRead,
    cacheWrite,
    output: usage.outputTokens.total ?? 0,
  };
};

const PER_MILLION = 1_000_000;

/**
 * What `tokens` cost in US dollars at `price`, at the highest tier its input passes; a cache price
 * the model lacks is its input price.
 */
export const costOf = (price: ModelPrice, tokens: Tokens): number => {
  const rates = price.tiers.findLast((tier) => tokens.input > tier.above) ?? price;

  return (
    (tokens.fresh * rates.input
      + tokens.cacheRead * (rates.cacheRead ?? rates.input)
      + tokens.cacheWrite * (rates.cacheWrite ?? rates.input)
      + tokens.output * rates.output)
    / PER_MILLION
  );
};

/** A session's steps so far. */
export interface Tally {
  /** The model of the latest step to start. */
  readonly model: ModelId | undefined;
  /** The latest finished step: its model and tokens. */
  readonly latest: { readonly model: ModelId; readonly tokens: Tokens } | undefined;
  /** Missing until a finished step has a price. */
  readonly cost: number | undefined;
  readonly unpriced: number;
}

export const EMPTY: Tally = { model: undefined, latest: undefined, cost: undefined, unpriced: 0 };

/** `tally` with one more finished step on `model`, priced at `price` when it has one. */
export const addStep = (
  tally: Tally,
  model: ModelId,
  tokens: Tokens,
  price: ModelPrice | undefined,
): Tally => ({
  ...tally,
  latest: { model, tokens },
  cost: price === undefined ? tally.cost : (tally.cost ?? 0) + costOf(price, tokens),
  unpriced: price === undefined ? tally.unpriced + 1 : tally.unpriced,
});

/** What `tally` reads as, in a model whose window is `contextWindow`. */
export const usageOf = (tally: Tally, contextWindow?: number): SessionUsage => {
  const tokens = tally.latest?.tokens;

  return {
    context: tokens?.input ?? 0,
    contextWindow,
    cacheHit: tokens === undefined || tokens.input === 0 ? 0 : tokens.cacheRead / tokens.input,
    cost: tally.cost ?? (tally.unpriced > 0 ? undefined : 0),
    unpriced: tally.unpriced,
  };
};
