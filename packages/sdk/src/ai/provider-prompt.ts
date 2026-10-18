/** How a provider's prompt differs from the shared one: the metadata it keeps and its cache marks. */

import { Option } from "effect";
import type { Prompt } from "effect/ai";

import { OpenAiData, type ProviderData } from "./data.ts";

/** Options any message role takes, so one value serves every marked message. */
export type MessageOptions = Prompt.SystemMessageOptions
  & Prompt.UserMessageOptions
  & Prompt.AssistantMessageOptions
  & Prompt.ToolMessageOptions;

export interface ProviderPrompt {
  /** The metadata reply parts keep for the next request. */
  readonly data: ProviderData;
  /** The options a message with a cache mark gets; none when the provider caches on its own. */
  readonly cache: Option.Option<MessageOptions>;
}

/** OpenAI caches prefixes on its own, routed by the request's cache key; marks are ignored. */
export const OpenAiPrompt: ProviderPrompt = { data: OpenAiData, cache: Option.none() };
