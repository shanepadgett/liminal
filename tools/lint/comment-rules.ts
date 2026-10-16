/**
 * Rules against comment slop: narration, placeholders, dividers, dead code, jargon and walls of
 * prose.
 */
import { defineRule, type ESTree, type Rule } from "@oxlint/plugins";

type Comment = ESTree.Comment;

const isJsDoc = (comment: Comment) => comment.type === "Block" && comment.value.startsWith("*");

const directive = /^\s*(eslint|oxlint|@ts-|prettier|biome|istanbul|c8|@effect-|#region|#endregion)/;

/** Comments written for readers: not JSDoc, not tool directives. */
const proseComments = (comments: readonly Comment[]) =>
  comments.filter((comment) => !isJsDoc(comment) && !directive.test(comment.value));

/** The text of a comment without JSDoc stars, one entry per line. */
const commentLines = (comment: Comment): string[] =>
  comment.value
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
    .filter((line) => line.length > 0);

const reportMatching = (patterns: readonly RegExp[], messageId: string): Rule =>
  defineRule({
    meta: { type: "suggestion", messages: { [messageId]: messageText[messageId] ?? messageId } },
    create(context) {
      return {
        Program() {
          for (const comment of proseComments(context.sourceCode.getAllComments())) {
            if (
              commentLines(comment).some((line) => patterns.some((pattern) => pattern.test(line)))
            ) {
              context.report({ loc: comment.loc, messageId });
            }
          }
        },
      };
    },
  });

const messageText: Record<string, string> = {
  narration: "This comment narrates the code. Say why, or delete it.",
  placeholder: "Placeholder or apology comment. Finish the work or say what is missing and why.",
  divider: "Divider comments add noise; split the file or let declarations speak.",
  code: "Commented-out code. Delete it; git keeps history.",
};

export const noNarrationComments = reportMatching(
  [
    /^(this|the following|below|above) (function|method|class|code|block|component|helper|file|module|line|loop|section|constant|variable|type)\b/i,
    /^(here|now|next|then|first|finally),? (we|i)\b/i,
    /^(we|i) (now |then |first )?(need to|will|are going to|can now)\b/i,
    /^step \d+\b/i,
  ],
  "narration",
);

export const noPlaceholderComments = reportMatching(
  [
    /\b(rest of (the )?(code|implementation|file|logic))\b/i,
    /\b(omitted|truncated|elided) for brevity\b/i,
    /\b(your|actual|real) implementation( goes)? here\b/i,
    /\b(add|put) (your|more|the) (logic|code|implementation) here\b/i,
    /\bexisting code\b/i,
    /\b(quick|dirty) hack\b/i,
    /\bgood enough( for now)?\b/i,
    /\bfor now\b/i,
    /\btemporary (fix|workaround|hack)\b/i,
  ],
  "placeholder",
);

export const noDividerComments = reportMatching(
  [/^[\s=\-*#_~+/]{4,}$/, /^[=\-*#~]{2,}\s.*\s[=\-*#~]{2,}$/],
  "divider",
);

export const noCommentedCode = reportMatching(
  [
    /^(import|export|const|let|var|return|await|function|class|throw)\b.*[;{(=]/,
    /^(if|for|while|switch)\s*\(.*\)\s*\{?$/,
    /^[\w$.]+(\[[^\]]*\])?\s*\(.*\);$/,
    /^[\w$.]+(\[[^\]]*\])?\s*[+\-*/]?=[^=>].*;$/,
    /^[}\])]+[;,)]*$/,
  ],
  "code",
);

const defaultJargon = [
  "leverage",
  "leverages",
  "leveraging",
  "utilize",
  "utilizes",
  "utilizing",
  "utilise",
  "delve",
  "delves",
  "seamless",
  "seamlessly",
  "robust",
  "comprehensive",
  "streamline",
  "streamlines",
  "facilitate",
  "facilitates",
  "empower",
  "empowers",
  "holistic",
  "synergy",
  "cutting-edge",
  "state-of-the-art",
  "best-in-class",
  "world-class",
  "blazing",
  "blazingly",
  "elegant",
  "elegantly",
  "powerful",
  "meticulous",
  "meticulously",
];

