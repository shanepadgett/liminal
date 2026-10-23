# Milestone 3: coding agent

Work for [status.md](../status.md) milestone 3.

## `tools-files`

- `read` is built. Adds `edit`, `write`.
- `edit` events render as diffs through `chat`'s `ItemRenderer` with OpenTUI's `Diff`; patches come from `diff`.
- Shows an edit while its arguments stream, with `partial-json` only if Effect AI gives no partial tool arguments.
- `edit` diffs need display data beside what the model sees, such as Pi's `details`.
- Previous code: `files`, `tools-edit`.

## `tools-shell`

- Adds `shell`; command runner on `effect/process`, shell safety rules on `unbash`, background processes.
- Streams output while the command runs: `ToolContext` gains `progress`, as Pi's `onUpdate` and OpenCode's `ctx.progress`.
- File search runs through `shell`; there are no `grep` or `find` tools. `environment` lists the command-line tools found on the machine for the model to use, such as `rg` and `jq`, beside the shell line.
- Previous code: `tools-shell`, `command-runner`, `shell-safety`, `processes`.

## `tools-web`

- Adds `websearch`, `webfetch`.
- Previous code: `tools-web`.

## `approvals`

- Wraps `ToolCall`: a policy, then the small model's verdict, then the user.
- The policy reads tool hints, such as read-only and destructive, added to `Tool` here, as MCP's annotations.
- Asking the user is a kind made with `questions`' `defineQuestion`, drawn by a view added to its `AskViews`; the answer is an input.
- `tui` entry shows the question in the composer's place until the user answers: the tool and what the call will do in the model's words, then Approve and Reject; Reject opens a note for telling the model why. The call's input stays in its transcript row. Nothing stays in the transcript once answered.
- Print mode's `--approve` lets questions and approvals pass; without it they are denied.
- Tool calls in one reply run at the same time, so `ToolCall` wraps run at the same time too. Pi and DeepSeek run their before-call checks one at a time in the order asked; decide whether approvals asks one question at a time the same way.
- Previous code: `approval`.

```ts
ToolCall.wrap((req, next) =>
  policy(req) === "allow" ? next(req)
  : Turns.request(req.session).pipe(Effect.flatMap(prefix =>
      Models.generateObject({ model: "small", prefix, prompt: review(req), schema: Verdict })))
      .pipe(Effect.flatMap(v => v.safe ? next(req) : approval.ask({ session: req.session, callId: req.call.id }, data(req))
      .pipe(Effect.flatMap(a => a.approved ? next(req) : Effect.succeed(denied(a)))))))
```
