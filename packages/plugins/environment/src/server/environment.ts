/** The `environment` section's value: what changes between requests. */

import { Schema } from "effect";

import { Lines } from "@liminal/context/contract";

export const Environment = Schema.Struct({
  /** One `Name: value` line per fact. */
  facts: Lines,
  /** The workspace root's entries; a folder ends in `/`. */
  files: Lines,
});

export type Environment = typeof Environment.Type;
