# Approvals

Tool calls run without asking unless they change state outside what the user asked for. Grounded in Tau main (`~/dev/open-source/tau-agent/packages/agent/extensions/tool-approval/`, `extensions/decisions/`), pi-ai classifier APIs (`node_modules/@earendil-works/pi-ai/dist/api/{openai-decisions,typesafe-system-one,classifier-shared}.js`), original Tau structured output (`references/tau-agent/src/ai/internal/protocols/structured-output.ts`), Codex `codex-rs/core/src/guardian/`.

## Round 1: architecture

```text
agent-loop ─▶ tools: ToolPipeline.run(call)
               ├─ ToolChecks (registered by approval)
               │    ├─ shell: askCommands → Ask; ShellSafety.isSafe(command, safeCommands) → Allow, else Ask
               │    └─ files: write/edit outside the workspace → Ask
               └─ Ask ─▶ Approvers (approval plugin)
                         1. decisions: Jev (OpenRouter) → Luna Decisions → skip
                            approves or hands off (unsure, user should decide, runs unseen code)
                         2. reviewer: session provider's cheap model, one-off call
                            tools: read (files), shell (safe list only), submit_review
                            approves, or writes a plain-language summary and reason
                         3. user: approval dialog (approve / reject, optional note)
```

| Plugin | Status | Role |
| --- | --- | --- |
| `models` | changed | `ModelProvider.cheapModel`, `Models.cheap(provider)`; `toolChoice` on `ModelRequest` (`auto`, `required`, one tool); one-off call service in `models`: model, prompt, tools, result schema, bounded exchange ending in a submit tool, one retry with the decode failure |
| provider plugins | changed | Cheap model: Anthropic `claude-haiku-5-5`; OpenAI providers Luna 6; OpenCode Go and OpenRouter DeepSeek 4.1 Flash latest; map `toolChoice` |
| `decisions` | new | `Decisions.classify(questions, state)`; Jev via OpenRouter (`~typesafe/jev-latest`, System One at `/systemone`) first, else Luna Decisions (`POST /v1/decisions`, OpenAI API key only, or OpenRouter `openai/gpt-6-luna-decisions`); protocols in `@liminal/sdk/ai` |
| `shell-safety` | new | Own plugin; `unbash` 6.0.0 parse and the safe list; `ShellSafety.isSafe(command, extra)` and `matchesAny(command, prefixes)`; reads no settings and registers no check |
| `approval` | new | Provides `Approval`; registers an `Approvers` entry and every `ToolChecks` entry and reads the `approval` settings; the three-step chain; context is the last two user prompts and final assistant messages; private record entry; TUI dialog; per-session mode |
| `inbox` | changed | Composer shows the session's approval mode next to the model |
| `tools` | changed | `Approvers` registry: the newest registration answers asks; with none, an ask is denied |
| `files` | unchanged | reviewer `read` uses `WorkspaceFiles` |

Facts from Tau main to carry:

- Safe list: about 60 always-safe commands; argument rules for `git` (read verbs only), `find` (no `-exec`, `-delete`), `rg`, `fd`, `sed`, `yq` (no output or in-place flags); any write redirect or unresolved part fails
- Classifier questions: `hidden` (runs unseen code), `impact` (none, workspace, user_home, system, remote, exposure), `intent` (on task); approve when hidden ≤ 0.5, none + workspace ≥ 0.8, and none ≥ 0.8 or intent ≥ 0.5; 3 s timeout; failure hands off
- Reviewer schema: decision, summary (everyday language, ≤ 600), reason (≤ 300); prompt rules in `tool-approval/index.ts` `REVIEW_SYSTEM_PROMPT`
- Siblings in one assistant message reviewed together, 3 at a time
- An approval is void if a file the reviewer read changes before the run

## Settings

Section `approval` in `settings.json`:

| Key | Values | Default | Effect |
| --- | --- | --- | --- |
| `mode` | `auto`, `ask`, `full` | `auto` | `auto`: the chain above. `ask`: safe list still runs; every other reviewed call goes to the user, with the reviewer's summary. `full`: no checks, no reviews |
| `decisionModel` | `auto`, `jev`, `luna`, `off` | `auto` | Which decision model step 1 uses; `off` skips it |
| `safeCommands` | command prefixes | `[]` | Added to the safe list, such as `["tree", "bat"]` |
| `askCommands` | command prefixes | `[]` | Always go to the user, even in `auto` |

- `mode: full` and `safeCommands` from project settings apply only in a trusted project

## Session mode

