/**
 * Custom prompts take the composer's draft area (`InboxSlots.input`) and its key hints. Each holds
 * a priority on both chains; the lowest wins, so an agent blocked on an approval comes before a
 * commit, which comes before the assistant's questions, and the composer (0) comes last.
 */

/** Where each custom prompt sits on `InboxSlots.input`. */
export const PromptPriority = { approval: -3, commit: -2, questions: -1 } as const;

/** Where a prompt's key hints sit on `ChatSlots.composerHints`: just behind the prompt itself. */
export const hintsPriority = (input: number) => input + 0.5;

/** Above the composer's own keys, so a prompt's keys win while it shows. */
export const PROMPT_KEYS_PRIORITY = 1;
