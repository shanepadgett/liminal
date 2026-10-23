/**
 * The models that take tool changes mid-conversation as `additional_tools` items, from Pi's model
 * lists.
 */
const apiModels = new Set([
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-pro",
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-6.1-sol",
]);

const codexModels = new Set([
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-6.1-sol",
]);

/** For the `openai` and `chatgpt` providers. */
export const apiToolChanges = (model: string) => apiModels.has(model);

/** For the `codex` provider. */
export const codexToolChanges = (model: string) => codexModels.has(model);