- `/approvals` opens a dialog with `auto`, `ask` and `full`; the choice applies to the current session only; settings are not written
- `shift+tab` cycles the session mode: `auto`, `ask`, `full`
- The composer shows the session's approval mode next to the model

## Steps

| Step | Work | Status |
| --- | --- | --- |
| 1 | `models`: cheap model per provider, `toolChoice`, `ModelTask` | built |
| 2 | `decisions` | built |
| 3 | `models`: one-off calls and structured output for any model | built |
| 4 | `shell-safety` | built |
| 5 | `approval`: chain, dialog, session mode, composer label | built |

## Step 2: decision models

Lets any plugin ask a decision model (Jev, Luna Decisions) multiple-choice, score and yes/no questions about a JSON state, with probabilities. Provider plugins register the decision models their login serves, the way they register chat models in `ModelProviders`; `decisions` picks one. Grounded in Tau `extensions/decisions/classifier.ts` and pi-ai `dist/api/{openai-decisions,system-one-shared,typesafe-system-one,classifier-shared}.js`.

```text
packages/sdk/src/core/decision.ts        Question, Answer schemas (root export)
packages/sdk/src/ai/decisions.ts          systemOne and openAiDecisions wire clients
packages/sdk/test/decisions.test.ts       both wires over a fake HttpClient
packages/plugins/decisions/               new plugin: DecisionModels registry, Decisions service
  plugin.ts, package.json
  src/contract.ts                          DecisionModel, DecisionModels, Decisions, Decided
  src/server.ts                            pick, timeout, size cap, answer checks
  test/decisions.test.ts                   order, preference, timeout, bad answers
packages/plugins/model-openrouter/        registers Jev and Luna Decisions (uses DecisionModels)
packages/plugins/model-openai/            registers Luna Decisions on the API key (uses DecisionModels)
docs/plugins/decisions.md                 requirements
```

```ts
// sdk core/decision.ts
Question = Choice { instructions; criteria: Record<string, string> }    // value → meaning
         | Score  { instructions; criteria: ReadonlyArray<string> }      // level labels
         | Bool   { instructions; criteria: { true: string; false: string } }
Answer   = Choice { choice; probabilities: Record<string, number>; confidence }
         | Score  { score; confidence }
         | Bool   { probability }
DecisionFailed: Schema.TaggedError { message }

// sdk ai/decisions.ts: one POST each, bearer key, no retries
systemOne(http, { url, key: Effect<Redacted, ModelError>, model }) => (state, questions) => Effect<Record<string, Answer>, DecisionFailed>
openAiDecisions(http, { url, key, model }) => same

// decisions contract
type DecisionFamily = "jev" | "luna"
interface DecisionModel {
  readonly id: string;              // "openrouter/jev"
  readonly family: DecisionFamily;
  readonly available: Effect<boolean>;          // has a usable key
  readonly classify: (state: Record<string, Schema.Json>, questions: Record<string, Question>)
    => Effect<Record<string, Answer>, DecisionFailed>;
}
class DecisionModels extends KeyedRegistry.Service<DecisionModels, DecisionModel>()(...)
type Decided = Answered { model; answers } | Skipped { reason: "unavailable" | "timeout" | "error"; message }
class Decisions extends Context.Service<Decisions, {
  readonly classify: (state, questions, prefer: "auto" | DecisionFamily) => Effect<Decided>;
}>()(...)
```

| Registered by | Id | Family | Wire | Model |
| --- | --- | --- | --- | --- |
| `model-openrouter` | `openrouter/jev` | jev | System One, `https://openrouter.ai/api/v1/systemone` | `~typesafe/jev-latest` |
| `model-openai` | `openai/luna` | luna | Decisions, `https://api.openai.com/v1/decisions` | `gpt-6-luna` |
| `model-openrouter` | `openrouter/luna` | luna | Decisions, `https://openrouter.ai/api/v1/decisions` | `openai/gpt-6-luna-decisions` |

```text
Decisions.classify(state, questions, prefer)
  input = JSON of state and questions; over 48,000 bytes → Skipped(unavailable)
  candidates = registered models, jev before luna, by id within a family
               prefer jev or luna keeps that family only
  model = first candidate whose `available` is true; none → Skipped(unavailable)
  answers = model.classify(state, questions) within 3 s
    timeout → Skipped(timeout); DecisionFailed → Skipped(error)
  every question needs a valid answer of its type:
    probabilities and confidence in 0..1; a choice among the criteria; choice probabilities sum to 1 ± 0.02
    else Skipped(error)
  Answered(model.id, answers)
```

