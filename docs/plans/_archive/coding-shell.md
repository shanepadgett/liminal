# Plan: milestone 3 step 4, shell and processes

Part of milestone 3, overview in [coding.md](../coding.md). Work list: [plugins/coding.md](../../plugins/coding.md).

`tools-shell` adds `shell`, so approvals is shaped around a real command tool. It joins the CLI composition together with approvals, since nothing runs commands before the user can approve them.

## Prior art

| | Tool | Runs with | Output | Timeout | Background |
| --- | --- | --- | --- | --- | --- |
| DeepSeek | `bash`: `command`, `timeout`, `run_in_background` | A fresh `bash -c`, no rc files; an executor service (`dsh-bash-local`, `dsh-bash-sandbox`) the tool talks to | stdout, stderr, exit marker; spill file on overflow | A foreground command past its timeout keeps running as a job and returns its id | Every command is a job when a job registry is composed; `job_output`, `job_kill` |
| OpenCode | `shell`: `command`, `workdir`, `timeout`, `background` | The user's shell | Merged, truncated, full output saved to a file | Default 2 minutes, `0` for none | `background` returns at once and notifies on exit |
| Pi | `bash`: `command`, `timeout` | `bash` | Merged, the tail kept | None by default | None |
| Claude Code | `Bash`: `command`, `timeout`, `description` (5 to 10 words), `run_in_background` | `bash` | Merged | Default 2 minutes | `run_in_background` |
| archive | `shell`: `command`, `timeout` required; `process_start`, `process_wait`, `process_read`, `process_write`, `process_stop`, `process_list` in `processes` | `/bin/sh` through a `command-runner` service | stdout, then stderr, then the exit line | Stopped at the timeout | A holder program kept processes alive across restarts, with a terminal for REPLs; about 1,750 lines |

Sources: DeepSeek `packages/shell/{shell,bash-local,tool-bash}/README.md`; OpenCode `packages/core/src/tool/plugin/shell.ts`; Pi `packages/coding-agent/src/core/tools/bash.ts`; Claude Code tool prompt (community extraction) and permissions docs; `archive/packages/plugins/{tools-shell,command-runner,shell-safety,processes}`.

## Settled

- `shell` runs `bash -c <command>` in the workspace with `ChildProcess` from `effect/process`: a fresh non-login shell with no rc files, so nothing carries over between calls, as DeepSeek and Pi do. The runner is a module inside `tools-shell`, not its own plugin; a sandbox would replace it later, and that is the time to pull it out.
- stdin is closed, and `PAGER=cat`, `GIT_PAGER=cat` and `GIT_TERMINAL_PROMPT=0` are set, so a command that would wait for input or a pager fails or finishes instead of hanging.
- The model reads stdout and stderr merged in the order they came, as a terminal shows them, then one line for how it ended: `[exit code 1]` or `[stopped after 120 seconds]`. A nonzero exit is a result for the model to read, not a failed call. Long output is cut by `tool-output`, which already wraps every call.
- Interrupting the call, such as Esc ending the turn, stops the command and everything it started: it runs in its own process group, which gets `SIGTERM`, then `SIGKILL` after a few seconds.
- While it runs, the command's output reaches the transcript row: `ToolContext` gains `progress`, which publishes a delta through the session log, as reply text streams today. Deltas are not saved; the finished result is. `tools-shell`'s `tui` entry adds a row to chat's `ToolRows` that shows the last lines while it runs.
- The read-only command check on `unbash` and `shell`'s `access` are built with approvals, in the same change that adds `access` to `Tool`. `unbash` 6.0.1 is already pinned in `tools/planned` and listed in `docs/reference/sources.json`.

## Agreed

- `shell` runs foreground commands only. Commands that keep going, such as dev servers, long builds and REPLs, belong to a separate `tools-processes` plugin built right after `shell`: `process_start`, `process_output`, `process_input`, `process_stop`. `shell` does not depend on it. Its processes run on a real pseudo-terminal the agent can type into, and stop when Liminal exits; keeping them alive across restarts, as the archive's holder program did, is left out.
- The pseudo-terminal is Bun's own (`Bun.spawn`'s `terminal` option, `Bun.Terminal`; openpty on macOS and Linux, ConPTY on Windows). Its output runs through `@xterm/headless` 6.0.0, a terminal emulator in plain JavaScript, so `process_output` returns the screen as a person would see it and the lines that scrolled past; menus redrawn in place, as `npm create vite` draws them, read correctly instead of as repeats. DeepSeek's `terminal-bash` strips escape codes instead and leaves full-screen programs out. `@xterm/headless` is pinned in `tools/planned` until `tools-processes` is built.
- `shell`'s `timeout` is optional: 120 seconds when left out, 3,600 at most. A command past it is stopped, and the result tells the model to use `process_start` for a command that keeps going.
- `shell` takes a required `description` of 5 to 10 words, which the transcript row shows as its label; opening the row shows the full command. It is only a label: approvals uses the reviewer's words.
- `shell`'s own description lists the command-line tools found on `PATH` at start from a fixed list (`rg`, `fd`, `jq`, `git`, `gh`, `bun`, `node`, `python3`), so they show only when `shell` is composed, in place of the work file's line in `environment`.

