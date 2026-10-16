# Decisions

## Goals

- TUI is the first frontend
- Desktop and web frontends come later
- Web runs server-side only; consumers provide their own UI
- Multi-user server mode comes later

## Kernel

- Everything is Effect-based
- Everything outside the kernel is a plugin, including built-ins
- Any plugin service can be replaced
- Effect Layers are the plugin system; no Cordis, no custom DI
- Kernel contains only: plugin host, event bus, protocol server, supervisor

## Plugins

- A plugin is one package with parts: manifest, contract, server, tui, desktop
- Contract holds Effect Schemas for RPC, events, and session entries
- UI parts talk to their server part only through the contract
- A plugin is enabled or disabled as a whole across all parts
- Plugins publish their own extension points as typed services with registries
- Core domains use the same extension mechanism as any plugin
- A behavior the agent can work without is its own plugin
- All plugins share one shape, one host, and one replacement mechanism
- Plugins that others build on hold only the minimum mechanism
- A replacement must provide the same service contract, or its dependents are replaced with it
- Everything shipped is enabled by default
- Optional and experimental plugins ship disabled but available; the manifest sets the default
- Plugins load from three places: built-in, user global, project
- User global directory is `~/.liminal/`; project directory is `.liminal/`
- Each holds `plugins/` and `settings.json`
- An annex is the distribution unit: an npm, git, or local package containing one or more plugins
- An annex's `package.json` `liminal` key lists paths to its plugin manifests
- A plugin manifest is a typed `plugin.ts` at the package root using `definePlugin`
- Manifests import real service tags from contracts; no string service keys
- `definePlugin` type-checks that the server Layer provides and requires exactly what the manifest declares
- Manifests import only contracts; parts load lazily so the host resolves the graph before loading plugin code
- Plugin anatomy: `package.json`, `plugin.ts`, `src/contract.ts`, `src/server.ts`, `src/tui.tsx`, `test/`
- Unused parts are omitted; a part that grows becomes a folder with an `index` entry
- Each built-in plugin is an annex containing one plugin

## Orchestration

- Manifest declares `provides`, `requires`, and optional `uses` as imported service tags
- A service contract is an Effect service tag with its interface and schemas
- Each service tag has exactly one active provider
- Competing providers are chosen by user config, never silently
- A plugin missing a required service is inactive with a reason
- Dependency cycles are errors
- Boot order comes from the dependency graph; independent plugins activate concurrently
- Order within a registry is an explicit `order` on each registration
- Config layers: built-in defaults, user global, project; each can enable, disable, replace, or configure
- Server is ready when required plugins are active; slow plugins activate in the background
- Code edits, toggles, and replacements are all graph changes applied in process
- A graph change builds the changed plugins and their dependents aside, then swaps; failure keeps the old graph
- In-flight turns finish on the old graph
- A plugin with no provider for a required service waits and reactivates when one appears
- Enabling a plugin that competes for a provided tag is presented as a replacement and applied in one change

## Repository

- Bun workspaces
- Latest Bun, Effect, and OpenTUI
- Every plugin is its own workspace package
- Plugin packages export only their contract to other plugins
- Top-level areas: `apps/`, `kernel/`, `sdk/`, `plugins/`
- `apps/` is its own workspace area; the CLI lives in `apps/cli/`
- Built-in plugins use the same SDK and loader as third-party plugins
- `@liminal/sdk` is published for plugin authors
- `@liminal/sdk`, `effect`, and OpenTUI are peer dependencies supplied by the host
- Plugin contracts are published; plugins import other plugins' contracts and get the host's copy at runtime
- Built-in plugins depend only on the SDK and other plugins' contracts, never on `kernel/`
- Local plugin folders hot reload the same way built-ins do
- Every plugin follows the same anatomy

## Guardrails

