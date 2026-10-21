# Plugin SOP

How to build a plugin in Liminal under the intended design. The settled version of each step moves into `guides/` once it is built.

## Before you start

1. Read [architecture.md](architecture.md) and the plugin's section in its `plugins/` work file.
2. Name the mechanism for each thing the plugin does: Add, Wrap, Attach or Replace ([extension-basics.md](extension-basics.md)).
3. If no mechanism fits without editing a base plugin, stop. The base plugin is missing an extension point; agree on it first and record it in `architecture.md`.

## Build it

1. Create `packages/plugins/<name>/` with the anatomy in [architecture.md](architecture.md#plugin-anatomy). Omit parts the plugin does not need.
2. Write `src/contract.ts` with only what other plugins use: service tags, event kinds, attribute keys, schemas, slot handles. A plugin nobody extends may have no contract.
3. Write `src/plugin.ts`: `definePlugin` with `provides`, `requires` and the layer.
4. In the layer, register through the contracts you require: `Registry.add`, `Pipeline.wrap`, `defineEvent`, `Attribute.define`. Every registration is tied to the plugin's scope.
5. Add frontend parts only when the plugin has UI: `src/tui.tsx`, `src/web.tsx`, registering into slots.
6. Add the plugin to the host compositions that ship it.

## Rules

- Import other plugins only through their `./contract` export.
- State that must survive a restart or reload lives in the session log as events.
- Everything the model sees is logged.
- Keep the plugin to what its work file lists.
- No tests until the test milestone.

## When it is done

1. Tick it in [status.md](status.md).
2. Fix `architecture.md` where the built design differs from the intended one.
3. Move anything a plugin author needs into `guides/`: a new extension point, a reusable pattern. Not every plugin gets a guide.
4. Delete the plugin's section from its `plugins/` work file; delete the file once it is empty.
