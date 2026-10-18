/** Settings files merged: each layer over the one before it. */

import type { Schema } from "effect";

import { isJsonObject, type JsonObject } from "@liminal/sdk";

/** `higher` over `lower`: objects merge key by key; any other value, lists too, comes from `higher`. */
export const merge = (lower: Schema.Json | undefined, higher: Schema.Json | undefined) => {
  if (higher === undefined) return lower;
  if (!isJsonObject(lower) || !isJsonObject(higher)) return higher;

  const merged: Record<string, Schema.Json> = Object.fromEntries(Object.entries(lower));

  for (const [key, value] of Object.entries(higher)) {
    const next = merge(lower[key], value);
    if (next !== undefined) merged[key] = next;
  }

  return merged;
};

/** Section `name` across `files`, each over the one before it; a missing section is `{}`. */
export const mergeSection = (files: ReadonlyArray<JsonObject>, name: string): Schema.Json => {
  let merged: Schema.Json | undefined = {};
  for (const file of files) merged = merge(merged, file[name]);

  return merged ?? {};
};