## Code plan

Mechanisms: `tools-shell` **Adds** `shell` to `Tools` and a row to chat's `ToolRows`. The one contract change is in the base `tools` plugin: `ToolContext` gains `progress`. `docs/architecture.md` line 209 changes in the same change.

Contract change in `packages/plugins/tools/src/contract.ts`:

```ts
export interface ToolContext {
  readonly session: SessionId;
  readonly callId: string;
  readonly attributes: Attributes;
  /** Shows the call's progress live; not saved, and only the latest one counts. */
  readonly progress: (data: Schema.Json) => Effect.Effect<void>;
}

/** A running call's latest progress, published as a delta. Each tool reads its own `data`. */
export const ToolProgress = defineEvent(
  "tools/progress",
  Schema.Struct({ callId: Schema.String, data: Schema.Json }),
);
```

`tools`' `runTool` builds `progress` as `(data) => ToolProgress.make({ callId, data }).pipe(Effect.flatMap((delta) => log.publish(session, delta)))`, so `tools` requires `SessionLog`. Each delta carries the whole current state, not an increment: the session view drops deltas whenever an event is saved, and the latest delta alone must be enough to draw.

`tools-shell`:

```ts
// src/contract.ts — what the tool takes and what its row reads
export const ShellParams = Schema.Struct({
  command: Schema.String,
  description: Schema.String,   // 5 to 10 words; the row's label
  timeout: Schema.optional(Schema.Int.check(between(1, 3600))),
});
export const ShellProgress = Schema.Struct({ tail: Schema.Array(Schema.String) }); // last 5 lines

// src/run.ts — the runner module
type Ending = { kind: "exited"; code: number } | { kind: "stopped"; seconds: number };
interface Ran { readonly output: string; readonly ending: Ending }
const run: (command: string, options: RunOptions) => Effect<Ran, PlatformError>
// RunOptions = { cwd, timeout: Duration, onTail: (lines) => Effect<void> }
```

Call path:

```
loop ─► ToolCall pipeline ─► tools.runTool (builds context with progress)
  ─► shell.run(params, context)                         src/index.ts, defineTool
       ─► run(command, { cwd: workspace, timeout, onTail: (tail) => context.progress({ tail }) })
            ChildProcess.make("bash", ["-c", command], {
              cwd, stdin: "ignore", extendEnv: true,
              env: { PAGER: "cat", GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0" },
              killSignal: "SIGTERM", forceKillAfter: "3 seconds" })
            handle.all ─► decode text ─► keep head and tail, 10 MB at most
                       ─► onTail at most every 200 ms
            race handle.exitCode with the timeout; the scope's end kills the process group
       ◄─ text: output, then "[exit code N]" or "[stopped after N seconds]"
  ◄─ tool-output's wrap cuts long text and saves the whole to a file
```

Esc interrupts the call's fiber; the spawn's scope closes and Effect's spawner kills the group (`detached` is on by default outside Windows, so the command leads its own group). A spawn failure, such as `bash` missing, is a `ToolFailed`.

The tools list: once, when the plugin starts, `bash -c 'command -v rg fd jq git gh bun node python3'` gives the ones on `PATH`, and the description ends with `Installed: rg, git, …`. None found leaves the line out.

The row, `src/tui/ShellRow.tsx`, registered in `ToolRows` for `shell`:

- The label is the description. It reuses `AskRow`'s way: it passes `WorkRow` the item with `params: { description }`, so chat does not change.
- While the call runs, the last lines of the newest `ToolProgress` delta for its call sit under the row, dimmed. A memo keeps the last tail it saw, so the lines stay while another event's save clears the deltas.
- Opening the done row shows the command, then the last 10 lines of the result.

Files: `packages/plugins/tools-shell/{package.json, README.md}`, `src/{index.ts, contract.ts, run.ts, installed.ts}`, `src/tui/{index.tsx, ShellRow.tsx}`. `tools` changes in `src/contract.ts` and `src/index.ts`; `docs/architecture.md` gets the new `ToolContext`.

Settled while planning:

- The timeout ending stays plain, `[stopped after 120 seconds]`. `shell` cannot know `tools-processes` is composed, so `process_start`'s description tells the model to use it for commands that keep going.
- `shell` joins the CLI composition with approvals. Until then a scratch composition runs it, and the row is checked by composing it into a scratch TUI run.

Settled while building:

- A command killed by a signal has no exit code, so it ends with `[ended by a signal]`.
- After the command exits, output may keep coming for 1 second, such as from a child it left in the background; then the process group is stopped.
- `tool-output` cuts for the model; `shell` itself keeps at most the first and last 5 MB, so a command that writes without end cannot fill memory.
- The row's tail shows what a terminal would show of a line with carriage returns: the part after the last one.

## Processes code plan

Mechanisms: `tools-processes` **Adds** four tools to `Tools` and a row for `process_start` to chat's `ToolRows`. No contract changes. `@xterm/headless` moves from `tools/planned` into its `dependencies`; it is not host-supplied.