- Agree on shape and coding contracts before writing code; enforce them with tooling
- Toolchain: strict `tsc` with Effect diagnostics, type-aware `oxlint` with custom rules, `oxfmt`, `fallow` dead code and duplicates, file-name check, agent-format failure reporting, one `mise run check`
- Lint rules and tools are written clean-room for Liminal; each has a test file beside it
- Lint base is the Effect `strict` preset run through `oxlint`; `tsc` language-service diagnostics stay off
- Native `oxlint` correctness, suspicious and perf categories are errors, plus selected TypeScript, unicorn and oxc rules
- Custom `liminal` rules cover type evidence, comment slop, code shape and Effect misuse
- Unused disable directives are errors; every disable needs a reason
- Unstable Effect APIs are allowed; `effecttsgo/unstable-api-usage` stays off
- `oxfmt`: width 100, `objectWrap: collapse`, operators lead wrapped lines, JSDoc formatting, imports sorted builtin, external, `@liminal/*`, relative
- `liminal/padding-lines` adds blank lines before `return` and around multi-line statements
- Version-matched dependency docs are checked in under `docs/reference/copies/`, generated by `mise run docs` from `docs/reference/sources.json`
- A check fails when a dependency or tool has no reference docs or its docs do not match its pinned version
- Plans favor reuse: investigate existing code and dependency docs before proposing new code
- Lasting plans live in `docs/plans/` and are deleted once built
- Agent instructions live in `docs/instructions/`, indexed by a "Read when" table in `AGENTS.md`
- Instructions hold only what checks cannot enforce, plus short notes on checked rules agents often break
- Style rules are agreed one at a time before they are added
- Each check runs independently, scoped to the files it covers
- `fallow` runs workspace-aware: undeclared and unused workspace dependencies, cross-package cycles
- Plugin packages export only `plugin.ts` and `./contract`
- `plugins/*` cannot import `kernel/`; `kernel/` cannot import `plugins/*`
- `contract.ts` imports only Effect and the SDK and has no side effects
- `plugin.ts` imports only contracts
- `server` and `tui` parts never import each other
- A structure check enforces plugin anatomy

## Testing

- Plugin tests use the SDK test harness, building Layers in process with real or fake dependencies
- Contracts ship conformance suites; every provider of a service must pass its suite
- End-to-end tests run over the in-memory transport with a scripted fake model provider plugin
- Kernel has its own tests

## Frontends

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

## TUI design

- Charm's design sensibility is the model; own palettes, glyphs and ornament
- Content carries no chrome; borders and boxes only for dialogs, overlays and cards
- Hierarchy comes from four text brightness levels; color only where it carries meaning
- Focus changes weight, never shape; blurred states keep their shape and drop to muted
- Status and mode use chips: solid fill, one cell of padding each side
- Liminal has its own signature ornament, used consistently in titles and headers
- The ornament is the eighth-block fade `▏▎▍▌▋▊▉█` in the palette gradient
- Ornament placement is the edge: hairlines across the width that thicken into the fade, shared by headers and dialog titles
- The gallery's Primitives group shows the shared pieces components are built from
- One component per concept; screens and samples are built only from gallery components, so a change shows everywhere it is used
- The transcript is the only conversation component; the chat screen uses it in Folded
- A small set of single-cell glyphs; no Nerd Font icons
- Emoji only for file-tag kinds: 📄 file, 📁 folder, 📚 reference, 🌄 image
- Metadata lines join parts with a faint separator; key hints are a muted key and a fainter action
- Every component renders to a given width; truncate with `…`, lower-priority parts yield first, long output collapses and expands
- Background fills only to push secondary content back
- Spacing rhythm: two-cell margin and indent, chips `(0,1)`, cards `(1,2)`
- Motion has character and stays cheap
- Working motion is the glide; no sweep
- Only one place glides while working: the header or the composer's top edge
- Toasts show in the chat column's top right, under the header; every kind times out, errors included
- Palettes define the 16 ANSI colors used for terminal output

## Protocol

- Server and frontends always talk through the protocol: commands, events, plugin RPC
- Transport is swappable: in-memory, local socket, network
- In-memory transport stays typed and uses the same envelope as remote transports
- Server can send requests to clients
- Sessions survive a client disconnect for a grace period so clients can reattach
- TUI runs the server in process by default and opens a local socket for other clients
- A second local client attaches to a running server instead of starting its own
- Desktop runs or attaches to a server and connects over a local socket or IPC
- Web deployment is a networked server with auth
- Chat thread integrations are server plugins, not protocol frontends

## Reload

- Reload is automatic in dev and production builds
- Plugins, including built-ins in dev, hot swap in process
- Kernel changes restart the process under a supervisor, resuming the session
- Changes are typechecked, loaded, and set up before applying; failures keep the old version running
- Web deployment runs a locked plugin set with no plugin loading or reload