- Wire mapping: System One sends `bool` as `noul` and reads `noul` back; Decisions sends `bool` as `predicate` with the true and false meanings appended to the instructions, `choice` criteria as `choices`, `score` criteria as `levels`, and the state as JSON text; a `refusal` answer is `DecisionFailed`
- Provider plugins add `DecisionModels` to `uses` and register only when it is present
- The `approval` setting `decisionModel` maps to `prefer`; `off` skips the call
- Tests: the SDK wires over `packages/sdk/src/testing/http.ts`; `decisions` over fake registered models with `TestClock` for the timeout
- Guide: `docs/guides/providers.md` adds registering a decision model

## Step 5: approval

The `approval` plugin answers every call a check marks Ask, and owns the checks. Decision model, then reviewer, then user; each answer is saved as a hidden entry.

```text
packages/plugins/approval/
  plugin.ts               provides Approval; requires ToolChecks, Approvers, ShellSafety, Settings, SessionLog, EntryKinds,
                          Models, ModelTask, WorkspaceFiles, CommandRunner; uses Decisions; rpcs ApprovalRpcs
  src/contract.ts         ApprovalMode auto|ask|full; ApprovalSettings; ApprovalEntry (model: false, user: hidden);
                          Pending { id, sessionId, callId, tool, params, reason, summary? };
                          ApprovalRpcs: approval/pending(session) stream, approval/answer { id, approve, note },
                          approval/mode(session) stream, approval/set-mode { session, mode }
  src/server.ts           layer: check registered in ToolChecks, approver in Approvers, Approval, rpcs
  src/server/checks.ts    shell: full → Allow; askCommands → Ask; isSafe(command, safeCommands) → Allow; else Ask
                          write, edit: path outside the workspace → Ask (full → Allow)
  src/server/chain.ts     ask(call, reason): askCommands or mode ask → reviewer summary, then user;
                          auto → decisions (unless off) → reviewer → user
  src/server/classify.ts  hidden, impact, intent questions; approve when hidden ≤ 0.5, none + workspace ≥ 0.8,
                          and none ≥ 0.8 or intent ≥ 0.5
  src/server/review.ts    ModelTask on Models.cheap(session provider); tools read and shell (safe list only);
                          submit_review { decision approved|ask, summary ≤ 600, reason ≤ 300 }
  src/server/pending.ts   SubscriptionRef of pending asks; a Deferred per ask; removed when the turn is interrupted
  src/server/modes.ts     session modes in memory, over the settings mode
  src/tui.tsx             dialog for the session's oldest pending ask; /approvals; shift+tab; composer label
chat contract             ChatSlots.composerLine: items next to the composer's model line
inbox Composer            draws ChatSlots.composerLine
gallery                   Composer mode label; approval dialog states
```

- Context for the decision model and reviewer: the session's last two user prompts and last two assistant texts
- The reviewer runs on the session's provider only; a failed review goes to the user without a summary
- `full` and project `safeCommands` apply only in a trusted project; the settings server loads project settings only when trusted

## Step 4: shell-safety

A pure service: parse with `unbash`, walk every simple command, apply the safe list. The checks live in `approval`, because a check that returns Ask denies every unsafe shell call while no `Approvals` service exists (`packages/plugins/tools/src/server/pipeline.ts`).

```text
packages/plugins/shell-safety/
  plugin.ts                  provides ShellSafety; requires nothing
  src/contract.ts            ShellSafety { isSafe(command, extra): boolean; matchesAny(command, prefixes): boolean }
  src/server.ts              parse → walk → every command allowed, and not cd with git
  src/server/walk.ts         Found { commands, safe }; unbash forEachChild over every node, marks unsafe shapes
  src/server/rules.ts        always-safe set; argument checks per command
  src/server/git.ts          read verbs; branch and tag listing; remote show and get-url
  src/server/flags.ts        short clusters, long options, positionals
```

- Unsafe shapes: parse errors, shebang, background jobs, assignments before a command, write redirects other than to `/dev/null`, `>&` and `<&` other than to `0`, `1`, `2`, `-`, process substitution, arithmetic, function and coproc definitions, `select`, arithmetic `for`
- Command substitutions and heredoc bodies are walked; their commands must pass too
- A command name must be a known word; commands with argument checks need every argument known, unquoted globs counting as unknown
- `extra` and `prefixes` match word by word from the command name; blank prefixes are ignored
- `matchesAny` sees commands inside unsafe shapes, so `askCommands` still match in a background job

## Step 3: one-off calls for any model

`ModelTask` already runs on any model and thinking value; only the type name says "cheap". Every provider streams through `replyOf`, which calls `effect/ai` `LanguageModel.streamText`; `streamText` always sends a text response format. Native structured output exists in `effect/ai` only through `generateObject`, which does not stream and sends no tools (`node_modules/effect/src/ai/LanguageModel.ts`). Tau's native path is the same `generateObject` and also refuses tools (`src/ai/internal/protocols/structured-output.ts`).

