/** Sample turns the transcript states and the chat screen share. */

/** A short-term memory as the model writes it: a few words, in its own voice. */
export const SHORT_TERM_MEMORY = "Traced the double retry to recovery.ts and turn.ts";

export const QUESTION = "Why does the loop retry twice when the provider is overloaded?";

/** An input past the three rows a prompt takes in the transcript. */
export const LONG_QUESTION = [
  "Why does the loop retry twice when the provider is overloaded? I read recovery.ts and turn.ts and both seem to retry,",
  "but the logs show three attempts in one session and two in another, and I cannot tell which path runs first",
  "or whether the backoff resets between them. Trace both paths and tell me which one to keep.",
  "Then check whether the step retry in turn.ts still matters once recovery.ts reads retry-after,",
  "and if it does not, drop it and run the loop tests.",
].join(" ");

export const ANSWER = [
  "The retry runs in **two places**: `recovery.ts` retries the request, and `turn.ts` retries the step when the request fails.",
  "",
  "Keep the one in `recovery.ts`, since it knows the provider's `retry-after`:",
  "",
  "```ts",
  'const schedule = Schedule.exponential("1 second").pipe(Schedule.take(3));',
  "```",
  "",
  "| Place | Retries | Reads retry-after |",
  "| --- | --- | --- |",
  "| recovery.ts | 3 | yes |",
  "| turn.ts | 1 | no |",
  "",
  "A failed request now goes:",
  "",
  "```mermaid",
  "graph LR",
  "  turn --> recovery",
  "  recovery --> provider",
  "  recovery --> failure",
  "```",
  "",
  "To change it:",
  "",
  "1. Drop the retry in `turn.ts`.",
  "2. Raise the limit in `recovery.ts` to four.",
  "3. Run the loop tests:",
  "   - `recovery.test.ts`",
  "   - `turn.test.ts`",
].join("\n");
