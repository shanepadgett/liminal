# Frontends

How frontends host plugins and how plugins extend the UI.

- Each frontend is a plugin host
- Frontends are built from plugins, including built-in UI
- UI extension is a slot tree; only `root` is built in, components declare child slots they own
- Slot cardinality: single, list, keyed, chain
- Slot scope: root or session
- The host keeps one instance of session-scoped state per session id, surviving session and tab switches
- Unmounting a slot owner removes its child slots and their contributions
- A slot is a typed handle the owning plugin exports from its contract; registrants import it
- A same-priority clash or a registration into an undeclared slot fails only the later plugin's UI part, with a typed error in its status
- When a slot owner reloads, the host re-runs the setup of every plugin whose entries its child slots dropped
- Each UI part has its own connection to the kernel and a client for the RPC groups it uses
- Tool rows carry a pure fold to a group, verb, target and detail; the transcript joins consecutive calls of one group into a row
- UI components receive typed props and hooks, never the plugin context
- A plugin's `src/tui.tsx` default-exports `defineTui({ setup })`; `setup` is an Effect given a `TuiHost` with `register`, `client` and `follow`
- TUI and desktop expose different slot sets
- Server is the source of truth for enabled plugins and their versions
- In-process frontends import UI parts directly from disk
- Attached frontends fetch UI part bundles from the server
- TUI keys go through `@opentui/keymap`: named commands, bindings that point at them
- A command is a keymap command a plugin's UI part registers; optional slash and palette details list it in the composer's slash menu and the command palette
- A command's `run` is UI code: it opens a dialog or calls its plugin's RPCs
- The gallery has its own key map
