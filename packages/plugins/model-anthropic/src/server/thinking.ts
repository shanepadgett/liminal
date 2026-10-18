/** Liminal's thinking value as Anthropic's thinking fields. */

import { Match, type Schema } from "effect";

import type { ThinkingValue } from "@liminal/sdk";

/**
 * Request fields as JSON: the package types `output_config.effort` as low, medium or high only, but
 * sends any value unchecked, and the catalog offers xhigh and max for the models that take them.
 */
type Fields = Readonly<Record<string, Schema.Json>>;

/**
 * `On` lets the model choose how much to think; an effort guides that choice; a budget fixes it.
 * The output limit must exceed the budget, so it is sent with it when the request sets one.
 */
export const thinkingOf = (value: ThinkingValue, maxOutputTokens: number | undefined) =>
  Match.valueTags(value, {
    Off: (): Fields => ({ thinking: { type: "disabled" } }),
    On: (): Fields => ({ thinking: { type: "adaptive" } }),
    Effort: ({ effort }): Fields => ({ thinking: { type: "adaptive" }, output_config: { effort } }),
    Budget: ({ tokens }): Fields => {
      const thinking = { type: "enabled", budget_tokens: tokens };

      return maxOutputTokens === undefined
        ? { thinking }
        : { thinking, max_tokens: maxOutputTokens };
    },
  });
