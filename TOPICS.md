# Topics

## Open

- Code conventions: port Tau's standards and custom lint rules, reviewed per rule
- Core service contracts: session-log, agent-loop, context, models, credential-store, tool-registry, tool-pipeline, settings
- Stable service handles vs rebuilding dependents on swap
- ACP adapter as a server plugin
- Collab-style session sharing through an encrypted relay
- Sessions and storage
- TUI
- Transcript: past-turn trails, timings and composer form keys; awaiting review in a live terminal; plan in `docs/plans/transcript.md`
- Gallery: its own isolated app, a minimal Storybook for the TUI; built before any TUI components or screens; every element, primitives through screens, is approved there first; houses its own components, duplication accepted; keep Tau's tier, state and width rules, redesign the shell

## Later

- Bundles: named plugin sets
- Trust boundaries: UI parts from untrusted servers, plugin permissions
