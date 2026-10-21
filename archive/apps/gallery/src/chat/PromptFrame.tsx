/**
 * The frame of a custom prompt, the surface that takes the composer's place when the app needs a
 * decision from the user. It is the composer's own chrome: the raised surface with its top row that
 * glides while the prompt waits on work, the prompt's body, the model line, and the prompt's key
 * hints directly below. The user's draft is not shown; it comes back when the prompt ends.
 */

import type { JSX } from "@opentui/solid";

import { type Hint, Hints, type RoleColor } from "@liminal/sdk/tui";

import { type ApprovalMode, ModelLine } from "./ModelLine.tsx";
import { ScanLine } from "./ScanLine.tsx";

export function PromptFrame(props: {
  readonly color: RoleColor;
  readonly approval: ApprovalMode;
  readonly hints: readonly Hint[];
  /** Whether the prompt waits on work, so its top row glides. */
  readonly isWorking?: boolean;
  readonly children: JSX.Element;
}) {
  const surface = () => props.color("surface.raised");

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="column" backgroundColor={surface()}>
        <ScanLine color={props.color} surface={surface()} isWorking={props.isWorking ?? false} />
        <box flexDirection="column" paddingX={2} paddingBottom={1}>
          {props.children}
          <ModelLine
            color={props.color}
            model="claude-opus-4"
            thinking="high"
            approval={props.approval}
            isSpaced
          />
        </box>
      </box>
      <box flexDirection="row" paddingX={2}>
        <Hints color={props.color} hints={props.hints} />
      </box>
    </box>
  );
}
