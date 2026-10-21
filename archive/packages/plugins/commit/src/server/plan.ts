/**
 * Asks the planner to group the changed files into conventional commits, and checks its answer:
 * every file in exactly one commit, and each subject a conventional commit's.
 */

import { Effect, Schema } from "effect";

import type { ModelTask } from "@liminal/models/contract";
import type { ModelPick, SessionId } from "@liminal/sdk";

import { type ChangedFile, CommitError, type PlannedCommit } from "../contract.ts";

/** All the diffs together stay within this many characters, so a huge change fits a small model. */
const MAX_DIFF_CHARACTERS = 48_000;

/** One file's diff never passes this, and never shrinks below the floor however many files change. */
const MAX_FILE_DIFF_CHARACTERS = 4000;
const MIN_FILE_DIFF_CHARACTERS = 400;

/** The planner may answer this many times; each wrong answer is shown back to it. */
const MAX_ATTEMPTS = 3;

const MAX_PROMPT_CHARACTERS = 2000;

const CONVENTIONAL = /^[a-z]+(?:\([^()\n]+\))?!?: \S/u;

const PlanAnswer = Schema.Struct({
  commits: Schema.Array(
    Schema.Struct({
      message: Schema.String.annotate({
        description:
          "The whole commit message: the subject, then a blank line and a body if needed",
      }),
      allFiles: Schema.Boolean.annotate({
        description:
          "True only for a single commit that holds every changed file; then files is empty",
      }),
      files: Schema.Array(Schema.Int).annotate({
        description:
          "The numbers of this commit's files, from the file list; empty when allFiles is true",
      }),
    }),
  ),
});

type PlanAnswer = typeof PlanAnswer.Type;

/** What the planner reads. */
export interface PlanEvidence {
  readonly files: ReadonlyArray<ChangedFile>;
  /** Each file's diff, in the order of `files`. */
  readonly diffs: ReadonlyArray<string>;
  readonly subjects: ReadonlyArray<string>;
  /** The user's prompts in this session since the latest commit. */
  readonly prompts: ReadonlyArray<string>;
  readonly instruction: string;
}

const system = [
  "You group a repository's changed files into git commits.",
  "",
  "- Make the fewest commits that each hold one honest, self-contained change. One commit is often right.",
  "- Keep docs, tests, lockfiles and generated files with the code they belong to. Do not split by file type or folder alone.",
  "- Put every file number in exactly one commit. For one commit holding every file, set allFiles to true and files to an empty list instead of listing the numbers.",
  "- Write each message as a conventional commit: `type(scope): subject`, a lowercase type such as feat, fix, refactor, docs, test or chore. Keep the subject under 72 characters, in the imperative mood, with no period.",
  "- Add a body after a blank line only when the subject cannot say why.",
  "- Mark a commit that breaks users with `!` after its type and a BREAKING CHANGE footer.",
  "- Follow the style of the recent subjects.",
  "- The user's instruction, when there is one, comes first.",
  "",
  "Then call submit_plan once.",
].join("\n");

/** The characters each file's diff may take: an even share of the total, within the bounds. */
const diffShare = (count: number) =>
  Math.min(
    MAX_FILE_DIFF_CHARACTERS,
    Math.max(MIN_FILE_DIFF_CHARACTERS, Math.floor(MAX_DIFF_CHARACTERS / Math.max(count, 1))),
  );

const cut = (diff: string, limit: number) =>
  diff.length <= limit ? diff : `${diff.slice(0, limit)}\n[diff cut at ${limit} characters]`;

/** Every file's diff under its number, so the model never has to match a diff to a file. */
const diffsText = (evidence: PlanEvidence) => {
  const limit = diffShare(evidence.files.length);

  return evidence.files
    .map((file, index) => {
      const diff = cut(evidence.diffs[index] ?? "", limit).trimEnd();

      return `[${index + 1}] ${file.path}\n${diff === "" ? "(no text changes)" : diff}`;
    })
    .join("\n\n");
};

const fileLine = (file: ChangedFile) =>
  file.previousPath === undefined
    ? `${file.path} (${file.status})`
    : `${file.path} (renamed from ${file.previousPath})`;

