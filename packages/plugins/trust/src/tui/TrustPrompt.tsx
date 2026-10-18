/**
 * The trust prompt, in the composer's place: the composer's raised surface asking whether to trust
 * the workspace folder, with what trusting it loads. Enter trusts it; esc leaves it untrusted for
 * this run. A failed save shows under the question.
 */

import type { Accessor } from "solid-js";
import { Show } from "solid-js";

import { enterKeys, type Hint, Hints, useBindings, useColor } from "@liminal/sdk/tui";

/** What the prompt reads and does, made once by the part's setup. */
export interface PromptDeps {
  readonly workspace: Accessor<string>;
  /** The last trust's failure, if it failed. */
  readonly problem: Accessor<string>;
  /** Whether a dialog is open, which takes the keys. */
  readonly dialogOpen: Accessor<boolean>;
  readonly trust: () => void;
  /** Leaves the workspace untrusted for this run. */
  readonly decline: () => void;
}

const hints: readonly Hint[] = [
  ["enter", "trust"],
  ["esc", "not now"],
];

const EXPLAIN =
  "Trusting it loads the settings and plugins in its .liminal folder, and plugins can run code. Its subfolders are trusted too.";

const promptKeys = (dialogOpen: boolean) =>
  dialogOpen ? [] : [...enterKeys("trust.yes"), { key: "escape", cmd: "trust.no" }];

export const makePrompt = (deps: PromptDeps) =>
  function TrustPrompt() {
    const color = useColor();

    useBindings(() => ({
      commands: [
        { name: "trust.yes", run: deps.trust },
        { name: "trust.no", run: deps.decline },
      ],
      bindings: promptKeys(deps.dialogOpen()),
    }));

    return (
      <box
        flexDirection="column"
        flexShrink={0}
        backgroundColor={color("surface.raised")}
        paddingX={2}
        paddingY={1}
      >
        <text fg={color("text.base")}>Trust this folder?</text>
        <text fg={color("text.accent")}>{deps.workspace()}</text>
        <text fg={color("text.muted")} marginTop={1}>
          {EXPLAIN}
        </text>
        <Show when={deps.problem() !== ""}>
          <text fg={color("feedback.danger")} marginTop={1}>
            {deps.problem()}
          </text>
        </Show>
      </box>
    );
  };

export function TrustHints() {
  const color = useColor();

  return <Hints color={color} hints={hints} />;
}
