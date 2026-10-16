/** Rules against code shapes agents reach for that hide intent or real seams. */
import { defineRule, type ESTree, type Rule } from "@oxlint/plugins";

const calledMethod = (node: ESTree.CallExpression): string | undefined =>
  node.callee.type === "MemberExpression" && node.callee.property.type === "Identifier"
    ? node.callee.property.name
    : undefined;

const receiver = (node: ESTree.CallExpression): ESTree.Node | undefined =>
  node.callee.type === "MemberExpression" ? node.callee.object : undefined;

/** One pass instead of `.filter(...).map(...)`; use flatMap or a loop. */
export const noFilterMap: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { twoPasses: "Use one pass (flatMap or a loop) instead of filter then {{method}}." },
  },
  create(context) {
    return {
      CallExpression(node) {
        const method = calledMethod(node);
        const inner = receiver(node);
        if (method !== "map" && method !== "flatMap") return;
        if (inner?.type !== "CallExpression" || calledMethod(inner) !== "filter") return;
        context.report({ node, messageId: "twoPasses", data: { method } });
      },
    };
  },
});

const isEmptyObject = (node: ESTree.Node) =>
  node.type === "ObjectExpression" && node.properties.length === 0;

/** `...(flag ? { a } : {})` hides which fields exist; build the object explicitly. */
export const noConditionalEmptySpread: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { spread: "Conditional spread of an empty object; set the fields explicitly." },
  },
  create(context) {
    return {
      SpreadElement(node) {
        if (node.parent.type !== "ObjectExpression") return;
        const argument = node.argument;

        const conditional =
          argument.type === "ConditionalExpression"
          && (isEmptyObject(argument.consequent) || isEmptyObject(argument.alternate));

        const guarded = argument.type === "LogicalExpression" && argument.operator === "&&";
        if (conditional || guarded) context.report({ node, messageId: "spread" });
      },
    };
  },
});

const mockCalls: Record<string, readonly string[]> = {
  mock: ["module"],
  vi: ["mock", "doMock", "unstable_mockModule"],
  jest: ["mock", "doMock", "unstable_mockModule"],
};

/** Tests swap dependencies through Layers, not by mocking modules. */
export const noModuleMocking: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { mock: "Provide a test Layer instead of mocking a module." },
  },
  create(context) {
    return {
      CallExpression(node) {
        const target = receiver(node);
        const method = calledMethod(node);
        if (target?.type !== "Identifier" || method === undefined) return;

        if (mockCalls[target.name]?.includes(method) === true)
          context.report({ node, messageId: "mock" });
      },
    };
  },
});

/** `Reflect` bypasses types; call and read properties directly. */
export const noReflect: Rule = defineRule({
  meta: {
    type: "problem",
    messages: { reflect: "Use typed calls and property access instead of Reflect." },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.type === "Identifier" && node.object.name === "Reflect")
          context.report({ node, messageId: "reflect" });
      },
    };
  },
});
