/** Rules that keep type evidence honest: no unknowns in contracts, no invented narrowing. */
import { defineRule, type ESTree, type Rule } from "@oxlint/plugins";

import {
  type FunctionLike,
  functionTypes,
  hasKeyword,
  isAssertion,
  isConstAssertion,
  isLooseDictionary,
  isLooseType,
  paramName,
  paramType,
  refName,
  typeArgs,
} from "./type-nodes.ts";

type Node = ESTree.Node;

const onFunctions = (check: (fn: FunctionLike) => void) =>
  Object.fromEntries(
    functionTypes.map((type) => [
      type,
      (node: Node) => {
        if ("params" in node) check(node);
      },
    ]),
  );

const predicateSubject = (fn: FunctionLike): string | undefined => {
  const returned = fn.returnType?.typeAnnotation;
  if (returned?.type !== "TSTypePredicate") return undefined;

  return returned.parameterName.type === "Identifier" ? returned.parameterName.name : undefined;
};

/**
 * Parameters say what they accept; `unknown` is allowed only for `cause` and type-predicate
 * subjects.
 */
export const noUnknownParameters: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { unknown: "Type this parameter; parse unknown input at the boundary instead." },
  },
  create(context) {
    return onFunctions((fn) => {
      const subject = predicateSubject(fn);

      for (const param of fn.params) {
        const name = paramName(param);
        if (name === "cause" || (name !== undefined && name === subject)) continue;

        if (hasKeyword(paramType(param), "TSUnknownKeyword"))
          context.report({ node: param, messageId: "unknown" });
      }
    });
  },
});

const wrappers = new Set(["Promise", "PromiseLike", "Effect", "Option", "Array", "ReadonlyArray"]);

const returnsUnknown = (node: Node): boolean => {
  if (hasKeyword(node, "TSUnknownKeyword")) return true;
  const name = refName(node);
  const first = typeArgs(node)[0];

  return name !== undefined && wrappers.has(name) && first !== undefined && returnsUnknown(first);
};

/** Return types promise something specific, not `unknown` or `Promise<unknown>`. */
export const noUnknownReturns: Rule = defineRule({
  meta: { type: "problem", messages: { unknown: "Return a specific type, not unknown." } },
  create(context) {
    return onFunctions((fn) => {
      const returned = fn.returnType?.typeAnnotation;

      if (returned !== undefined && returnsUnknown(returned))
        context.report({ node: returned, messageId: "unknown" });
    });
  },
});

/** A type alias names a real shape; `type Payload = unknown` hides the missing one. */
export const noUnknownTypeAliases: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { unknown: "This alias is unknown under a name; describe the real type." },
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (hasKeyword(node.typeAnnotation, "TSUnknownKeyword"))
          context.report({ node, messageId: "unknown" });
      },
    };
  },
});

/** Parameters do not accept bare `object`. */
export const noObjectParameters: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { object: "`object` says nothing about the input; name its fields." },
  },
  create(context) {
    return onFunctions((fn) => {
      for (const param of fn.params) {
        if (hasKeyword(paramType(param), "TSObjectKeyword"))
          context.report({ node: param, messageId: "object" });
      }
    });
  },
});

const inConstraint = (node: Node): boolean => {
  for (let current: Node | null | undefined = node.parent; current; current = current.parent) {
    if (current.type === "TSTypeParameter") return true;
  }

  return false;
};

/** Dictionaries hold typed values, not unknown, any, object or `{}`; generic constraints are fine. */
export const noLooseDictionaries: Rule = defineRule({
  meta: { type: "problem", messages: { loose: "Type the dictionary's values." } },
  create(context) {
    const check = (node: Node) => {
      if (isLooseDictionary(node) && !inConstraint(node))
        context.report({ node, messageId: "loose" });
    };

    return { TSTypeReference: check, TSTypeLiteral: check };
  },
});

/** One assertion at a time; `x as unknown as T` invents evidence. */
export const noChainedAssertions: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { chained: "Chained assertions invent a type; parse or narrow instead." },
  },
  create(context) {
    const check = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
      if (isAssertion(node.parent) || !isAssertion(node.expression)) return;
      if (isConstAssertion(node) && isConstAssertion(node.expression)) return;
      context.report({ node, messageId: "chained" });
    };

    return { TSAsExpression: check, TSTypeAssertion: check };
  },
});

const statementOf = (node: Node): Node => {
  let current = node;

  for (let parent: Node | null | undefined = node.parent; parent; parent = parent.parent) {
    if (
      parent.type === "Program"
      || parent.type === "BlockStatement"
      || parent.type === "StaticBlock"
    )
      return current;

    current = parent;
  }

  return current;
};

/**
 * Every non-const assertion carries a comment saying why it holds, on its line or just above its
 * statement.
 */
export const assertionNeedsReason: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { reason: "Explain why this assertion holds in a comment above it." },
  },
  create(context) {
    const comments = context.sourceCode
      .getAllComments()
      .filter((comment) => comment.value.trim().length > 0);

    const check = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
      if (isConstAssertion(node) || isAssertion(node.parent)) return;
      const first = statementOf(node).loc.start.line - 1;
      const last = node.loc.end.line;

      const explained = comments.some(
        (comment) => comment.loc.end.line >= first && comment.loc.end.line <= last,
      );

      if (!explained) context.report({ node, messageId: "reason" });
    };

    return { TSAsExpression: check, TSTypeAssertion: check };
  },
});

/** A value declared wider than it is, then asserted back, is a cast with extra steps. */
export const noWidenThenAssert: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { widen: "'{{name}}' was widened on purpose and asserted back; keep its real type." },
  },
  create(context) {
    const widened = new Set<string>();

    const check = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
      if (node.expression.type !== "Identifier" || !widened.has(node.expression.name)) return;
      context.report({ node, messageId: "widen", data: { name: node.expression.name } });
    };

    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || node.init === null) return;
        const declared = node.id.typeAnnotation?.typeAnnotation;
        if (isLooseType(declared) || isLooseDictionary(declared)) widened.add(node.id.name);
      },
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
});

const typeofTargets = (node: ESTree.BinaryExpression): readonly Node[] =>
  [node.left, node.right].filter(
    (side) => side.type === "UnaryExpression" && side.operator === "typeof",
  );

/**
 * Application code parses input with Schema instead of ad hoc `typeof` checks; `"undefined"` probes
 * are fine.
 */
export const noRuntimeTypeof: Rule = defineRule({
  meta: {
    type: "problem",
    messages: {
      typeof: "Parse this value with Schema at the boundary instead of checking typeof.",
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!["===", "!==", "==", "!="].includes(node.operator) || typeofTargets(node).length === 0)
          return;

        const other = [node.left, node.right].find((side) => side.type === "Literal");
        if (other?.type === "Literal" && other.value === "undefined") return;
        context.report({ node, messageId: "typeof" });
      },
    };
  },
});
