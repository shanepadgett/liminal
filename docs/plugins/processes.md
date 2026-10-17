# processes

Commands the agent starts and leaves running across turns and restarts.

Status: planned

## Provides

- Tools: start a command, wait on it, read its output, type into it, stop it

## Requirements

- Separate from the shell tool that runs a command and returns
- Stopping a command stops everything it started
- Commands run on Bun's built-in PTY when they need a terminal
- A small separate program holds running commands; the server reconnects to it after a restart
- A resumed turn tells the agent which of its commands are still running

## Open

- The holder program's protocol and lifetime

## References

- Tau `src/proc/`
- OpenCode `persistent-pty`
