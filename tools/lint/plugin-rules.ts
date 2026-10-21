/** Rules that keep plugin entries inside their boundaries. */
import { defineRule } from "@oxlint/plugins";

import { visitSources } from "./module-sources.ts";
import { locate, type PluginEntry, repoPath, resolveRelative } from "./plugin-entries.ts";

const isEffect = (specifier: string) => specifier === "effect" || specifier.startsWith("effect/");

const isCore = (specifier: string) => specifier === "@shanepadgett/liminal-core";

/** Liminal packages that are not plugins, so their root export is public. */
const nonPluginPackages = new Set(["core", "client", "tui"]);

const liminalPackage = (specifier: string): { name: string; subpath: string } | undefined => {
  const match = /^@shanepadgett\/liminal-([^/]+)(\/.*)?$/.exec(specifier);
  if (match?.[1] === undefined) return undefined;

  return { name: match[1], subpath: match[2] ?? "" };
};

const isPluginContract = (specifier: string) => {
  const target = liminalPackage(specifier);

  return target !== undefined && target.subpath === "/contract";
};

/** `src/contract.ts` statically imports only Effect, core and other plugins' contracts. */
export const contractImports = defineRule({
  meta: {
    type: "problem",
    messages: {
      banned:
        "A contract imports only effect, @shanepadgett/liminal-core and contracts, not '{{specifier}}'.",
    },
  },
  create(context) {
    if (locate(repoPath(context.cwd, context.filename))?.entry !== "contract") return {};

    return visitSources(({ specifier, node, dynamic }) => {
      const isAllowed =
        !dynamic && (isEffect(specifier) || isCore(specifier) || isPluginContract(specifier));

      if (isAllowed) return;
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
    if (locate(repoPath(context.cwd, context.filename))?.entry !== "contract") return {};

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

/** A plugin or `packages/client` reaches a plugin only through its `/contract` export. */
export const pluginImports = defineRule({
  meta: {
    type: "problem",
    messages: {
      banned:
        "Import another plugin only through its contract: '@shanepadgett/liminal-{{name}}/contract'.",
    },
  },
  create(context) {
    const path = repoPath(context.cwd, context.filename);
    if (locate(path) === undefined && !path.startsWith("packages/client/")) return {};

    return visitSources(({ specifier, node }) => {
      const target = liminalPackage(specifier);
      if (target === undefined || nonPluginPackages.has(target.name)) return;
      if (target.subpath === "/contract") return;
      context.report({ node, messageId: "banned", data: { name: target.name } });
    });
  },
});

/** Entries that load in different processes, so none of them imports another. */
const isolatedEntries = new Set<PluginEntry>(["plugin", "tui", "web"]);

/** The plugin, tui and web entries never import each other; the plugin entry loads UI lazily. */
export const entryIsolation = defineRule({
  meta: {
    type: "problem",
    messages: { crossing: "The {{from}} entry cannot import the {{to}} entry." },
  },
  create(context) {
    const path = repoPath(context.cwd, context.filename);
    const from = locate(path);
    if (from === undefined || !isolatedEntries.has(from.entry)) return {};

    return visitSources(({ specifier, node, dynamic }) => {
      const target = resolveRelative(path, specifier);
      const to = target === undefined ? undefined : locate(target);
      if (to === undefined || !isolatedEntries.has(to.entry) || to.entry === from.entry) return;
      if (dynamic && from.entry === "plugin") return;
      context.report({ node, messageId: "crossing", data: { from: from.entry, to: to.entry } });
    });
  },
});
