# processes

Commands the agent starts and leaves running across turns and restarts.

Status: built

## Provides

- Tools: start a command, wait on it, read its output, type into it, stop it, list them
- A Processes section in the sidebar
- A notice entry when a command exits

## Requirements

- Separate from the shell tool that runs a command and returns
- Stopping a command stops everything it started
- Commands run on Bun's built-in PTY when they need a terminal
- A small separate program holds running commands; the server reconnects to it after a restart
- A resumed turn tells the agent which of its commands are still running

## References

- Tau `src/proc/`
- OpenCode `persistent-pty`
