/** The reasoning effort to send a provider that takes only efforts. */

import { Effect, Predicate } from "effect";

import { ModelError, type ThinkingValue } from "../core/index.ts";

/**
 * The effort for `thinking`: `off` when thinking is off, else its effort when `isEffort` accepts
 * it. `On`, a budget or an effort the provider does not take fail; `name` names the provider.
 */
export const effortOf = <E extends string>(
  name: string,
  isEffort: (effort: string) => effort is E,
  off: E,
) =>
  Effect.fn("effortOf")(function* (thinking: ThinkingValue) {
    if (Predicate.isTagged(thinking, "Off")) return off;
    if (Predicate.isTagged(thinking, "Effort") && isEffort(thinking.effort)) return thinking.effort;

    return yield* new ModelError({
      reason: "invalid-request",
      message: `${name} takes no thinking ${JSON.stringify(thinking)}`,
    });
  });
