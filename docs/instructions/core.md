# Core and base contracts

- Core stays agent-free: no sessions, messages, models, transports or loaders. It must still compose a program that is not an agent.
- A new extension point in core or a base plugin contract needs the user's agreement first. Record it in `docs/architecture.md` in the same change.
- A feature that can only be built by editing a base plugin shows a missing extension point. Stop and agree on the extension point.
- Change a contract only together with every plugin that uses it.
- Base plugins may also use plain JavaScript libraries that call no runtime APIs, such as `jsonc-parser`.

## Checked

- Core, base plugins and `client` use only `effect` and standard JavaScript: no Bun, Node, OpenTUI, Solid or driver imports, no `Bun`, `process`, `window` or `document`. (`no-restricted-imports`, `no-restricted-globals`)
- Each layer imports only the layers below it; `client` imports packages with `import type` only. (fallow boundaries)
