# Extension basics

Every harness does the same thing in a loop: **build a request → call the model → get an assistant message → run any tool calls → record the results → repeat.** The four mechanisms are the only ways a plugin can change that loop:

- **Add:** put something into a list the loop reads.
- **Wrap:** stand in the middle of one step and change what goes in or comes out.
- **Attach:** tag data onto something so later steps can read it.
- **Replace:** swap out a whole piece.

The formal contracts are in [architecture.md](architecture.md).

## Add: put something in a list

The loop reads some lists every turn: tools, prompt sections, model providers. A plugin adds an item, and the loop picks it up without knowing who added it.

```ts
// a tool
Tools.add({
  name: "get_work_order",
  input: { id: string },
  run: ({ id }) => api.workOrders.get(id),
});

// a prompt section
Sections.add(
  { render: () => "Today is " + new Date().toDateString() },
  { order: 50 },
);

// a model provider
Models.add(anthropicProvider);
```

Inside the loop:

```ts
const request = {
  system: Sections.all()
    .map((s) => s.render())
    .join("\n"),
  tools: Tools.all(),
  messages: history,
};
```

Use Add when you're contributing something new: a tool, instructions for the prompt, a model, a slash command, a renderer for an event kind.

## Wrap: stand in the middle of a step

Some steps are operations, like "call the model" or "run this tool call." A wrapper receives the input and a `next` function. It can change the input, skip `next`, change the output, or do something before or after.

```ts
ToolCall.wrap(async (call, next) => {
  // before
  if (call.name === "delete_file") {
    const ok = await ask("Allow delete " + call.input.path + "?");
    if (!ok) return { error: "User denied" }; // skip next: tool never runs
  }
  const result = await next(call); // run the tool (and any inner wrappers)
  // after
  return truncate(result, 10_000); // change the output
});
```

```ts
ModelCall.wrap(async (request, next) => {
  try {
    return await next(request);
  } catch (e) {
    if (isRateLimit(e)) {
      await sleep(2000);
      return next(request); // retry
    }
    throw e;
  }
});
```

Use Wrap when you're changing how something already happening behaves:

| Step | Wrapper |
| --- | --- |
| Model call | Retry on rate limit, add cache hints, log usage and cost, switch to a fallback model |
| Tool call | Ask for approval, block dangerous shell commands, cut long output short, time it |
| Sending an input | Stamp who sent it, reject input from users without access |

The order of wrappers matters, so each wrapper declares an `order`. Approval should run before truncation, for example.

## Attach: tag data onto things

Everything in a session is an event in the log: a user message, an assistant message, a tool call, a tool result. Attach lets a plugin put its own labeled data on a session, an input or an event without the session plugin knowing what that data means.

```ts
// a plugin defines a key once
const Actor = Attribute.make("actor", { id: string, name: string });

// your web route stamps who sent the input
Inbox.send(sessionId, {
  kind: "user_message",
  parts: [{ text: "Close this out" }],
  attributes: { [Actor]: { id: "u_42", name: "Sam" } },
});

// later, a tool reads it
Tools.add({
  name: "close_work_order",
  run: (input, ctx) => api.close(input.id, { as: ctx.get(Actor) }), // runs with Sam's permissions
});
```

The session stores the actor tag and returns it without knowing what an "actor" is. The loop follows one rule: a tool call carries the tags of the input that led to it. The log then shows "tool `close_work_order` ran for Sam."

Use Attach when you need to track who, what or why:

- Who sent this message (multiplayer).
- Which work order thread a session belongs to.
- Which model produced this assistant message, and its token usage.
- That a message came from a webhook instead of a person.

## Replace: swap a whole piece

Every base piece is a contract with one active implementation. Replace means providing a different implementation of the same contract.

```ts
// TUI: sessions in a local SQLite file
compose([agent(), sessionSqlite, modelAnthropic, tui]);

// Fargate: sessions in Postgres, shared across tasks
compose([agent(), sessionPostgres, modelAnthropic, http, workOrders]);

// Tests: a scripted model that replays canned replies
compose([agent(), sessionMemory, modelScripted(["Hi", toolCall("read", { path: "a.ts" })])]);
```

The loop calls `SessionLog.append(...)` and `Model.stream(...)` without knowing which implementation is behind them.

Use Replace when the whole thing needs to work differently: a different storage backend, a different turn loop, a fake model for tests, running file tools in a remote sandbox instead of on local disk.

## One turn, with all four in place

```text
Sam sends "close WO-881"         Attach: actor = Sam
        ↓
build request                    Add: sections (work order summary), tools (close_work_order)
        ↓
call model                       Wrap: retry, cache hints, usage
        ↓                        Replace: which model provider answers
assistant message → logged       Attach: model, token usage
        ↓
tool call close_work_order       Wrap: approval asks Sam, output truncation
        ↓                        reads Attach: runs as Sam
tool result → logged             Replace: which session store writes it
        ↓
loop again or end turn           Add: TurnEnd hook posts the reply into the chat thread
```

## Choosing one

| Question | Mechanism |
| --- | --- |
| Am I giving the agent something new? | Add |
| Am I changing how an existing step behaves? | Wrap |
| Do I need to label data so something later can read it? | Attach |
| Does the whole piece need to work differently? | Replace |
