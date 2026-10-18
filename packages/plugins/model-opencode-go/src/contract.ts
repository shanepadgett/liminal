/**
 * Model-opencode-go: the OpenCode Go subscription as model provider `opencode-go`, signed with an
 * OpenCode API key. Each model answers on Chat Completions, Responses or Messages, as models.dev
 * says.
 */

/** The provider id model-opencode-go registers. */
export const openCodeGoProvider = "opencode-go";

/** The credential-store method that holds the API key. */
export const openCodeGoLogin = "opencode-go";

/** The environment variable read for the key while none is saved. */
export const openCodeKeyVariable = "OPENCODE_API_KEY";
