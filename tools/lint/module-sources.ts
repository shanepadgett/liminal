/** Visits every module specifier a file names: imports, re-exports and dynamic imports. */
import type { ESTree, Visitor } from "@oxlint/plugins";

export interface SourceVisit {
  readonly specifier: string;
  readonly node: ESTree.Node;
  readonly dynamic: boolean;
}

export const visitSources = (onSource: (visit: SourceVisit) => void): Visitor => {
  const fromLiteral = (source: ESTree.Node | null, dynamic: boolean) => {
    if (source?.type === "Literal" && typeof source.value === "string") {
      onSource({ specifier: source.value, node: source, dynamic });
    }
  };

  return {
    ImportDeclaration(node) {
      fromLiteral(node.source, false);
    },
    ExportNamedDeclaration(node) {
      fromLiteral(node.source, false);
    },
    ExportAllDeclaration(node) {
      fromLiteral(node.source, false);
    },
    ImportExpression(node) {
      fromLiteral(node.source, true);
    },
  };
};