Prior art for the shape: the archive's `processes` (start waits briefly and returns the output so far; reads return what is new since the last read; ids such as `p1`) and DeepSeek's `terminal-bash` (a send returns once the terminal goes quiet, bounded by a timeout).

The tools:

```ts
process_start({ command, description, wait? })   // starts it; returns its id, then output as below
process_output({ id, wait? })                     // what is new since the last read
process_input({ id, text?, keys? })               // types text, then keys; returns what is new
process_stop({ id })                              // stops it and everything it started; returns the last output

keys: Array<"enter" | "tab" | "escape" | "backspace" | "up" | "down" | "left" | "right"
             | "ctrl+c" | "ctrl+d">            // a "\n" in text is also Enter
wait: seconds, 1 to 600                           // default 5 for start and input, 0 for output
```

Every result is the new output, then one line for where the process stands: `[p1 running]` or `[p1 exited with code N]`.

- **When a call returns.** At once when the process has exited. Otherwise once new output has come and then 1 second passes with none, or `wait` seconds pass. A dev server that prints its address and waits returns in about a second; a long build returns at `wait` with what it printed so far.
- **What is new.** The terminal remembers the screen it last returned and a marker at its top line. A read compares the lines from the marker on with that screen and returns from the first line that differs to the end. Output added below returns only the new lines; a menu redrawn in place returns from the first changed line. A program that switched between the normal and the full screen buffer returns its whole screen. When the marker's line has scrolled out of the 5,000 lines kept, the read returns all kept lines after `[earlier output dropped]`.
- **Sessions.** Each session has its own processes, numbered `p1`, `p2`, …; another session's ids are unknown to it. Processes keep running between turns and stop when Liminal exits. A call naming an unknown id fails with `No process p3 in this session. Processes stop when Liminal exits.`
- **Terminal.** 120 columns by 40 rows, `TERM=xterm-256color`, started with `bash -c` in the workspace like `shell`, with `PAGER=cat` and `GIT_PAGER=cat`.
- **Stopping.** `SIGTERM` to the process group, `SIGKILL` after 3 seconds, as `shell` does. The PTY makes the child lead its own process group, so its pid names the group: checked by hand on Bun 1.4.3, where `process.kill(-pid)` stopped `bash` and two background `sleep`s it started, and `exited` gave 143 for `SIGTERM`.

Modules:

```ts
// src/pty.ts: the one place that calls Bun
interface Pty {
  readonly write: (data: string) => void;
  readonly exited: Effect<number>;               // exit code; a signal gives 128 + n
  readonly stop: Effect<void>;                   // SIGTERM, then SIGKILL after 3 s
}
const openPty: (command, { cwd, onData }) => Effect<Pty, PtyFailed, Scope>   // closing the scope stops it

// src/screen.ts: @xterm/headless behind a small interface
interface Screen {
  readonly write: (data: Uint8Array) => Effect<void>;  // resolves once parsed
  readonly readNew: Effect<ReadonlyArray<string>>;      // what is new, and moves the mark
}

// src/processes.ts: the session's processes
interface Running { id; command; pty: Pty; screen: Screen; lastOutput: Ref<number>; exit: Ref<Option<number>> }
class Processes  // module-level service inside the plugin, not in a contract
  start(session, command): Effect<Running>
  find(session, id): Effect<Running, ToolFailed>
  settle(running, wait): Effect<string>          // waits as above, then readNew plus the state line
  stop(running): Effect<string>
```

Call path: `process_start` → `Processes.start` opens a PTY in a scope forked from the plugin's scope, so Liminal's exit closes them all. The PTY's data goes to `screen.write` and stamps `lastOutput`. `settle` then waits, and the tool returns its text. `process_stop` closes that process's scope and returns the final read.

The row: `process_start`'s row shows its description, as `shell`'s does, through a `tui` entry. The other three use chat's plain row, which shows their params, such as `p1 ctrl+c`.

Files: `packages/plugins/tools-processes/{package.json, README.md}`, `src/{index.ts, contract.ts, tools.ts, processes.ts, pty.ts, screen.ts}`, `src/tui/index.tsx`. `contract.ts` holds the tool names and `process_start`'s params for the row.

Under Later in `docs/status.md`: telling the model when a process exits on its own, without a read; a cap on how many processes run at once.

Settled while building:

- `wait` runs from 0 to 600, so `process_output`'s default of 0 can also be written. `process_input` takes `wait` too.
- "New output" means output not yet read, so what a process prints between starting and the call's wait counts.
- `Screen.write` takes Bun's output as it comes, without an effect; a read first waits for the terminal to parse everything written before it.
- The mark sits at the top of the screen after each read: lines above it have scrolled away and cannot change.
- Leaving the full-screen buffer returns the normal screen, not everything since the old mark.
- After the command exits, output may keep coming until the PTY closes, for 1 second at most.
- `process_stop` signals the process group even when the command has exited, so children it left behind stop too, and removes the id. A process that exits on its own keeps its id until stopped, so its last output can still be read.
- `tools-processes` runs commands as `shell` does, so it joins the CLI composition with approvals.
