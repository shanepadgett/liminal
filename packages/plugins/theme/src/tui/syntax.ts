/** Colors for code, markdown and diffs, picked from the palette's roles. */

import { type NativeResourceOwner, SyntaxStyle, type ThemeTokenStyle } from "@opentui/core";

import type { RoleName } from "@shanepadgett/liminal-client";
import type { RoleColor } from "@shanepadgett/liminal-tui";

type Look = Omit<ThemeTokenStyle["style"], "foreground">;

const rule = (scope: string[], role: RoleName, look: Look = {}) => ({ scope, role, look });

const RULES = [
  rule(["default"], "text.base"),
  rule(["comment", "comment.documentation"], "text.faint", { italic: true }),
  rule(["keyword", "keyword.return", "keyword.conditional", "keyword.import"], "text.accent"),
  rule(["string", "character"], "feedback.success"),
  rule(["number", "boolean", "constant", "constant.builtin"], "feedback.warning"),
  rule(["function", "function.call", "function.method", "constructor"], "feedback.info"),
  rule(["type", "type.builtin", "type.definition"], "text.heading"),
  rule(["operator", "punctuation", "punctuation.bracket", "punctuation.delimiter"], "text.muted"),
  rule(["markup.heading"], "text.heading", { bold: true }),
  rule(["markup.strong", "markup.bold"], "text.base", { bold: true }),
  rule(["markup.italic"], "text.base", { italic: true }),
  rule(["markup.list"], "text.accent"),
  rule(["markup.quote"], "text.muted", { italic: true }),
  rule(["markup.raw", "markup.raw.block", "markup.raw.inline"], "text.accent"),
  rule(["markup.link", "markup.link.url"], "feedback.info", { underline: true }),
  rule(["markup.link.label"], "text.base", { underline: true }),
];

export const syntaxStyle = (color: RoleColor, owner: NativeResourceOwner): SyntaxStyle =>
  SyntaxStyle.fromTheme(
    RULES.map((each) => ({
      scope: each.scope,
      style: { foreground: color(each.role), ...each.look },
    })),
    owner,
  );
