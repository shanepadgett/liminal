/** Model-anthropic: Anthropic's Messages API as providers `anthropic` and `anthropic-api`. */

/** The provider id signed with a Claude subscription, and the credential-store method holding it. */
export const claudeProvider = "anthropic";

/** The provider id signed with an API key, and the credential-store method holding the key. */
export const anthropicApiProvider = "anthropic-api";

/** The environment variable read for the key while none is saved. */
export const anthropicKeyVariable = "ANTHROPIC_API_KEY";
