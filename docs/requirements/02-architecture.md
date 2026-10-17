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
- The protocol is Effect RPC; each plugin contract declares an `RpcGroup` and the kernel serves the groups of the current graph
- The in-memory transport is the socket protocol over an in-memory socket pair, so every message is serialized
- Session content reaches clients only from saved state: session log entries and the live slot
- The kernel event bus carries only non-session events that are safe to lose; a client that misses one re-reads state
- The kernel holds each client's session subscriptions and resumes them from the last delivered `Seq` after a graph change or reconnect
- During a graph change the kernel follows a session through both the old and new builds until the old graph closes, delivering each `Seq` once
- Approvals and questions are session entries; the client answers with a command
- Server-to-client requests outside a session get their own path when the first one appears
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
