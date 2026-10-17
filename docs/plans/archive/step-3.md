# Step 3: SDK `Pipeline`, `tool-pipeline`, `agent-loop`

Builds step 3 of [milestones.md](../milestones.md) behind Rounds 5 and 6 of [core-contracts.md](../core-contracts.md). Proves: multi-step turns with tool calls run end to end on the scripted provider, with steering, follow-ups, retry, cancel and resume of unanswered tool calls.

## Decision

A turn is a loop of `step`s; each step is one model call and the tool calls it asked for, and returns whether the turn goes on. `run` loops `step` on one graph; step 6's kernel driver loops `step` on the current graph. Plugins join at three checkpoints, each a `Registry` of hooks with a fixed rule. Tool calls go through `ToolPipeline`: checks (allow, deny, ask) then an SDK `Pipeline` of wrappers around the tool's `run`.

## Packages

```text
packages/sdk/src/core/pipeline.ts    Pipeline: a Registry of middleware and run(list, input, last)
packages/plugins/
  session-log/       contract.ts  + entry kinds user, text, reasoning, tool-call, tool-result
  tool-pipeline/     contract.ts  ToolCall, ToolDecision, ToolChecks, ToolWrappers, Approvals, ToolPipeline
  agent-loop/        contract.ts  TurnSettings, checkpoint hooks and registries, AgentLoop; server/*
```

## Types at the boundaries

```ts
// SDK core pipeline.ts
Middleware<In, Out, E>  (input: In, next: Effect<Out, E>) => Effect<Out, E>   // next takes no input: no rewrites
Pipeline.run(list, input, last: (input) => Effect<Out, E>)   // list: a Registry<Middleware>, sorted by order

// SDK core plugin.ts
Plugin.server's layer needs Services<Requires> | BaseServices   // uses are read with serviceOption only

// session-log contract: the core entry kinds, one entry per part
UserEntry        session-log/user        { text }                         user: shown, model: user text
TextEntry        session-log/text        { text; interrupted; finish? }   assistant text part
ReasoningEntry   session-log/reasoning   { text; interrupted; finish? }   assistant reasoning part
ToolCallEntry    session-log/tool-call   { id; name; params; finish? }    assistant tool-call part
ToolResultEntry  session-log/tool-result { callId; name; status; result; details? }  role tool
  status         "done" | "failed" | "denied" | "cancelled" | "interrupted"
  finish         { reason: FinishReason; usage: Usage }   // on the last part of a reply
userMessage(text) -> EntryDraft

// tool-pipeline contract
ToolCall       { sessionId; callId; name; params: Json }
ToolDecision   Allow | Deny{reason} | Ask{reason}
ToolCheck      (call, tool) => Effect<ToolDecision>          ToolChecks: Registry<ToolCheck>
ToolWrappers   Registry<Middleware<{call, tool}, ToolOutcome, never>>
Approvals      { ask(call, reason) => Effect<Allow | Deny> }   // provided by the approval plugin
ToolOutcome    { status: done, output: ToolOutput } | { status: failed | denied, message, details? }
ToolPipeline   { run(call, tool: Option<Tool>) => Effect<ToolOutcome> }

// agent-loop contract
TurnSettings   { model: ModelRef; thinking: ThinkingLevel; maxOutputTokens? }
BeforeCall     (turn) => Effect<Proceed{input: EntryDraft[]} | EndTurn{reason}>      BeforeCallHooks
AfterFailure   (turn, error, attempt) => Effect<Retry{after: Duration} | GiveUp>    AfterFailureHooks
TurnEnding     (turn) => Effect<EntryDraft[]>                                       TurnEndingHooks
StepOutcome    Continue | Ended{reason: "final-answer" | "ended-by-plugin"}
TurnFailed     { error: ModelError | ProviderNotFound | store errors }  // nothing about it is saved
AgentLoop      { step(sessionId, settings): Effect<StepOutcome, TurnFailed>; run(sessionId, settings): Effect<Ended, TurnFailed> }
```

## Checkpoint rules

| Checkpoint | Hooks run | Rule |
| --- | --- | --- |
| Before each model call | in order | the first `EndTurn` ends the turn and saves nothing; otherwise every `Proceed` input is saved in one batch before `Context.build` |
| After a failed attempt | in order | the first `Retry` wins: the partial is dropped, live state shows the retry, the attempt reruns after `after`; none: `TurnFailed` |
| When the turn would end | in order | all drafts saved in one batch; any draft continues the turn, none ends it |

## Call path

```mermaid
sequenceDiagram
  participant D as run (or kernel driver)
  participant L as step
  participant S as session-log
  participant C as context
  participant M as models
  participant P as tool-pipeline
  D->>L: step(session, settings)
  L->>S: read; unanswered tool calls -> rerun if safe, else interrupted
  L->>L: BeforeCall hooks
  L->>C: build(session, model)
  L->>M: stream; live state every 100 ms; AfterFailure on error
  L->>S: append the reply's parts in one batch
  L->>P: run each call (alongside only when every tool allows)
  L->>S: append each result as it finishes
  L->>L: no calls: TurnEnding hooks
  L-->>D: Continue | Ended
```

Cancel interrupts the step's fiber: the partial reply is saved marked interrupted, complete tool calls are saved, and every call without a result gets a `cancelled` result.

## Injection

| Service | Production | Tests |
| --- | --- | --- |
| `ModelProviders` entry | provider plugins (step 4) | `model-scripted` |
| `Tools` entries | tool plugins (step 4) | test tools from `defineTool` |
| `Approvals` | approval plugin | a test service answering from a `Ref` |
| Clock | live | `TestClock` |

## Deletes

- `Services<Uses>` from what a plugin server's layer may need: a used service is read with `Effect.serviceOption`, so the layer builds without it

## Open

- A turn's caller saves the user's message (`userMessage`) and then calls `run`, so a new turn and a resumed one take the same path; one running turn per session is held by the caller (step 5)
- Cancel is interrupting the turn's fiber; the cancel plugin and its command come with step 5
- An interrupted reasoning part is saved for the user with no model content, since providers reject reasoning without its signature; a tool call whose params never finished is dropped
- A reply's finish reason and usage are saved on its last part entry
- `ask` with no `Approvals` service is a deny with the reason that no approval plugin is on
- A crashing tool (a defect) becomes a `failed` result with the defect's message
- Live state while streaming: kind `agent-loop/reply`, the partial parts; during a retry wait: kind `agent-loop/retry`
