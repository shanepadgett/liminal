/**
 * Asks the planner to group the changed files into conventional commits, and checks its answer:
 * every file in exactly one commit, and each subject a conventional commit's.
 */

import { Effect, Schema } from "effect";

import type { ModelTask } from "@liminal/models/contract";
import type { ModelPick, SessionId } from "@liminal/sdk";

import { type ChangedFile, CommitError, type PlannedCommit } from "../contract.ts";

/** Diff past this many characters is cut, so a huge change still fits a small model. */
const MAX_DIFF_CHARACTERS = 48_000;

const MAX_PROMPT_CHARACTERS = 2000;

const CONVENTIONAL = /^[a-z]+(?:\([^()\n]+\))?!?: \S/u;

const PlanAnswer = Schema.Struct({
  commits: Schema.Array(
    Schema.Struct({
      message: Schema.String.annotate({
        description:
          "The whole commit message: the subject, then a blank line and a body if needed",
      }),
      files: Schema.Array(Schema.Int).annotate({
        description: "The numbers of this commit's files, from the file list",
      }),
    }),
  ),
});

type PlanAnswer = typeof PlanAnswer.Type;

/** What the planner reads. */
export interface PlanEvidence {
  readonly files: ReadonlyArray<ChangedFile>;
  readonly diff: string;
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
  "- Put every file number in exactly one commit.",
  "- Write each message as a conventional commit: `type(scope): subject`, a lowercase type such as feat, fix, refactor, docs, test or chore. Keep the subject under 72 characters, in the imperative mood, with no period.",
  "- Add a body after a blank line only when the subject cannot say why.",
  "- Mark a commit that breaks users with `!` after its type and a BREAKING CHANGE footer.",
  "- Follow the style of the recent subjects.",
  "- The user's instruction, when there is one, comes first.",
  "",
  "Then call submit_plan once.",
].join("\n");

const cut = (diff: string) =>
  diff.length <= MAX_DIFF_CHARACTERS
    ? diff
    : `${diff.slice(0, MAX_DIFF_CHARACTERS)}\n[diff cut at ${MAX_DIFF_CHARACTERS} characters]`;

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
    `Diff:\n${cut(evidence.diff)}`,
  ]
    .filter((section) => section !== "")
    .join("\n\n");

/** Why the answer breaks a rule, or undefined when it keeps them all. */
export const planProblem = (answer: PlanAnswer, count: number): string | undefined => {
  const numbers = answer.commits.flatMap(({ files }) => files);
  const all = Array.from({ length: count }, (_, index) => index + 1);
  const missing = all.filter((number) => !numbers.includes(number));
  const subjects = answer.commits.map(({ message }) => message.trim().split("\n")[0] ?? "");
  const bad = subjects.find((subject) => !CONVENTIONAL.test(subject));

  if (answer.commits.length === 0) return "It has no commits.";

  if (numbers.some((number) => number < 1 || number > count)) {
    return `It uses file numbers outside 1 to ${count}.`;
  }

  if (new Set(numbers).size !== numbers.length) return "It puts a file in more than one commit.";
  if (missing.length > 0) return `It leaves out files ${missing.join(", ")}.`;
  if (answer.commits.some(({ files }) => files.length === 0)) return "A commit has no files.";

  return bad === undefined ? undefined : `"${bad}" is not a conventional commit subject.`;
};

const planned = (answer: PlanAnswer, files: ReadonlyArray<ChangedFile>) =>
  answer.commits.map(({ message, files: numbers }): PlannedCommit => ({
    message: message.trim(),
    files: numbers.flatMap((number) => files.slice(number - 1, number)),
  }));

/** The plan, after one retry when the planner's answer breaks a rule. */
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

  const first = yield* ask("");
  const problem = planProblem(first, evidence.files.length);
  if (problem === undefined) return planned(first, evidence.files);

  const second = yield* ask(`\n\nYour last plan was wrong: ${problem} Answer again.`);
  const again = planProblem(second, evidence.files.length);
  if (again === undefined) return planned(second, evidence.files);

  return yield* new CommitError({ message: `The planner's plan was wrong twice: ${again}` });
});
