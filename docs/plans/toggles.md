# Plugin toggles

Lets the user turn any plugin on or off and replace a built-in with another plugin, in `~/.liminal/settings.json` or `<project>/.liminal/settings.json`, applied as a graph change without a restart. Lets the project folder's plugins load only once the user trusts the folder.

## Today

| Piece | Where | What it does |
| --- | --- | --- |
| `enabledByDefault` | `packages/sdk/src/core/plugin.ts` | The only on/off switch; `resolve` marks `false` as `Disabled` |
| `resolve` | `packages/kernel/src/host/resolve.ts` | Two enabled providers of one service: both `DuplicateProvider`, both off |
| `pluginFolders` | `apps/cli/src/boot.ts` | Loads `<project>/.liminal/plugins/` with no trust check |
| `settings` plugin | `packages/plugins/settings/` | Reads layered `settings.json`; keeps `trustedFolders` in its own section; `trustProject` has no UI |
| reload machine | `packages/kernel/src/reload/` | `classify` turns changed files into `Plugins` or `Restart`; settings files are not watched |

Gap: project plugins load without trust, against `docs/plugins/settings.md`. This plan closes it.

## Round 1: architecture

### 1. The host reads plugin choices, not the `settings` plugin

```mermaid
flowchart LR
  files["settings.json<br/>global, project"] --> choices["app: readChoices"]
  choices --> kernel["kernel: resolve(manifests, choices)"]
  kernel --> graph["plugin graph"]
  graph --> settings["settings plugin<br/>other sections, writes"]
  settings -- "write plugins.x" --> files
```

The kernel needs the choices before any plugin is built, and `settings` is itself a plugin that could be off or replaced. `BootOptions` gains `choices: Effect<PluginChoices>`; the app reads it from the files; tests pass a fixed value. `settings` still writes the `plugins` section, so a later `/plugins` dialog writes through `Settings.write`.

- The JSONC helpers in `packages/plugins/settings/src/server/files.ts` (`parseSettings`, `merge`) move to `@liminal/sdk` so the app and `settings` share them; `jsonc-parser` moves to the SDK's dependencies.
- Alternative: boot `settings` first in a phase of its own. It would make `settings` a plugin that cannot be turned off or replaced, a special case under the plugin name.

### 2. Shape: one `plugins` section, name to on/off

```jsonc
{ "plugins": { "tools-shell": false, "acme-shell": true } }
```

Keyed by manifest `name`. The project file overrides the global file key by key, as every section merges today. A missing key keeps the manifest's `enabledByDefault`.

- Alternative: a `providers` map from service key to plugin name. It names service keys users never see and cannot turn off a plugin that provides nothing.

### 3. Competing providers: a choice beats a default; no choice keeps the earlier folder

| Providers of one service | Result |
| --- | --- |
| One set `true` in settings, others on by default | The one set `true` is active; the others are inactive, `Replaced { by }` |
| None chosen | The one from the earliest folder is active; the others are inactive, `Competing { service, active }` |
| Two set `true` | Both inactive, `DuplicateProvider`, as today |

Replacing a built-in is one line: `"acme-shell": true`. Installing a competing plugin never takes down the working one. Each inactive plugin shows why, so nothing changes silently.

- Alternative: keep today's rule, both off until the user chooses. Installing a shell plugin would leave the agent with no shell until the settings are edited.

### 4. Trust gates the project's plugins and choices

- Trusted folders live in a host-read `trustedFolders` list in `~/.liminal/settings.json`, moved out of the `settings` plugin's own section; the plugin's `projectTrusted` and `trustProject` read and write that list.
- An untrusted project: `<project>/.liminal/plugins/` is not loaded and the project `plugins` section is ignored.
- Asking the user to trust a folder is a later TUI step; until then the user adds the folder to the list by hand.

### 5. A settings change is a graph change

The app also watches both `settings.json` files. `classify` gains a `Choices` change: the kernel reads `choices` again and resolves the loaded manifests again, with no package reloaded; the swap waits for the `TurnGate` like any other graph change. Trusting a folder starts loading its plugins the same way.

## Deletes or replaces

- `InactiveReason.Disabled` covers off by default and off in settings; its text names which.
- `DuplicateProvider` applies only to two explicit choices.
- `settings` plugin: `OwnSection.trustedFolders` and the JSONC helpers move out.
- `pluginFolders` takes the trust decision.

## Open

- A `/plugins` dialog to list, toggle and replace plugins: after this plan, designed in the gallery first.
- A trust prompt for a new project folder.
