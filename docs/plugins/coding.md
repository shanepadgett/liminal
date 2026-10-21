# Milestone 3: coding agent

Work for [status.md](../status.md) milestone 3.

## `tools-files`

- Adds `read`, `edit`, `write`; `@` file tags expand into file parts.
- `edit` events render as diffs through `EventRenderer` with OpenTUI's `Diff`; patches come from `diff`.
- Shows an edit while its arguments stream, with `partial-json` only if Effect AI gives no partial tool arguments.
- Previous code: `files`, `tools-read`, `tools-edit`.

## `tools-shell`

- Adds `shell`; command runner on `effect/process`, shell safety rules on `unbash`, background processes.
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
- Previous code: `system-prompt`, `agents-files`, `instruction-files`.

```ts
Sections.add({ name: "agents-files", order: 20, render: () => readAgentsFiles(cwd) })
```

## `environment`

- Adds a `Section` with workspace facts: cwd, platform, date, git state.
- Previous code: `environment`.

## `approvals`

- Wraps `ToolCall`: a policy, then the small model's verdict, then the user.
- Asking the user is a `question` event; the answer is an input.
- `tui` part renders the question as a card through `EventRenderer`.
- Previous code: `approval`.

```ts
ToolCall.wrap((req, next) =>
  policy(req) === "allow" ? next(req)
  : Models.generate({ model: "small", history: req.session, prompt: review(req), schema: Verdict })
      .pipe(Effect.flatMap(v => v.safe ? next(req) : Questions.ask(req.session, approvalQuestion(req))
      .pipe(Effect.flatMap(a => a.approved ? next(req) : Effect.succeed(denied(a)))))))
```

## `questions`

- Adds the `ask_question` tool and `/qna` command; `Questions.ask` for other plugins.
- Questions are events; answers are inputs.
- Previous code: `questions`.
