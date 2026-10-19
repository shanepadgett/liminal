# Packaging

An annex is a package that holds one or more plugins and loads from a plugin folder outside Liminal's repository. Package one when your plugin lives in your own repository, your home folder, or a project.

## Lay out the annex

1. Write the plugins as in [plugins.md](plugins.md#create-a-plugin), one folder each with its own `plugin.ts`, or one `plugin.ts` for an annex of one plugin.
2. List every manifest under `liminal` in the annex's `package.json`.
3. List the host's shared packages and the plugins you import as `peerDependencies`.

```json
{
  "name": "@acme/liminal-pins",
  "type": "module",
  "exports": { ".": "./plugin.ts", "./contract": "./src/contract.ts" },
  "peerDependencies": {
    "@liminal/sdk": "0.1.0",
    "@liminal/session-log": "0.1.0",
    "effect": "4.0.5"
  },
  "liminal": ["./plugin.ts"]
}
```

Rules:

- Every plugin gets the host's copy of these packages, whatever the annex installs: `effect`, `@liminal/sdk`, `@opentui/core`, `@opentui/keymap`, `@opentui/solid` and `solid-js`.
- An import of `@liminal/<name>/contract` gets the contract from the folder the host loaded that plugin from.
- Any other dependency resolves from the annex's own `node_modules`; run `bun install` in the annex.

Example: `apps/cli/test/plugins/pins/`. The shared list is `sharedModules` in `apps/cli/src/boot.ts`.

## Install the annex

- Put the annex folder, or a symlink to it, directly inside a plugin folder:

| Folder | Loads |
| --- | --- |
| `~/.liminal/plugins/` | In every workspace |
| `<project>/.liminal/plugins/` | In that project, once the user trusts the workspace |

The host scans each folder in that order, after the built-in `packages/plugins/`, and loads every package whose `package.json` has a `liminal` key.

Rules:

- A package name already taken by an earlier folder leaves yours inactive with `PackageNameTaken`. Name the annex under your own scope, such as `@acme/liminal-pins`.
- A package named like a shared package, such as `effect`, is inactive with `SharedPackageName`.
- A plugin whose import or build fails is inactive with the reason, and so are its dependents; the rest of Liminal boots.

Example: `claimPackage` in `packages/kernel/src/host/contracts.ts`.

## Turn plugins on, off, or replace one

`~/.liminal/plugins.json` and `<project>/.liminal/plugins.json` turn plugins on or off by the manifest's `name`. The project file overrides the global one key by key; a missing key keeps the manifest's `enabledByDefault`.

```jsonc
{
  "plugins": { "tools-shell": false, "acme-shell": true },
  // global file only
  "trustedFolders": ["/Users/me/dev/project"]
}
```

Rules:

- To replace a built-in, provide the same service in `provides` and set your plugin `true`. With no choice, the earliest folder's provider stays active; two set `true` are both inactive.
- The project's `plugins.json` and `plugins/` load only when the workspace is in `trustedFolders` or inside one.

Example: `readComposition` in `apps/cli/src/composition.ts`.

## Edit the annex while Liminal runs

1. Save a file in the annex. Liminal watches every plugin folder except `node_modules`.
2. Liminal typechecks its repository, builds the plugin and its dependents aside, then swaps them in once no turn runs.

Rules:

- A failed build keeps the old code running.
- Liminal's own typecheck covers only its repository; check your annex with your own `tsc`.
- Set `"reload": { "mode": "confirmed" }` in `settings.json` to make a checked change wait for `/reload`.

Example: `reloadOptions` in `apps/cli/src/reload.ts`.

## See also

- [plugins.md](plugins.md): the plugin's server part.
- [tui.md](tui.md): the plugin's TUI part.
- [testing.md](testing.md): tests for an annex's plugins.
