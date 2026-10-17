# Frontends

How frontends host plugins and how plugins extend the UI.

- Each frontend is a plugin host
- Frontends are built from plugins, including built-in UI
- UI extension is a slot tree; only `root` is built in, components declare child slots they own
- Slot cardinality: single, list, keyed, chain
- Slot scope: root or session
- Unmounting a slot owner removes its child slots and their contributions
- UI components receive typed props and hooks, never the plugin context
- TUI and desktop expose different slot sets
- Server is the source of truth for enabled plugins and their versions
- In-process frontends import UI parts directly from disk
- Attached frontends fetch UI part bundles from the server
- TUI keys go through `@opentui/keymap`: named commands, bindings that point at them
- The gallery has its own key map
