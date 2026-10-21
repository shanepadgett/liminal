/** One settings value over another. */
import type { Schema } from "effect";

import { isJsonObject } from "./jsonc.ts";

/** `higher` over `lower`: objects merge key by key; any other value, lists too, comes from `higher`. */
export const mergeJson = (
  lower: Schema.Json | undefined,
  higher: Schema.Json | undefined,
): Schema.Json | undefined => {
  if (higher === undefined) return lower;
  if (!isJsonObject(lower) || !isJsonObject(higher)) return higher;

  const merged: Record<string, Schema.Json> = Object.fromEntries(Object.entries(lower));

  for (const [key, value] of Object.entries(higher)) {
    const next = mergeJson(lower[key], value);
    if (next !== undefined) merged[key] = next;
  }

  return merged;
};
