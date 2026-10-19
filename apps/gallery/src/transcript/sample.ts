/**
 * The session the gallery plays. The user asks how the plugin host boots. Then they ask with `/qna`
 * for the questions the assistant needs answered before it fixes a test, and it drafts a form of
 * every kind of question. The user's answers come back as the next prompt: a picked option with a
 * note on another, a skipped question, a written answer that differs from the one suggested, an
 * answer of their own in place of the options, and some added context. The fix turn then thinks,
 * reads, edits, runs the tests, fails and fixes a checks run, and answers.
 */

import type { Question, Script } from "./script.ts";

export const BOOT: Script = {
  prompt: { kind: "text", text: "explain how the plugin host boots" },
  beats: [
    {
      kind: "think",
      ms: 3000,
      text: "The user wants the boot sequence. The host lives in kernel/src/host.ts. I should read it and the manifest loader, then find where plugins are defined to see what they declare.",
    },
    { kind: "act", ms: 900, action: { kind: "read", path: "kernel/src/host.ts" } },
    { kind: "act", ms: 700, action: { kind: "read", path: "kernel/src/manifest.ts" } },
    { kind: "act", ms: 900, action: { kind: "search", pattern: "definePlugin", hits: 3 } },
    { kind: "act", ms: 700, action: { kind: "recall", from: 12, through: 40 } },
    {
      kind: "act",
      ms: 1200,
      action: {
        kind: "script",
        code: 'const hits = await tools.search({ pattern: "activate" })\nfor (const hit of hits) await tools.read({ path: hit })',
        calls: [
          { kind: "search", pattern: "activate", hits: 2 },
          { kind: "read", path: "kernel/src/activate.ts" },
          { kind: "read", path: "kernel/src/graph.ts" },
        ],
      },
    },
    {
      kind: "say",
      ms: 2200,
      text: "The host reads manifests before any plugin code. Running the kernel tests to confirm the activation order.",
    },
    {
      kind: "act",
      ms: 4200,
      action: {
        kind: "run",
        command: "bun test kernel",
        hasPassed: false,
        output: [
          "kernel/test/host.test.ts:",
          "✓ reads manifests before loading code",
          "✗ activates independent plugins together",
          "  expected [git, shell] to start within 5ms, got 41ms apart",
        ],
      },
    },
  ],
  close: {
    kind: "answer",
    text: "The host reads every manifest first, without loading plugin code. It resolves the dependency graph from what each plugin `provides` and `requires`, then activates plugins in graph order.\n\nOne test fails: `git` and `shell` have no dependency between them and start 41ms apart, but the test expects them to start together.",
    ms: 3200,
  },
};

export const FORM_TITLE = "Before I rewrite the concurrency test";

const OVERLAP: Question = {
  kind: "select",
  prompt: "How should the test tell that two plugins started together?",
  options: [
    { label: "Spans overlap", description: "each starts before the other finishes" },
    { label: "Starts close together", description: "both start within a few milliseconds" },
    { label: "Neither waits", description: "no plugin awaits another's start" },
  ],
  recommendation: {
    answer: "Spans overlap",
    reason: "It holds on a slow machine, where start times drift apart.",
  },
};

const FINISH_TIMES: Question = {
  kind: "confirm",
  prompt: "Can bootAndRecord return when each plugin finished, as well as when it started?",
  recommendation: { answer: "Yes", reason: "The overlap check needs both ends of each span." },
};

const TEST_NAME: Question = {
  kind: "input",
  prompt: "What should the test be called?",
  recommendation: {
    answer: "starts independent plugins concurrently",
    reason: "It says what is checked, not how.",
  },
};

const HELPER: Question = {
  kind: "select",
  prompt: "Where should the overlap check live?",
  options: [
    { label: "In host.test.ts", description: "next to the one test that uses it" },
    { label: "In test/support.ts", description: "beside bootAndRecord" },
  ],
  recommendation: { answer: "In host.test.ts", reason: "Only this test uses it." },
};

/** Every kind of question: a select with descriptions, a yes or no, a written one, a short select. */
export const FORM_QUESTIONS: readonly Question[] = [OVERLAP, FINISH_TIMES, TEST_NAME, HELPER];

export const ASK: Script = {
  prompt: {
    kind: "text",
    text: "/qna fix the test so it checks they start concurrently. Don't change the host itself.",
  },
  beats: [
    {
      kind: "think",
      ms: 4200,
      text: "The test compares start order, which says nothing about overlap. Two plugins that start together can still start in either order. There is more than one fair way to judge overlap, and the helper may need to record more than it does. I should look before I ask.",
    },
    {
      kind: "say",
      ms: 1800,
      text: "The test checks start **order**, not overlap. Looking at what `bootAndRecord` records before I ask.",
    },
    { kind: "act", ms: 1100, action: { kind: "read", path: "kernel/test/host.test.ts" } },
    { kind: "act", ms: 1000, action: { kind: "search", pattern: "bootAndRecord", hits: 2 } },
  ],
  close: { kind: "questions", title: FORM_TITLE, questions: FORM_QUESTIONS, ms: 4800 },
};

