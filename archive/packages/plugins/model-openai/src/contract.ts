/**
 * Model-openai: the OpenAI API as model providers `openai`, signed with an API key, and `chatgpt`,
 * signed by Sign in with ChatGPT and spending the user's plan.
 */

/** The provider id model-openai registers. */
export const openAiProvider = "openai";

/** The credential-store method that holds the API key. */
export const openAiLogin = "openai";

/** The environment variable read for the key while none is saved. */
export const openAiKeyVariable = "OPENAI_API_KEY";

/** The provider id of the OpenAI API on the user's ChatGPT plan. */
export const chatgptProvider = "chatgpt";

/** The credential-store method that holds the Sign in with ChatGPT tokens. */
export const chatgptLogin = "chatgpt";
