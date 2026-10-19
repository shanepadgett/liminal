# agent-loop

Runs one turn: model calls and the tool calls they ask for, step by step, until a final answer or a question form.

Status: built

## Provides

- `AgentLoop` service

## Requires

- `SessionLog`, `EntryKinds`, `Context`, `Models`, `ToolRegistry`, `ToolPipeline`

## Requirements

- Unfinished output is saved about every 100 ms while it streams
- A running turn resumes after a restart
- Its TUI part draws the streaming reply and the retry line at the transcript's end
- Tools declare whether they are safe to rerun; an unsafe one reports as interrupted on resume
- A turn that stops on an error saves an error notice; the model never sees it; the next message continues from the log
- A running step finishes on the graph it started on; the turn continues on the new graph from the session log
- Inbox, retry, cancel and usage are separate plugins
- Its settings section holds the default `model` and `thinking` for new turns; `thinking` is one of the model's option ids
- A session's model and thinking are those of its last sent turn; a session with no turns uses the default
- Picking a model in a session applies to that session's next turn and sets the default for new sessions
- `ctrl+t` picks the next thinking option of the session's model, in the model's option order, wrapping from the last to the first; a model with fewer than two options shows a toast
- A pick not yet sent with a turn is held in memory per session until a turn uses it or the app restarts; it is not saved in the session
- A turn uses the saved thinking option when the model offers it, else the model's default, else off
- Plugins join a turn at three named checkpoints, each with a fixed rule: before each model call, after a failed attempt, when the turn would end
- Any plugin can end the turn before a model call; the loop has no built-in step limit
- A turn a plugin ended saves a warning notice with the plugin's reason
- The same call, by name and params, failing or denied 3 times in a row ends the turn
- Steering input enters at the next step boundary, sent with the tool results; queued follow-ups enter when the turn would end
- A failed attempt before a retry is discarded and saves nothing; the retry status shows only in live state
- On cancel, the output so far is saved marked interrupted and the model sees it; tool calls that never ran report as cancelled
- Tool calls in one step run one at a time unless each tool declares it can run alongside others

## Open

- The contract types

## References

- Pi `packages/durable` (`docs/spec.md`)
- Codex `app-server-protocol` v2