export const evidenceText = (evidence: PlanEvidence) =>
  [
    evidence.instruction === "" ? "" : `User's instruction: ${evidence.instruction}`,
    "Changed files:",
    evidence.files.map((file, index) => `${index + 1}. ${fileLine(file)}`).join("\n"),
    evidence.subjects.length === 0
      ? ""
      : `Recent commit subjects:\n${evidence.subjects.join("\n")}`,
    evidence.prompts.length === 0
      ? ""
      : `What the user asked for in this session:\n${evidence.prompts
          .map((prompt) => `- ${prompt.slice(0, MAX_PROMPT_CHARACTERS)}`)
          .join("\n")}`,
    `Diffs, each under its file number:\n${diffsText(evidence)}`,
  ]
    .filter((section) => section !== "")
    .join("\n\n");

const numbersOf = (answer: PlanAnswer, count: number) =>
  answer.commits.flatMap(({ allFiles, files }) =>
    allFiles ? Array.from({ length: count }, (_, index) => index + 1) : files,
  );

const repeated = (numbers: ReadonlyArray<number>) =>
  [...new Set(numbers.filter((number, index) => numbers.indexOf(number) !== index))].toSorted(
    (left, right) => left - right,
  );

/** Why the answer breaks a rule, or undefined when it keeps them all. */
export const planProblem = (answer: PlanAnswer, count: number): string | undefined => {
  const numbers = numbersOf(answer, count);
  const all = Array.from({ length: count }, (_, index) => index + 1);
  const missing = all.filter((number) => !numbers.includes(number));
  const twice = repeated(numbers);
  const subjects = answer.commits.map(({ message }) => message.trim().split("\n")[0] ?? "");
  const bad = subjects.find((subject) => !CONVENTIONAL.test(subject));

  if (answer.commits.length === 0) return "It has no commits.";

  if (answer.commits.some(({ allFiles }) => allFiles) && answer.commits.length > 1) {
    return "allFiles is only for a plan with a single commit.";
  }

  if (numbers.some((number) => number < 1 || number > count)) {
    return `It uses file numbers outside 1 to ${count}.`;
  }

  if (twice.length > 0) {
    return `It puts files ${twice.join(", ")} in more than one commit; each file belongs to exactly one.`;
  }

  if (missing.length > 0) return `It leaves out files ${missing.join(", ")}.`;

  if (answer.commits.some(({ allFiles, files }) => !allFiles && files.length === 0)) {
    return "A commit has no files.";
  }

  return bad === undefined ? undefined : `"${bad}" is not a conventional commit subject.`;
};

const planned = (answer: PlanAnswer, files: ReadonlyArray<ChangedFile>) =>
  answer.commits.map(({ message, allFiles, files: numbers }): PlannedCommit => ({
    message: message.trim(),
    files: allFiles ? files : numbers.flatMap((number) => files.slice(number - 1, number)),
  }));

/** The plan, asked again with the last answer shown when it breaks a rule. */
export const planCommits = Effect.fn("commit.plan")(function* (
  task: ModelTask["Service"],
  request: {
    readonly model: ModelPick;
    readonly session: SessionId;
    readonly evidence: PlanEvidence;
  },
) {
  const { evidence } = request;
  const text = evidenceText(evidence);

  const ask = (feedback: string) =>
    task
      .run({
        model: request.model,
        sessionId: request.session,
        system,
        prompt: [
          { role: "user", parts: [{ type: "text", text: text + feedback, providerData: {} }] },
        ],
        tools: [],
        submit: {
          name: "submit_plan",
          description: "Gives the commits, each with its message and file numbers.",
          schema: PlanAnswer,
        },
        maxSteps: 1,
      })
      .pipe(Effect.mapError((error) => new CommitError({ message: error.message })));

  let feedback = "";
  let problem = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const answer = yield* ask(feedback);
    const wrong = planProblem(answer, evidence.files.length);
    if (wrong === undefined) return planned(answer, evidence.files);

    problem = wrong;
    feedback = `\n\nYour last plan was wrong: ${wrong}\nYour last plan:\n${JSON.stringify(answer)}\nAnswer again with a corrected plan.`;
  }

  return yield* new CommitError({
    message: `The planner's plan was wrong ${MAX_ATTEMPTS} times: ${problem}`,
  });
});
