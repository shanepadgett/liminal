# Architecture

The kernel, the protocol between server and frontends, and how code reloads.

## Kernel

- Everything is Effect-based
- Everything outside the kernel is a plugin, including built-ins
- Any plugin service can be replaced
- Effect Layers are the plugin system; no Cordis, no custom DI
- Kernel contains only: plugin host, event bus, protocol server, supervisor

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
