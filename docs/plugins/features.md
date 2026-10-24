# Milestone 5: long sessions and project features

Work for [status.md](../status.md) milestone 5.

## Commands

- Slash commands that run only while no turn runs: prompt commands such as `/qna` start a turn, action commands such as `/commit` do one-off work and start none. Tried during a turn, they show a warning notification and do nothing. There is no `/compact`: `memory`'s checkpoints keep sessions inside the window.
- UI commands such as `/connect` stay keymap commands and run at once, during a turn too.
- The TUI's `/` menu and palette list them beside the keymap's commands.
- Plan: [commit.md](../plans/_archive/commit.md).

## `memory`

- Keeps long sessions inside the context window: memories, checkpoints and nudges as events.
- The provider's small model writes memories of the history beside the session and compacts older memories into one.
- The model calls `checkpoint` with a continuation note and the files it needs; hidden nudges ask for it at 150K and 200K tokens, and other tool calls are denied from 250K.
- Wraps `History` to project from the latest checkpoint; wraps `ToolCall` for the denial; `BeforeCall` hooks measure the context and checkpoint on their own when the cache expired or the model changed.
- A call that overflows the window checkpoints without a note and retries the step once, through `loop`'s `CallFailed` hook.
- A checkpoint can rename the session when the work has moved away from its name, by appending a new `session/name` event.
- Each memory has a line of a few words in the model's voice, which the transcript shows where the memory was written. The transcript shows no entry ranges or token counts.
- Plan: [memory.md](../plans/memory.md). Previous code: `memory`.

```ts
History.wrap((events, next) => afterCheckpoint(events, next))
ToolCall.wrap((call, next) => full(call.session) && call.name !== "checkpoint" ? denied(call) : next(call))
CallFailed.add((turn, error) => isContextOverflow(error) ? checkpoint(turn, "overflow").pipe(Effect.as(true)) : Effect.succeed(false))
```

## `skills`, `references`, `vocabulary`

- Each adds a `Section` and the commands or tools it needs: skill folders, reference repositories, project terms.
- Skill frontmatter parses with `Bun.YAML`.
- Previous code: same names.

## `checks`

- Runs the project's configured checks: a `TurnEnd` hook after edits, plus a `checks` tool.
- Failures go back to the model as an input.
- Previous code: `checks`.

## `commit`

- Adds `/commit`: groups changed files with `Models.generateObject`, then commits each group, then offers to push.
- Previous code: `commit`.

```ts
registerCommands([{ name: "commit.run", slash: { name: "commit" },
  blocked: turnBlocked(chat, "commit"), run: (text) => start(session, text) }])
```

## `tools-search`

- Defers rarely used tools: wraps the tool list sent to the model and adds a search tool that loads them.
- Sends deferred tools, which `tool-definitions` leaves out in milestone 1.
- Previous code: `tools-search`.

## `tools-execute`

- Code mode: adds a tool that runs a script able to call other tools through `ToolCall.run`, so every wrapper applies.
- Runs scripts with `@opencode/codemode`.
- Scripts get typed values back: `Tool` gains an optional output schema, as OpenCode's `output` and Pi's `outputSchema`.
- Previous code: `tools-execute`.

## `attention`

- Sounds or notifications when a turn ends or a question waits; `tui` entry only.
- OpenTUI's `Audio` and `triggerNotification`; no other dependency.
- Previous code: `attention`.
