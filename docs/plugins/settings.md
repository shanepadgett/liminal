# settings

Layered settings store: reads `settings.json` layers and gives each plugin its own section.

Status: planned

## Requirements

### Sections

- Each plugin owns one section under its own name and decodes it with its own Schema
- A section that fails to decode fails only its plugin

### Layers

- Layers merge objects key by key; a higher layer's list replaces the lower one
- Project plugins and project settings load only after the user trusts the folder once

### Changes

- App-written changes edit the same file in place and keep comments (`jsonc-parser`)
- Turning a plugin on or off, or replacing it, is a graph change
- Other values are read on each use; changing them rebuilds nothing

### Credentials

- Settings name credentials and never hold secrets

## References

- Pi `coding-agent/docs/settings.md`, `security.md`
- OpenCode `core/src/config.ts`, `config/plugin/*`
- Codex `config/src/config_layer_source.rs`
- Crush `internal/config/load.go`
- DeepSeek `docs/subsystems/settings.md`
- Tau `src/host/Settings.ts`
