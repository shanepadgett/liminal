/** Context's registries, empty, for tests that run the tools plugin without context. */

import { Layer } from "effect";

import { PromptSections, ToolSources } from "@liminal/context/contract";
import { KeyedRegistry, Registry } from "@liminal/sdk";

export const contextFakes = Layer.mergeAll(
  KeyedRegistry.layer(PromptSections, (section) => section.key),
  Registry.layer(ToolSources),
);
