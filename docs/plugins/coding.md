# Milestone 3: coding agent

Work for [status.md](../status.md) milestone 3.

## `tools-read`, `tools-edit`, `tools-write`

- One plugin per tool, so one can be swapped, such as an OpenAI patch tool for `edit` and `write`. `tools-files` holds `read` today and splits into these before `edit` and `write` are built.
- `edit` events render as diffs through `chat`'s `ItemRenderer` with OpenTUI's `Diff`; patches come from `diff`.
- Shows an edit while its arguments stream, with `partial-json` only if Effect AI gives no partial tool arguments.
- `edit` diffs need display data beside what the model sees, such as Pi's `details`.
- Previous code: `files`, `tools-edit`.

## `tools-shell`

`shell` is built. What is left comes with approvals:

- Shell safety rules on `unbash` give `shell`'s `access`.
- `tools-shell` joins the CLI composition.
- Previous code: `shell-safety`.

## `tools-processes`

- Adds `process_start`, `process_output`, `process_input`, `process_stop` for commands that keep going, on a pseudo-terminal the agent can type into. Processes stop when Liminal exits.
- Previous code: `processes`.

## `tools-web`

- Adds `websearch`, `webfetch`.
- Previous code: `tools-web`.

## `approvals`

- Wraps `ToolCall`. `Tool` gains an optional `access` function that says what a call touches: `read` or `write` with paths, or `run`; a tool without one counts as `run`. `read` and `write` calls are only checked against the allowed folders; `run` calls go to a classifier, then a small reviewer model with read-only tools, then the user. The full shape is in [plans/coding.md](../plans/coding.md) Step 5.
- Asking the user is a kind made with `questions`' `defineQuestion`, drawn by a view added to its `AskViews`; the answer is an input.
- `tui` entry shows the question in the composer's place until the user answers: the tool and the reviewer's plain-words summary, effects and risk, then Approve and Reject; Reject opens a note for telling the model why. The call's input stays in its transcript row. Nothing stays in the transcript once answered.
- Print mode's `--approve` lets questions and approvals pass; without it they are denied.
- Tool calls in one reply run at the same time, so `ToolCall` wraps run at the same time too. Their asks show one at a time, oldest first, as every ask does.
- Previous code: `approval`.

```ts
ToolCall.wrap((req, next) => {
  const access = accessOf(req)                 // tool.access?.(params) ?? { kind: "run" }
  if (access.kind !== "run") return allowed(access.paths) ? next(req) : outside(req)
  return classify(req).pipe(                   // Models.classify, 3 s limit
    orReview(req),                             // Models.generateObject with tools: session_search, read
    orAsk(req),                                // approval.ask: approve, or reject with a note
    Effect.flatMap(v => v.approved ? next(req) : Effect.succeed(denied(v))))
})
```
