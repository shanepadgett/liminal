/** Effect rules the Effect language service does not cover. */
import { defineRule, type ESTree, type Rule } from "@oxlint/plugins";

const isTagAccess = (node: ESTree.Node) =>
  node.type === "MemberExpression"
  && !node.computed
  && node.property.type === "Identifier"
  && node.property.name === "_tag";

/** Branch on tags with Match, catchTag or Predicate.isTagged, not `x._tag === "A"`. */
export const noManualTagCheck: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { tag: "Use Match, Effect.catchTag or Predicate.isTagged instead of reading _tag." },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (!["===", "!==", "==", "!="].includes(node.operator)) return;

        if (isTagAccess(node.left) || isTagAccess(node.right))
          context.report({ node, messageId: "tag" });
      },
      SwitchStatement(node) {
        if (isTagAccess(node.discriminant))
          context.report({ node: node.discriminant, messageId: "tag" });
      },
    };
  },
});

const isTagKey = (property: ESTree.Node) =>
  property.type === "Property"
  && !property.computed
  && ((property.key.type === "Identifier" && property.key.name === "_tag")
    || (property.key.type === "Literal" && property.key.value === "_tag"));

const isMatchPattern = (node: ESTree.ObjectExpression) => {
  const call = node.parent;
  if (call.type !== "CallExpression" || call.callee.type !== "MemberExpression") return false;

  return call.callee.object.type === "Identifier" && call.callee.object.name === "Match";
};

/**
 * Build tagged values with their constructors (Schema, Data.TaggedError, taggedEnum), not object
 * literals.
 */
export const noManualTaggedObject: Rule = defineRule({
  meta: {
    type: "suggestion",
    messages: { tagged: "Use the tagged type's constructor instead of writing _tag by hand." },
  },
  create(context) {
    return {
      ObjectExpression(node) {
        if (node.properties.some(isTagKey) && !isMatchPattern(node))
          context.report({ node, messageId: "tagged" });
      },
    };
  },
});

const runtimes = new Set(["Effect", "BunRuntime", "NodeRuntime", "Runtime", "ManagedRuntime"]);

/** Effects run only at the app edge; libraries return Effects. */
export const noEffectRun: Rule = defineRule({
  meta: { type: "problem", messages: { run: "Return the Effect; only apps run Effects." } },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return;

        if (callee.property.type !== "Identifier" || !callee.property.name.startsWith("run"))
          return;

        if (runtimes.has(callee.object.name)) context.report({ node, messageId: "run" });
      },
    };
  },
});
