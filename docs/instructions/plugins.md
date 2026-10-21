# Plugins

## Before you start

1. Read the plugin's section in its `docs/plugins/` work file.
2. Name the mechanism for each thing the plugin does: Add, Wrap, Attach or Replace (`docs/extension-basics.md`).
3. If no mechanism fits without editing a base plugin, stop: the base plugin is missing an extension point (`docs/instructions/core.md`).

## Build it

1. Create `packages/plugins/<name>/` with the anatomy in `docs/architecture.md#plugin-anatomy`. Omit entries the plugin does not need.
2. Write `src/contract.ts` with only what other plugins use: service tags, event kinds, attribute keys, schemas, slot handles. A plugin nobody extends has no contract.
3. Write `src/plugin.ts`: `definePlugin` with `provides`, `requires` and the layer.
4. In the layer, register through the contracts you require: `Registry`, `Pipeline`, `defineEvent`, `Attribute`. Every registration is tied to the plugin's scope.
5. Add `src/tui.tsx` or `src/web.tsx` only when the plugin has UI, registering into slots.
6. Add the plugin to the host compositions that ship it.

## Rules

- Configuration comes only from `Settings`: register a settings section in `SettingsSections`. Plugins take no options of their own.
- State that must survive a restart lives in the session log as events.
- Everything the model sees is logged.
- Build only what the plugin's work file lists.

## When it is done

1. Tick it in `docs/status.md`.
2. Fix `docs/architecture.md` where the built design differs.
3. Move anything a plugin author needs into `docs/guides/`: a new extension point or a reusable pattern.
4. Delete the plugin's section from its work file; delete the file once it is empty.

## Checked

- Another plugin is imported only through its `/contract` export. (`liminal/plugin-imports`)
- A contract imports only `effect`, `@liminal/core` and other contracts, and runs no statements. (`liminal/contract-imports`, `liminal/contract-no-side-effects`)
- The plugin, tui and web entries never import each other; the plugin entry loads UI entries with `import()`. (`liminal/entry-isolation`)
- Package name, exports, `liminal.plugins`, `src/` layout and peer dependencies. (`mise run check:anatomy`)