```text
packages/sdk/src/core/model.ts             CheapModel → ModelPick { model: ModelRef, thinking: ThinkingValue }
packages/plugins/models/src/contract.ts    Models.cheap returns ModelPick; TaskRequest.model: ModelPick
packages/plugins/models/src/server/task.ts type rename only
docs/plugins/models.md, docs/guides/providers.md   ModelTask takes any model; Models.cheap is a lookup
```

- Structured output is the forced submit tool for every model, as `ModelTask` does now: one retry with the decode reason, the last step forces the submit tool
- No catalog flag and no `generateObject` path

## Step 1: cheap models and model tasks

Lets any plugin ask a provider's cheap model for one typed answer, with tools it chooses. All real providers stream through `replyOf` (`packages/sdk/src/ai/reply.ts`), and every `@effect/ai-*` language model maps `LanguageModel.streamText`'s `toolChoice`, so tool choice is one SDK change.

```text
packages/sdk/src/core/model.ts          ModelRequest.toolChoice; CheapModel
packages/sdk/src/core/tool.ts           export jsonSchemaOf
packages/sdk/src/ai/reply.ts            passes toolChoice to streamText
packages/plugins/models/src/contract.ts ModelProvider.cheap; Models.cheap; ModelTask, TaskFailed
packages/plugins/models/src/server.ts   Models.cheap; ModelTask layer
packages/plugins/models/src/server/task.ts   the task loop
packages/plugins/models/test/task.test.ts    loop over a fake provider
packages/plugins/model-*/src/...        each provider names its cheap model
```

```ts
// sdk core/model.ts
export const ToolChoice = Schema.Union([
  Schema.Literals(["auto", "required"]),
  Schema.Struct({ tool: Schema.String }),
]);
ModelRequest.toolChoice: Schema.optionalKey(ToolChoice) // missing is auto
export const CheapModel = Schema.Struct({ model: ModelRef, thinking: ThinkingValue });

// models contract
interface ModelProvider { ...; readonly cheap: { readonly id: string; readonly thinking: ThinkingValue } }
Models.cheap: (provider: string) => Effect<CheapModel, ProviderNotFound>

class TaskFailed extends Schema.TaggedError<...>()("TaskFailed", { message: Schema.String }) {}

interface TaskRequest<S extends Schema.Top> {
  readonly model: CheapModel;
  readonly sessionId: SessionId;        // passed to tool runs
  readonly system: string;
  readonly prompt: ReadonlyArray<ModelContent>;
  readonly tools: ReadonlyArray<Tool>;  // sdk Tool, run as-is
  readonly submit: { readonly name: string; readonly description: string; readonly schema: S };
  readonly maxSteps: number;
}

class ModelTask extends Context.Service<ModelTask, {
  readonly run: <S>(request: TaskRequest<S>) =>
    Effect<S["Type"], TaskFailed | ModelError | ProviderNotFound>;
}>()("liminal/models/ModelTask") {}
```

| Provider | Cheap model | Thinking |
| --- | --- | --- |
| `anthropic` (both) | `claude-haiku-5-5` | Off |
| `openai`, `chatgpt`, `codex` | `gpt-6-luna` | Off |
| `openrouter` | `~deepseek/deepseek-flash-latest` | Off |
| `opencode-go` | `deepseek-v4.1-flash` | Off |
| `scripted` | `scripted` | Off |

```text
ModelTask.run(request)
  messages = [system(request.system), ...request.prompt]
  retried = false
  for step in 1..maxSteps
    choice = last step or retried ? { tool: submit.name } : "required"
    parts = finished parts of Models.stream({ model, thinking, messages, tools + submit, toolChoice: choice })
    calls = tool-call parts; none → TaskFailed
    messages += assistant(parts)
    submitted = calls named submit.name
    if submitted
      decode its params with submit.schema
      ok → return value
      failed and retried → TaskFailed(decode message)
      failed → retried = true; messages += failure result with the decode message; next step
    each other call → tool.run(params, { sessionId, callId }); unknown name or ToolFailed → failure result
    messages += results
  TaskFailed("no answer in maxSteps steps")
```

- `ModelTask` is provided by the `models` layer from `Models`; tests use a fake provider in `ModelProviders` that answers each request from a queue and records it
- Replaces nothing; `docs/plugins/models.md` gains the cheap model, tool choice and `ModelTask`
- Guide: `docs/guides/providers.md` adds the cheap model to what a provider names
