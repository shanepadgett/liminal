# Plugin model

What a plugin is, where plugins load from, and how the host wires them together.

## Plugins

- A plugin is one package with parts: manifest, contract, server, tui, desktop
- Contract holds Effect Schemas for RPC, events, and session entries
- UI parts talk to their server part only through the contract
- A plugin is enabled or disabled as a whole across all parts
- Plugins publish their own extension points as typed services with registries
- SDK extension primitives: `Registry` (ordered collection), a keyed registry (newest addition under a name wins) and `Pipeline` (ordered middleware with `next()`)
- A step reads a registry once when it starts and keeps that list
- Observe-only events go through the kernel event bus, exposed to plugins through the SDK
- Every registration is tied to the plugin's `Scope`; closing it on disable, replace, or reload removes them
- Adding to another plugin's registry requires that plugin in `requires`
- Core domains use the same extension mechanism as any plugin
- A behavior the agent can work without is its own plugin
- Tool plumbing is one plugin, `tools`: the registry, the call pipeline and the guidance section
- `read` is its own plugin package, `tools-read`
- Tools that change files share one plugin package, `tools-edit`
- Every other tool is its own plugin package, named `tools-<tool>`
- File tools read and write through the `files` plugin
- All plugins share one shape, one host, and one replacement mechanism
- Plugins that others build on hold only the minimum mechanism
- A replacement must provide the same service contract, or its dependents are replaced with it
- Everything shipped is enabled by default
- Optional and experimental plugins ship disabled but available; the manifest sets the default
- Plugins load from three places: built-in, user global, project
- User global directory is `~/.liminal/`; project directory is `.liminal/`; data directory is `~/.liminal/data/`
- Each holds `plugins/`, `plugins.json` and `settings.json`
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
- A plugin that fails to import or build is inactive with a reason; its dependents are inactive; boot continues
- Each plugin is built in its own scope
- The host finds plugins by scanning folders for `package.json` `liminal` keys; the app supplies the built-in folder, `~/.liminal/plugins/` and `<project>/.liminal/plugins/`, in that order
- Of two packages with one name, the one in the earlier folder loads; the other is inactive with a reason
- The host supplies base services to every plugin without manifest entries: file system, paths, child processes, `Directories` and `ProjectTrust`
- Dependency cycles are errors
- Boot order comes from the dependency graph; independent plugins activate concurrently
- Order within a registry is an explicit `order` on each registration
- `plugins.json` holds the composition: a `plugins` map of plugin name to on or off, and `trustedFolders`
- The project `plugins.json` overrides the global one key by key; a missing key keeps the manifest default
- `trustedFolders` is read only from the global `plugins.json`
- An untrusted project's `plugins/` and `plugins.json` are ignored
- An untrusted workspace's `.liminal/instructions/` files are ignored; `AGENTS.md` files load either way
- A trusted folder trusts its subfolders
- Every untrusted workspace, with or without `.liminal/`, opens with a trust prompt in place of the composer
- Denying trust keeps the run untrusted and brings the composer back; nothing is saved, so the next launch asks again
- A provider set `true` replaces the others; with no choice, the earliest folder's provider stays active; two set `true` are both inactive
- Each inactive provider shows why: replaced, competing or duplicate
- A `plugins.json` change is a graph change applied once no turn runs
- Server is ready when required plugins are active; slow plugins activate in the background
- Code edits, toggles, and replacements are all graph changes applied in process
- A graph change builds the changed plugins and their dependents aside, then swaps; failure keeps the old graph
- A graph change rebuilds the changed plugins and every dependent; services are never proxied or swapped in place
- Only the kernel holds the current graph; each command and each step reads it
- In-flight work finishes its current step on the old graph; the turn continues on the new graph from the session log
- An old graph closes when its last step finishes
- Turns resume from the session log through one path, used by graph changes and process restarts
- A rebuilt plugin starts with fresh live resources; state that must survive a rebuild lives in the session log
- A plugin with no provider for a required service waits and reactivates when one appears
- Enabling a plugin that competes for a provided tag is presented as a replacement and applied in one change
