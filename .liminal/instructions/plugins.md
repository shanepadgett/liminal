---
read-when: Building or changing a plugin
---

# Plugins

## Before you start

1. Read the plugin's section in its `docs/plugins/` work file.
2. Name the mechanism for each thing the plugin does: Add, Wrap, Attach or Replace (`docs/extension-basics.md`).
3. If no mechanism fits without editing a base plugin, stop: the base plugin is missing an extension point (`.liminal/instructions/core.md`).
4. Split by feature. Anything a user might want to drop, swap or do differently is its own plugin, meeting the others through Add, Wrap, Attach or Replace. Before adding a feature to an existing plugin, say why no one would ever want it without that plugin.

## Build it

1. Create `packages/plugins/<name>/` with the anatomy in `docs/architecture.md#plugin-anatomy`. Omit entries the plugin does not need.
2. Write `src/contract.ts` with only what other plugins use: service tags, event kinds, attribute keys, schemas, slot handles. A plugin nobody extends has no contract.
3. Write `src/index.ts`: `definePlugin` with `provides`, `requires` and the layer. Put its helpers anywhere else in `src/`.
4. In the layer, register through the contracts you require: `Registry`, `Pipeline`, `defineEvent`, `Attribute`. Every registration is tied to the plugin's scope.
5. Add `src/tui.tsx` or `src/web.tsx` only when the plugin has UI, registering into slots.
6. Write `README.md`: what the plugin provides and requires, and what to know to use or replace it. Not how it is built.
7. Add the plugin to the host compositions that ship it.

## Rules

- Configuration comes only from `Settings`: make the plugin's key with `Setting.make` and add it to `DeclaredSettings`. Plugins take no options of their own.
- State that must survive a restart lives in the session log as events.
- Everything the model sees is logged.
- Build only what the plugin's work file lists.

## When it is done

1. Tick it in `docs/status.md`.
2. Fix `docs/architecture.md` where the built design differs.
3. Update `docs/guides/` for what a plugin author can now use, and `docs/usage/` for what a user can now do.
4. Delete the plugin's section from its work file; delete the file once it is empty.

## Checked

- Another plugin is imported through its `/contract` export. View code may also import its `/view`, tui code its `/view` and `/tui`, web code its `/view` and `/web`. `packages/client` and `packages/tui` import only `/contract`. (`liminal/plugin-imports`)
- A contract imports only `effect`, `@shanepadgett/liminal-core` and other contracts, and runs no statements. (`liminal/contract-imports`, `liminal/contract-no-side-effects`)
- The plugin, view, tui and web entries never import each other, except that tui and web import view, and the plugin entry loads tui and web with `import()`. (`liminal/entry-isolation`)
- View code imports no UI framework: not `solid-js`, `@opentui/*` or `@shanepadgett/liminal-tui`. (`liminal/view-imports`)
- Package name, exports, `liminal.plugins` and peer dependencies. (`mise run check:anatomy`)
