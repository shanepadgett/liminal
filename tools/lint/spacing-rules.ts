/** Blank-line rules the formatter cannot apply: it keeps blank lines but never adds them. */
import { defineRule, type ESTree, type Rule } from "@oxlint/plugins";

type Node = ESTree.Node;

const isMultiline = (node: Node): boolean => node.loc.start.line !== node.loc.end.line;

const blankLine = /\n[\t ]*\n/u;

const exempt = (previous: Node, next: Node): boolean =>
  previous.type === "ImportDeclaration"
  || next.type === "ImportDeclaration"
  || previous.type === "TSDeclareFunction";

const needsPadding = (previous: Node, next: Node): boolean =>
  !exempt(previous, next)
  && (next.type === "ReturnStatement" || isMultiline(previous) || isMultiline(next));

/** Steps read like paragraphs: a blank line before `return` and around multi-line statements. */
export const paddingLines: Rule = defineRule({
  meta: {
    type: "layout",
    fixable: "whitespace",
    messages: { blank: "Add a blank line before this statement." },
  },
  create(context) {
    const { text } = context.sourceCode;

    const check = (nodes: readonly Node[]) => {
      for (const [index, next] of nodes.entries()) {
        const previous = nodes[index - 1];
        if (previous === undefined || !needsPadding(previous, next)) continue;
        if (blankLine.test(text.slice(previous.range[1], next.range[0]))) continue;
        const lineEnd = text.indexOf("\n", previous.range[1]);

        context.report({
          node: next,
          messageId: "blank",
          fix: (fixer) => fixer.insertTextAfterRange([lineEnd, lineEnd], "\n"),
        });
      }
    };

    return {
      Program: (node) => {
        check(node.body);
      },
      BlockStatement: (node) => {
        check(node.body);
      },
      StaticBlock: (node) => {
        check(node.body);
      },
      SwitchCase: (node) => {
        check(node.consequent);
      },
      ClassBody: (node) => {
        check(node.body);
      },
      TSModuleBlock: (node) => {
        check(node.body);
      },
    };
  },
});
