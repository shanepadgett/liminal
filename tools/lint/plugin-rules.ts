/** Rules that keep plugin parts inside their boundaries. */
import { defineRule } from "@oxlint/plugins";

import { visitSources } from "./module-sources.ts";
import { locate, repoPath, resolveRelative } from "./plugin-parts.ts";

const isEffect = (specifier: string) => specifier === "effect" || specifier.startsWith("effect/");

const isSdk = (specifier: string) =>
  specifier === "@liminal/sdk" || specifier.startsWith("@liminal/sdk/");

const isOwnContract = (specifier: string) => /^\.\/src\/contract(\.ts)?$/.test(specifier);

const isPackageContract = (specifier: string) =>
  /^(@[^/]+\/)?[^/@.][^/]*\/contract$/.test(specifier);

/** `src/contract.ts` imports only Effect and the SDK. */
export const contractImports = defineRule({
  meta: {
    type: "problem",
    messages: { banned: "A contract imports only Effect and @liminal/sdk, not '{{specifier}}'." },
  },
  create(context) {
    if (locate(repoPath(context.cwd, context.filename))?.part !== "contract") return {};

    return visitSources(({ specifier, node }) => {
      if (isEffect(specifier) || isSdk(specifier)) return;
      context.report({ node, messageId: "banned", data: { specifier } });
    });
  },
});

const declarationTypes = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration",
  "VariableDeclaration",
  "FunctionDeclaration",
  "ClassDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "EmptyStatement",
]);

/** `src/contract.ts` declares things; it runs no statements at load. */
export const contractNoSideEffects = defineRule({
  meta: {
    type: "problem",
    messages: { statement: "A contract only declares; move this statement out of the contract." },
  },
  create(context) {
    if (locate(repoPath(context.cwd, context.filename))?.part !== "contract") return {};

    return {
      Program(program) {
        for (const statement of program.body) {
          if (declarationTypes.has(statement.type)) continue;
          context.report({ node: statement, messageId: "statement" });
        }
      },
    };
  },
});

/** `plugin.ts` statically imports only the SDK and contracts. */
export const manifestImports = defineRule({
  meta: {
    type: "problem",
    messages: { banned: "plugin.ts imports only @liminal/sdk and contracts, not '{{specifier}}'." },
  },
  create(context) {
    if (locate(repoPath(context.cwd, context.filename))?.part !== "manifest") return {};

    return visitSources(({ specifier, node, dynamic }) => {
      if (dynamic || isSdk(specifier) || isOwnContract(specifier) || isPackageContract(specifier))
        return;

      context.report({ node, messageId: "banned", data: { specifier } });
    });
  },
});

const isolatedParts = new Set(["server", "tui"]);

/** The server and tui parts of a plugin never import each other. */
export const partIsolation = defineRule({
  meta: {
    type: "problem",
    messages: { crossing: "The {{from}} part cannot import the {{to}} part." },
  },
  create(context) {
    const path = repoPath(context.cwd, context.filename);
    const from = locate(path);
    if (from === undefined || !isolatedParts.has(from.part)) return {};

    return visitSources(({ specifier, node }) => {
      const target = resolveRelative(path, specifier);
      const to = target === undefined ? undefined : locate(target);
      if (to === undefined || !isolatedParts.has(to.part) || to.part === from.part) return;
      context.report({ node, messageId: "crossing", data: { from: from.part, to: to.part } });
    });
  },
});
