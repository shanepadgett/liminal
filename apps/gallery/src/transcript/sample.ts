/**
 * One sample session that every transcript style draws: the user asks how the plugin host boots,
 * then asks for a test fix. Each tool also has running and failed versions for the component
 * pages.
 */

import type {
  AskCall,
  ChecksCall,
  EditCall,
  ReadCall,
  RunCall,
  SearchCall,
  ThinkingEntry,
  ToolCall,
  ToolKind,
  Turn,
} from "./entries.ts";

/** One call of each tool, keyed by the tool. */
type CallPerTool = { readonly [Kind in ToolKind]: Extract<ToolCall, { readonly kind: Kind }> };

const RUNNING = { status: "running" } as const;

export const THINKING: ThinkingEntry = {
  kind: "thinking",
  id: "thinking-boot",
  seconds: 12,
  text: "The user wants the boot sequence. The host lives in kernel/src/host.ts. I should read it and the manifest loader, then find where plugins are defined to see what they declare.",
};

const READ: ReadCall = {
  kind: "read",
  id: "read-host",
  path: "kernel/src/host.ts",
  outcome: {
    status: "done",
    result: {
      totalLines: 184,
      excerpt: [
        'export const boot = Effect.fn("Host.boot")(function* (root: string) {',
        "  const manifests = yield* readManifests(root);",
        "  const graph = yield* resolveGraph(manifests);",
        "  return yield* activateInOrder(graph);",
      ],
    },
  },
};

const READ_MANIFEST: ReadCall = {
  kind: "read",
  id: "read-manifest",
  path: "kernel/src/manifest.ts",
  outcome: {
    status: "done",
    result: {
      totalLines: 96,
      excerpt: ["export const Manifest = Schema.Struct({", "  name: Schema.String,"],
    },
  },
};

const SEARCH: SearchCall = {
  kind: "search",
  id: "search-define",
  pattern: "definePlugin",
  scope: "plugins/",
  outcome: {
    status: "done",
    result: {
      matches: [
        { path: "plugins/git/src/plugin.ts", line: 8, text: "export default definePlugin({" },
        { path: "plugins/shell/src/plugin.ts", line: 11, text: "export default definePlugin({" },
        { path: "plugins/web/src/plugin.ts", line: 6, text: "export default definePlugin({" },
      ],
    },
  },
};

const RUN_FAILED: RunCall = {
  kind: "run",
  id: "run-tests-failed",
  command: "bun test kernel",
  outcome: {
    status: "failed",
    error: "exit code 1",
    output: [
      "kernel/test/host.test.ts:",
      "✓ reads manifests before loading code",
      "✗ activates independent plugins together",
      "  expected [git, shell] to start within 5ms, got 41ms apart",
    ],
  },
};

const ASK: AskCall = {
  kind: "ask",
  id: "ask-check",
  question: "How should the test tell that two plugins started together?",
  options: ["Their start times overlap", "Neither waits for the other to finish"],
  outcome: { status: "done", result: { answer: "Their start times overlap" } },
};

const EDIT: EditCall = {
  kind: "edit",
  id: "edit-test",
  path: "kernel/test/host.test.ts",
  outcome: {
    status: "done",
    result: {
      diff: [
        { change: "kept", number: 42, text: "  const started = yield* bootAndRecord(graph);" },
        { change: "removed", number: 43, text: '  expect(started).toEqual(["git", "shell"]);' },
        { change: "added", number: 43, text: "  const [git, shell] = started;" },
        { change: "added", number: 44, text: "  expect(overlaps(git, shell)).toBe(true);" },
        { change: "kept", number: 45, text: "});" },
      ],
    },
  },
};

const RUN: RunCall = {
  kind: "run",
  id: "run-tests",
  command: "bun test kernel",
  outcome: {
    status: "done",
    result: {
      hiddenLines: 12,
      output: [
        "kernel/test/host.test.ts:",
        "✓ reads manifests before loading code",
        "✓ activates independent plugins together",
        "42 pass, 0 fail",
      ],
    },
  },
};

