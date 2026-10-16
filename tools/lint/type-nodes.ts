/** Small readers over TypeScript type and function nodes shared by the type-evidence rules. */
import type { ESTree } from "@oxlint/plugins";

type Node = ESTree.Node;

/** A function-like node that declares parameters and maybe a return type. */
export interface FunctionLike {
  readonly params: readonly Node[];
  readonly returnType?: { readonly typeAnnotation: Node } | null;
}

export const functionTypes = [
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "TSMethodSignature",
  "TSFunctionType",
] as const;

const unwrap = (node: Node): Node =>
  node.type === "TSParenthesizedType" ? unwrap(node.typeAnnotation) : node;

/** True when the type is `type` itself or a union with a `type` member. */
export const hasKeyword = (node: Node | undefined, type: string): boolean => {
  if (node === undefined) return false;
  const inner = unwrap(node);
  if (inner.type === "TSUnionType") return inner.types.some((member) => hasKeyword(member, type));

  return inner.type === type;
};

/** The type arguments of a type reference such as `Promise<unknown>`. */
export const typeArgs = (node: Node): readonly Node[] =>
  node.type === "TSTypeReference" ? (node.typeArguments?.params ?? []) : [];

/** The plain name of a type reference, if it has one. */
export const refName = (node: Node): string | undefined =>
  node.type === "TSTypeReference" && node.typeName.type === "Identifier"
    ? node.typeName.name
    : undefined;

/** Unknown, any, object, or an empty object literal type: values with no evidence. */
export const isLooseType = (node: Node | undefined): boolean => {
  if (node === undefined) return false;
  const inner = unwrap(node);
  if (inner.type === "TSTypeLiteral") return inner.members.length === 0;

  return ["TSUnknownKeyword", "TSAnyKeyword", "TSObjectKeyword"].some((type) =>
    hasKeyword(inner, type),
  );
};

/** A `Record<string, loose>` or a type literal whose index signature has a loose value. */
export const isLooseDictionary = (node: Node | undefined): boolean => {
  if (node === undefined) return false;
  const inner = unwrap(node);
  if (refName(inner) === "Record") return isLooseType(typeArgs(inner)[1]);
  if (inner.type !== "TSTypeLiteral") return false;

  return inner.members.some(
    (member) =>
      member.type === "TSIndexSignature" && isLooseType(member.typeAnnotation.typeAnnotation),
  );
};

/** The annotated type of a parameter, looking through defaults, rest and parameter properties. */
export const paramType = (param: Node): Node | undefined => {
  if (param.type === "TSParameterProperty") return paramType(param.parameter);
  if (param.type === "AssignmentPattern") return paramType(param.left);

  if (
    param.type === "Identifier"
    || param.type === "ObjectPattern"
    || param.type === "ArrayPattern"
    || param.type === "RestElement"
  ) {
    return param.typeAnnotation?.typeAnnotation;
  }

  return undefined;
};

/** The bound name of a simple parameter. */
export const paramName = (param: Node): string | undefined => {
  if (param.type === "TSParameterProperty") return paramName(param.parameter);
  if (param.type === "AssignmentPattern") return paramName(param.left);

  return param.type === "Identifier" ? param.name : undefined;
};

/** True for `as const` and `<const>` assertions. */
export const isConstAssertion = (node: Node): boolean =>
  (node.type === "TSAsExpression" || node.type === "TSTypeAssertion")
  && refName(node.typeAnnotation) === "const";

export const isAssertion = (
  node: Node | null | undefined,
): node is ESTree.TSAsExpression | ESTree.TSTypeAssertion =>
  node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion";