export const FIX: Script = {
  prompt: {
    kind: "answers",
    title: FORM_TITLE,
    answered: [
      {
        question: OVERLAP,
        answer: {
          kind: "picked",
          option: "Spans overlap",
          notes: [{ option: "Starts close together", text: "CI is slow, so no timing margins." }],
        },
      },
      { question: FINISH_TIMES, answer: { kind: "skipped" } },
      {
        question: TEST_NAME,
        answer: { kind: "written", text: "runs independent plugins at the same time" },
      },
      {
        question: HELPER,
        answer: { kind: "own", text: "Inline it. It is one comparison.", notes: [] },
      },
    ],
    context: "Keep the test under twenty lines.",
  },
  beats: [
    {
      kind: "think",
      ms: 3000,
      text: "Spans overlap, with no timing margins. The finish-times question was skipped, but spans need both ends, so bootAndRecord should return start and finish times, the test gets the new name, and the comparison goes inline. The helper lives in kernel/test/support.ts.",
    },
    { kind: "act", ms: 900, action: { kind: "read", path: "kernel/test/support.ts" } },
    {
      kind: "say",
      ms: 1800,
      text: "`bootAndRecord` keeps only start times. Adding finish times, then the overlap check.",
    },
    {
      kind: "act",
      ms: 1800,
      action: {
        kind: "edit",
        path: "kernel/test/support.ts",
        diff: [
          { change: "kept", text: "export const bootAndRecord = (graph: Graph) =>" },
          { change: "removed", text: "  record(graph, (plugin) => plugin.startedAt);" },
          {
            change: "added",
            text: "  record(graph, (plugin) => [plugin.startedAt, plugin.finishedAt]);",
          },
        ],
      },
    },
    {
      kind: "act",
      ms: 2600,
      action: {
        kind: "edit",
        path: "kernel/test/host.test.ts",
        diff: [
          { change: "removed", text: '  it("activates independent plugins together", () =>' },
          { change: "added", text: '  it("runs independent plugins at the same time", () =>' },
          { change: "kept", text: "    const started = yield* bootAndRecord(graph);" },
          { change: "removed", text: '    expect(started).toEqual(["git", "shell"]);' },
          {
            change: "added",
            text: "    const [[gitStart, gitEnd], [shellStart, shellEnd]] = started;",
          },
          {
            change: "added",
            text: "    expect(gitStart < shellEnd && shellStart < gitEnd).toBe(true);",
          },
        ],
      },
    },
    { kind: "say", ms: 1600, text: "Running the kernel tests against the new check." },
    {
      kind: "act",
      ms: 5200,
      action: {
        kind: "run",
        command: "bun test kernel",
        hasPassed: true,
        output: [
          "kernel/test/host.test.ts:",
          "✓ reads manifests before loading code",
          "✓ resolves the graph from provides and requires",
          "✓ runs independent plugins at the same time",
          "42 pass, 0 fail",
        ],
      },
    },
    {
      kind: "act",
      ms: 3600,
      action: {
        kind: "checks",
        checks: [
          { name: "format", hasPassed: true },
          { name: "types", hasPassed: true },
          { name: "lint", hasPassed: false },
          { name: "tests", hasPassed: true },
        ],
      },
    },
    { kind: "say", ms: 1600, text: "Tests pass, but **lint** fails on the test file." },
    {
      kind: "think",
      ms: 2200,
      text: "Lint flags the Effect import, which the old assertion used and the new one does not. Dropping it.",
    },
    {
      kind: "act",
      ms: 1400,
      action: {
        kind: "edit",
        path: "kernel/test/host.test.ts",
        diff: [
          { change: "kept", text: 'import { describe, expect, it } from "bun:test";' },
          { change: "removed", text: 'import { Effect } from "effect";' },
        ],
      },
    },
    {
      kind: "act",
      ms: 3600,
      action: {
        kind: "checks",
        checks: [
          { name: "format", hasPassed: true },
          { name: "types", hasPassed: true },
          { name: "lint", hasPassed: true },
          { name: "tests", hasPassed: true },
        ],
      },
    },
  ],
  close: {
    kind: "answer",
    text: "The test is now called `runs independent plugins at the same time`. `bootAndRecord` returns when each plugin started and finished, and the test checks inline that the two spans overlap, with no timing margin.\n\nAll 42 kernel tests pass, and the host is unchanged.",
    ms: 3600,
  },
};
