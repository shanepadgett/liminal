/** Rules that keep plugin entries inside their boundaries. */
import { defineRule } from "@oxlint/plugins";

import { visitSources } from "./module-sources.ts";
import { locate, type PluginEntry, repoPath, resolveRelative } from "./plugin-entries.ts";

const isEffect = (specifier: string) => specifier === "effect" || specifier.startsWith("effect/");

const isCore = (specifier: string) => specifier === "@shanepadgett/liminal-core";

/** Liminal packages that are not plugins, so every export they declare is public. */
const nonPluginPackages = new Set(["core", "client", "tui", "model-wire"]);

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

const contractOnly = new Set(["/contract"]);

/** The exports of another plugin that each entry may import. */
const allowedSubpaths = new Map<PluginEntry, ReadonlySet<string>>([
  ["view", new Set(["/contract", "/view"])],
  ["tui", new Set(["/contract", "/view", "/tui"])],
  ["web", new Set(["/contract", "/view", "/web"])],
]);

/** Packages outside packages/plugins/ that import plugins, and only through their contracts. */
const contractOnlyPackages = ["packages/client/", "packages/tui/"];

const subpathsFor = (path: string): ReadonlySet<string> | undefined => {
  const from = locate(path);
  if (from !== undefined) return allowedSubpaths.get(from.entry) ?? contractOnly;

  return contractOnlyPackages.some((root) => path.startsWith(root)) ? contractOnly : undefined;
};

/**
 * A plugin reaches another plugin through its contract; frontend code also through its frontend
 * exports.
 */
export const pluginImports = defineRule({
  meta: {
    type: "problem",
    messages: {
      banned: "This file imports another plugin only through {{allowed}}, not '{{specifier}}'.",
    },
  },
  create(context) {
    const allowed = subpathsFor(repoPath(context.cwd, context.filename));
    if (allowed === undefined) return {};

    return visitSources(({ specifier, node }) => {
      const target = liminalPackage(specifier);
      if (target === undefined || nonPluginPackages.has(target.name)) return;
      if (allowed.has(target.subpath)) return;

      context.report({
        node,
        messageId: "banned",
        data: { specifier, allowed: [...allowed].join(", ") },
      });
    });
  },
});

/** Frameworks view code stays free of, so the tui and web entries can share it. */
const isUiFramework = (specifier: string) =>
  specifier === "solid-js"
  || specifier.startsWith("solid-js/")
  || specifier.startsWith("@opentui/")
  || specifier === "@shanepadgett/liminal-tui"
  || specifier.startsWith("@shanepadgett/liminal-tui/");

/** View code uses no UI framework. */
export const viewImports = defineRule({
  meta: {
    type: "problem",
    messages: { framework: "View code uses no UI framework; move '{{specifier}}' to a tui entry." },
  },
  create(context) {
    if (locate(repoPath(context.cwd, context.filename))?.entry !== "view") return {};

    return visitSources(({ specifier, node }) => {
      if (!isUiFramework(specifier)) return;
      context.report({ node, messageId: "framework", data: { specifier } });
    });
  },
});

/** The entries each entry may import by relative path; the plugin entry loads tui and web lazily. */
const reaches = new Map<PluginEntry, ReadonlySet<PluginEntry>>([
  ["plugin", new Set(["plugin"])],
  ["view", new Set(["view"])],
  ["tui", new Set(["tui", "view"])],
  ["web", new Set(["web", "view"])],
]);

const lazyEntries = new Set<PluginEntry>(["tui", "web"]);

/** The plugin, view, tui and web entries never import each other, except tui and web import view. */
export const entryIsolation = defineRule({
  meta: {
    type: "problem",
    messages: { crossing: "The {{from}} entry cannot import the {{to}} entry." },
  },
  create(context) {
    const path = repoPath(context.cwd, context.filename);
    const from = locate(path);
    const allowed = from === undefined ? undefined : reaches.get(from.entry);
    if (from === undefined || allowed === undefined) return {};

    return visitSources(({ specifier, node, dynamic }) => {
      const target = resolveRelative(path, specifier);
      const to = target === undefined ? undefined : locate(target);
      if (to === undefined || !reaches.has(to.entry) || allowed.has(to.entry)) return;
      if (dynamic && from.entry === "plugin" && lazyEntries.has(to.entry)) return;
      context.report({ node, messageId: "crossing", data: { from: from.entry, to: to.entry } });
    });
  },
});
