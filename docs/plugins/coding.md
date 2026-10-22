# Milestone 3: coding agent

Work for [status.md](../status.md) milestone 3.

## `tools-files`

- Adds `read`, `edit`, `write`; `@` file tags expand into file parts.
- `edit` events render as diffs through `EventRenderer` with OpenTUI's `Diff`; patches come from `diff`.
- Shows an edit while its arguments stream, with `partial-json` only if Effect AI gives no partial tool arguments.
- `read` returns images, so a tool result holds text and image parts, not only JSON. This changes `ToolResult` in the `model` contract and `ToolOutput` in `tools`.
- `edit` diffs need display data beside what the model sees, such as Pi's `details`.
- Previous code: `files`, `tools-read`, `tools-edit`.

## `tools-shell`

- Adds `shell`; command runner on `effect/process`, shell safety rules on `unbash`, background processes.
- Streams output while the command runs: `ToolContext` gains `progress`, as Pi's `onUpdate` and OpenCode's `ctx.progress`.
- Previous code: `tools-shell`, `command-runner`, `shell-safety`, `processes`.

## `tools-web`

- Adds `websearch`, `webfetch`.
- Previous code: `tools-web`.

## `tool-output`

- Wraps `ToolCall`: truncates large results and saves the full output to a file the model can read.
- Previous code: `tool-output`.

```ts
ToolCall.wrap((req, next) => next(req).pipe(Effect.map(limitOutput)))
```

## `instructions`

- Adds `Sections`: base prompt, `AGENTS.md` files, `.liminal/instructions/`.
- The base prompt is the `<execution>` part of `archive/packages/plugins/system-prompt/src/server/base.ts`; `persona` already has `<communication>` and `<discussion>`.
- Previous code: `system-prompt`, `agents-files`, `instruction-files`.

```ts
Sections.add({ name: "agents-files", text: readAgentsFiles(cwd) }, { order: 20 })
```

## `environment`

- Adds a `Section` with workspace facts: cwd, platform, date, git state.
- Previous code: `environment`.

## `approvals`

- Wraps `ToolCall`: a policy, then the small model's verdict, then the user.
- The policy reads tool hints, such as read-only and destructive, added to `Tool` here, as MCP's annotations.
- Asking the user is a `question` event; the answer is an input.
- `tui` entry renders the question as a card through `EventRenderer`.
- Print mode's `--approve` lets questions and approvals pass; without it they are denied.
- Previous code: `approval`.

```ts
ToolCall.wrap((req, next) =>
  policy(req) === "allow" ? next(req)
  : Turns.request(req.session).pipe(Effect.flatMap(prefix =>
      Models.generateObject({ model: "small", prefix, prompt: review(req), schema: Verdict })))
      .pipe(Effect.flatMap(v => v.safe ? next(req) : Questions.ask(req.session, approvalQuestion(req))
      .pipe(Effect.flatMap(a => a.approved ? next(req) : Effect.succeed(denied(a)))))))
```

## `questions`

- Adds the `ask_question` tool and `/qna` command; `Questions.ask` for other plugins.
- Questions are events; answers are inputs.
- Previous code: `questions`.