const CHECKS: ChecksCall = {
  kind: "checks",
  id: "checks",
  outcome: {
    status: "done",
    result: {
      checks: [
        { name: "format", hasPassed: true, summary: "clean" },
        { name: "types", hasPassed: true, summary: "clean" },
        { name: "lint", hasPassed: true, summary: "clean" },
        { name: "tests", hasPassed: true, summary: "42 pass" },
      ],
    },
  },
};

/** Each tool done, caught while running, and after failing, for the component pages. */
export const DONE_CALLS: CallPerTool = {
  read: READ,
  edit: EDIT,
  run: RUN,
  search: SEARCH,
  checks: CHECKS,
  ask: ASK,
};

export const RUNNING_CALLS: CallPerTool = {
  read: { ...READ, outcome: RUNNING },
  edit: { ...EDIT, outcome: RUNNING },
  run: { ...RUN, outcome: RUNNING },
  search: { ...SEARCH, outcome: RUNNING },
  checks: { ...CHECKS, outcome: RUNNING },
  ask: { ...ASK, outcome: RUNNING },
};

export const FAILED_CALLS: CallPerTool = {
  read: {
    ...READ,
    path: "kernel/src/boot.ts",
    outcome: { status: "failed", error: "No file at kernel/src/boot.ts", output: [] },
  },
  edit: {
    ...EDIT,
    outcome: { status: "failed", error: "The text to replace is not in the file", output: [] },
  },
  run: RUN_FAILED,
  search: {
    ...SEARCH,
    pattern: "definePlugin(",
    outcome: { status: "failed", error: "Unclosed group in pattern definePlugin(", output: [] },
  },
  checks: {
    ...CHECKS,
    outcome: {
      status: "failed",
      error: "1 of 4 checks failed",
      output: ["lint  kernel/src/host.ts:31 max-lines-per-function"],
    },
  },
  ask: {
    ...ASK,
    outcome: { status: "failed", error: "The user dismissed the question", output: [] },
  },
};

const BOOT_TURN: Turn = [
  { kind: "user", id: "user-boot", text: "explain how the plugin host boots" },
  THINKING,
  READ,
  READ_MANIFEST,
  SEARCH,
  {
    kind: "interim",
    id: "interim-boot",
    text: "The host reads manifests before any plugin code. Running the kernel tests to confirm the activation order.",
  },
  RUN_FAILED,
  { kind: "worked", id: "worked-boot", seconds: 125 },
  {
    kind: "answer",
    id: "answer-boot",
    text: "The host reads every manifest first, without loading plugin code. It resolves the dependency graph from what each plugin provides and requires, then activates plugins in graph order. One test fails: two plugins with no dependency between them start 41ms apart, but the test expects them to start together.",
  },
];

const FIX_STARTED: Turn = [
  { kind: "user", id: "user-fix", text: "fix the test so it checks they start concurrently" },
  {
    kind: "thinking",
    id: "thinking-fix",
    seconds: 6,
    text: "The test compares start order, which says nothing about overlap. It should record start and end times and check that they overlap.",
  },
  ASK,
  EDIT,
];

const FIX_TURN: Turn = [
  ...FIX_STARTED,
  RUN,
  CHECKS,
  { kind: "worked", id: "worked-fix", seconds: 48 },
  {
    kind: "answer",
    id: "answer-fix",
    text: "The test now records when each plugin starts and finishes and checks that git and shell overlap. All 42 kernel tests pass.",
  },
];

/** The session while the assistant is still running the tests for the fix. */
export const WORKING_SESSION: readonly Turn[] = [BOOT_TURN, [...FIX_STARTED, RUNNING_CALLS.run]];

export const FINISHED_SESSION: readonly Turn[] = [BOOT_TURN, FIX_TURN];

/** The row the full-screen sample shows open. */
export const EXPANDED_ID = EDIT.id;
