/**
 * A unified patch, such as `diff`'s `createPatch` writes, with line numbers and the file's syntax
 * colors. Added and removed lines sit on a faint tint of the success and danger colors.
 */
import { pathToFiletype } from "@opentui/core";

import { mixHex } from "../theme/oklch.ts";
import { useColor, useTheme } from "../theme/theme.tsx";

/** How much of its hue a changed line's background takes. */
const TINT = 0.15;

/** How much a changed line's sign and number take. */
const SIGN_TINT = 0.3;

/** How many lines `patch` adds and removes; its file headers are not counted. */
export const changesOf = (patch: string) => {
  const lines = patch.split("\n");
  const start = lines.findIndex((line) => line.startsWith("@@"));
  const hunks = start === -1 ? [] : lines.slice(start);

  return {
    added: hunks.filter((line) => line.startsWith("+")).length,
    removed: hunks.filter((line) => line.startsWith("-")).length,
  };
};

export function Diff(props: { readonly path: string; readonly patch: string }) {
  const theme = useTheme();
  const color = useColor();

  const tint = (role: "feedback.success" | "feedback.danger", amount: number) =>
    mixHex(color("surface.base"), color(role), amount);

  return (
    <diff
      diff={props.patch}
      view="unified"
      filetype={pathToFiletype(props.path)}
      syntaxStyle={theme().syntax}
      showLineNumbers
      wrapMode="none"
      fg={color("text.base")}
      lineNumberFg={color("text.faint")}
      addedBg={tint("feedback.success", TINT)}
      removedBg={tint("feedback.danger", TINT)}
      addedLineNumberBg={tint("feedback.success", SIGN_TINT)}
      removedLineNumberBg={tint("feedback.danger", SIGN_TINT)}
      addedSignColor={color("feedback.success")}
      removedSignColor={color("feedback.danger")}
    />
  );
}
