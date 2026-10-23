# @shanepadgett/liminal-loop

Runs turns: an input starts one, the model is called, the tools it asks for run, and the model is called again until it answers without tool calls.

- `Inbox.send(session, input, mode?)`: logs the input and starts a turn when the session is idle. During a turn the input waits in memory: a `steer` (the default) joins before the next model call, a `follow-up` waits until the turn would end.
- `Inbox.cancel(session)`: stops the running turn and returns the inputs that were waiting.
- `Inbox.pullBack(session)`: returns the inputs that were waiting, oldest first; the turn goes on.
- `Inbox.state(session)`: whether a turn (or a fold) runs in the session now and the inputs waiting, then each change. Only `loop` knows this; the log can show a turn open that a crash left behind.
- `Send`: the pipeline every input goes through; wrap it to attach attributes or turn inputs away.
- `Added`: the `loop/added` attribute on a user message, how many of its last parts plugins added on send, so screens show only what the user wrote. A wrap that appends parts adds its count to the one set; `addedOf(attributes)` reads it.
- `SessionModel`: the pipeline that says which model a session's next call runs, from its events. It ends at the first signed-in provider's `main` default, else fails with `ModelNotFound`; `model-choice` wraps it.
- `Turns.request(session)`: the session's next model request, read from its log.
- `Turns.fold(session)`: waits for the running turn, then logs the system prompt and tool list again.
- `BeforeCall`: hooks that run before each model call, after the system prompt and tool list sync.
- `TurnEnd`: hooks that run when the model answers without tool calls.
- `LoopRpc`: `loop/send`, `loop/cancel`, `loop/pull-back` and `loop/state` for screens.

Requires `SessionLog`, `SystemPrompt`, `ToolList`, `History`, `ModelProviders`, `ModelCall`, `Tools` and `ToolCall`.

## What it logs

| Kind | When |
| --- | --- |
| `loop/turn-start` | A turn began, just before the inputs that start it |
| `session/message` | The input, each reply, and each tool result as its own message, in the order the model asked |
| `loop/step-start` | A model call began, with the model it calls |
| `loop/step-end` | The model call ended: `finished` with the provider's reason and token usage, `failed`, `cancelled`, or `interrupted` when Liminal stopped mid-call |
| `loop/turn-end` | The turn ended: `answered`, `failed`, `cancelled`, or `interrupted` when Liminal stopped mid-turn |
| `loop/interrupted` | A reply cut short by a cancel; the model never sees it |
| `session/notice` | Why a turn failed |

The model never sees the `loop/` events.

It publishes, without logging, `loop/reply` as the reply streams and `loop/tool-done` as each tool call finishes. `loop/reply` carries text and reasoning as written, each tool call's params so far as `tool-input` (the whole params each time, parsed from the unfinished JSON), each finished tool call, and retries.

A cancelled turn logs the results of calls that finished and a cancelled result for the rest. A failed turn keeps its input in the log, so the next input continues from it.

## Add a hook

```ts
const inbox = yield* Inbox;

// Run checks; a follow-up keeps the turn going.
yield* (yield* TurnEnd).add((turn) => inbox.send(turn.session, followUp, "follow-up"));
```

A `BeforeCall` hook logs its own records, such as a note the model should read before its next call.

## Replace it

Leave out `loop` and provide `Inbox`, `Send`, `SessionModel`, `Turns`, `BeforeCall` and `TurnEnd` from your own plugin.