const withoutQuoted = (text: string) => text.replaceAll(/`[^`]*`|"[^"]*"/g, "");

/** Plain words in comments, including JSDoc. */
export const noJargon: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { jargon: "Inflated word '{{word}}'. Use a plain, specific word." },
  },
  create(context) {
    const pattern = new RegExp(`\\b(${defaultJargon.join("|")})\\b`, "i");

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const word = pattern.exec(withoutQuoted(comment.value))?.[1];

          if (word !== undefined)
            context.report({ loc: comment.loc, messageId: "jargon", data: { word } });
        }
      },
    };
  },
});

/** No em dashes anywhere in source, comments or strings. */
export const noEmDash: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { dash: "Em dash. Use a comma, colon, parentheses or a new sentence." },
  },
  create(context) {
    return {
      Program() {
        const text = context.sourceCode.text;

        for (
          let index = text.indexOf("\u2014");
          index !== -1;
          index = text.indexOf("\u2014", index + 1)
        ) {
          const start = context.sourceCode.getLocFromIndex(index);
          const end = context.sourceCode.getLocFromIndex(index + 1);
          context.report({ loc: { start, end }, messageId: "dash" });
        }
      },
    };
  },
});

/** Adjacent line comments, read as one block. */
const commentGroups = (comments: readonly Comment[]): Comment[][] => {
  const groups: Comment[][] = [];

  for (const comment of comments) {
    const group = groups.at(-1);
    const previous = group?.at(-1);

    const adjacent =
      previous !== undefined
      && previous.type === "Line"
      && comment.type === "Line"
      && comment.loc.start.line === previous.loc.end.line + 1;

    if (adjacent && group !== undefined) group.push(comment);
    else groups.push([comment]);
  }

  return groups;
};

const maximumWords = 50;

/** Comments stay short; a wall of prose belongs in docs. JSDoc is exempt. */
export const maxCommentWords: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { long: "This comment has {{count}} words; keep it under {{max}}." },
  },
  create(context) {
    return {
      Program() {
        for (const group of commentGroups(proseComments(context.sourceCode.getAllComments()))) {
          const count = group.flatMap(commentLines).join(" ").split(/\s+/).length;
          const first = group[0];
          const last = group.at(-1);
          if (count <= maximumWords || first === undefined || last === undefined) continue;

          context.report({
            loc: { start: first.loc.start, end: last.loc.end },
            messageId: "long",
            data: { count: String(count), max: String(maximumWords) },
          });
        }
      },
    };
  },
});

const toJsDoc = (lines: readonly string[], indent: string) =>
  lines.length === 1
    ? `/** ${lines[0]} */`
    : ["/**", ...lines.map((line) => `${indent} * ${line}`), `${indent} */`].join("\n");

/** Exports are documented with JSDoc so editors show it; `//` above an export becomes `/** *\/`. */
export const preferJsDoc: Rule = defineRule({
  meta: {
    type: "suggestion",
    fixable: "code",
    messages: { jsdoc: "Document exports with /** */, not //." },
  },
  create(context) {
    const check = (node: ESTree.ExportNamedDeclaration | ESTree.ExportDefaultDeclaration) => {
      const before = context.sourceCode.getCommentsBefore(node);
      const group = commentGroups(before).at(-1);
      const first = group?.[0];
      const last = group?.at(-1);
      if (group === undefined || first === undefined || last === undefined) return;

      if (
        last.type !== "Line"
        || last.loc.end.line !== node.loc.start.line - 1
        || directive.test(first.value)
      )
        return;

      const lines = group.map((comment) => comment.value.trim());
      const indent = " ".repeat(first.loc.start.column);

      context.report({
        loc: { start: first.loc.start, end: last.loc.end },
        messageId: "jsdoc",
        fix: (fixer) =>
          fixer.replaceTextRange([first.range[0], last.range[1]], toJsDoc(lines, indent)),
      });
    };

    return { ExportNamedDeclaration: check, ExportDefaultDeclaration: check };
  },
});

/** A lint suppression says why: `oxlint-disable-next-line rule -- reason`. */
export const disableNeedsReason: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { reason: "Say why this rule is disabled: add ' -- <reason>'." },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim();
          if (!/^(eslint|oxlint)-disable/.test(text)) continue;
          const reason = text.split(/\s--\s/)[1]?.trim() ?? "";
          if (reason.length === 0) context.report({ loc: comment.loc, messageId: "reason" });
        }
      },
    };
  },
});
