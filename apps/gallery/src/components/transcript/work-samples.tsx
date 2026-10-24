/** Sample tool calls the transcript states and the chat screen share, with what each opens. */

import { For } from "solid-js";

import { changesOf, Diff } from "../../primitives/Diff.tsx";
import { useColor } from "../../theme/theme.tsx";
import { DetailLines, type WorkRow } from "./WorkRows.tsx";

/** A script the model ran: long enough that its row cuts it in the middle. */
export const SCRIPT = [
  "for plugin in packages/plugins/*/; do",
  '  bun test "$plugin" --bail --timeout 20000 || echo "failed: $plugin"',
  "done",
].join("\n");

const TURN = "packages/plugins/loop/src/turn.ts";

const TURN_PATCH = [
  `--- ${TURN}`,
  `+++ ${TURN}`,
  "@@ -40,6 +40,5 @@",
  ' const step = Effect.fn("step")(function* (request: StepRequest) {',
  "   const reply = yield* model.reply(request).pipe(",
  "-    Effect.retry({ times: 1 }),",
  "     Effect.timeout(STEP_TIMEOUT),",
  "   );",
  " ",
].join("\n");

const SOURCES = [
  { title: "Schedule | Effect Documentation", url: "https://effect.website/docs/scheduling" },
  { title: "Retry-After header", url: "https://developer.mozilla.org/docs/Web/HTTP/Headers" },
  { title: "Rate limits", url: "https://docs.anthropic.com/en/api/rate-limits" },
];

const TEST_COMMAND =
  "bun test packages/plugins/loop --bail --timeout 20000 --reporter=junit --reporter-outfile=.cache/loop.xml";

const TEST_OUTPUT = [
  "recovery.test.ts:",
  "✓ retries an overloaded request [12.40ms]",
  "turn.test.ts:",
  "✗ retries a failed step once [3.10ms]",
  "  expected 2 attempts, received 1",
  "",
  " 1 pass",
  " 1 fail",
];

/** A command and the end of its output, opened under a shell row. */
function ShellDetails(props: { readonly command: string; readonly output: readonly string[] }) {
  const color = useColor();

  return (
    <box>
      <box marginLeft={2} paddingLeft={1} border={["left"]} borderColor={color("border.subtle")}>
        <text fg={color("text.muted")}>{props.command}</text>
      </box>
      <DetailLines lines={props.output} />
    </box>
  );
}

/** A search's sources, opened under its row. */
function Sources() {
  const color = useColor();

  return (
    <box marginLeft={2} paddingLeft={1} border={["left"]} borderColor={color("border.subtle")}>
      <For each={SOURCES}>
        {(source) => (
          <text wrapMode="none" fg={color("text.faint")}>
            <span style={{ fg: color("text.muted") }}>{source.title}</span> {source.url}
          </text>
        )}
      </For>
    </box>
  );
}

const SEARCH: WorkRow = {
  tool: "websearch",
  input: "effect schedule retry-after header",
  status: "done",
  note: `${SOURCES.length} sources, exa`,
  details: () => <Sources />,
};

export const READING: readonly WorkRow[] = [
  { tool: "read", input: "packages/plugins/loop/src/recovery.ts", status: "done" },
  SEARCH,
  { tool: "read", input: TURN, status: "running" },
];

/** The same reads, finished. */
export const READ: readonly WorkRow[] = [
  ...READING.slice(0, -1),
  { tool: "read", input: TURN, status: "done" },
];

const { added, removed } = changesOf(TURN_PATCH);

export const EDIT: WorkRow = {
  tool: "edit",
  input: TURN,
  status: "done",
  note: `+${added} -${removed}`,
  details: () => <Diff path={TURN} patch={TURN_PATCH} />,
};

export const TESTS: WorkRow = {
  tool: "shell",
  input: "Run the loop tests",
  status: "failed",
  details: () => <ShellDetails command={TEST_COMMAND} output={TEST_OUTPUT} />,
};

export const EDITING: readonly WorkRow[] = [EDIT, TESTS];

/** The loop tests while they run, their last lines under the row. */
export const TESTING: WorkRow = {
  tool: "shell",
  input: "Run the loop tests",
  status: "running",
  tail: TEST_OUTPUT.slice(0, 3),
};

/** The script, finished, with the end of what it printed. */
export const SCRIPT_RUN: WorkRow = {
  tool: "shell",
  input: "Test every plugin",
  status: "done",
  details: () => <ShellDetails command={SCRIPT} output={["21 pass", "0 fail"]} />,
};
